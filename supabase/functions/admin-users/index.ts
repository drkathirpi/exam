// supabase/functions/admin-users/index.ts
//
// Privileged user-management endpoint. The service_role key lives ONLY here
// (injected by the Supabase runtime) and never reaches the browser.
//
// Every request is authorised twice:
//   1) the caller's JWT must resolve to a real user, and
//   2) that user's profile role must be staff (admin / super_admin).
// Creating or modifying staff accounts additionally requires super_admin.
//
// Actions: create | bulk_create | reset_password | set_disabled | delete
//
// Deploy:  supabase functions deploy admin-users
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are auto-provided.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type Role = 'super_admin' | 'admin' | 'student';

interface NewUser {
  email: string;
  password: string;
  role?: Role;
  display_name?: string;
  username?: string;
  is_guest?: boolean;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // --- 1. Identify the caller from their JWT ------------------------------
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) return json({ error: 'Not signed in' }, 401);

    // --- 2. Confirm the caller is staff (service-role read) -----------------
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    const callerRole = callerProfile?.role as Role | undefined;
    const callerIsStaff = callerRole === 'admin' || callerRole === 'super_admin';
    const callerIsSuper = callerRole === 'super_admin';
    if (!callerIsStaff) return json({ error: 'Not permitted' }, 403);

    const { action, payload } = (await req.json()) as {
      action: string;
      payload: Record<string, unknown>;
    };

    // Helper: create one auth user. Role is trusted because this runs as
    // service_role, so the handle_new_user trigger will honour the metadata.
    async function createOne(u: NewUser) {
      const requestedRole: Role = u.role ?? 'student';
      // Only a super_admin may mint staff accounts; admins can only make students/guests.
      const role: Role =
        requestedRole === 'student' ? 'student' : callerIsSuper ? requestedRole : 'student';

      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: {
          role,
          display_name: u.display_name ?? null,
          username: u.username ?? null,
          is_guest: u.is_guest ?? false,
          created_by: caller.id,
        },
      });
      if (error) return { email: u.email, ok: false, error: error.message };
      return { email: u.email, ok: true, id: data.user?.id, role };
    }

    // Helper: confirm the target is not staff unless caller is super_admin.
    async function targetIsModifiable(userId: string): Promise<boolean> {
      if (callerIsSuper) return true;
      const { data } = await admin.from('profiles').select('role').eq('id', userId).single();
      const r = data?.role as Role | undefined;
      return r === 'student';
    }

    switch (action) {
      case 'create': {
        const result = await createOne(payload as unknown as NewUser);
        return result.ok ? json(result) : json(result, 400);
      }

      case 'bulk_create': {
        const users = (payload.users ?? []) as NewUser[];
        if (!Array.isArray(users) || users.length === 0)
          return json({ error: 'No users supplied' }, 400);
        const results = [];
        for (const u of users) results.push(await createOne(u));
        return json({ created: results.filter((r) => r.ok).length, results });
      }

      case 'reset_password': {
        const userId = String(payload.user_id ?? '');
        const newPassword = String(payload.new_password ?? '');
        if (!userId || newPassword.length < 8)
          return json({ error: 'A user and a password of at least 8 characters are required' }, 400);
        if (!(await targetIsModifiable(userId))) return json({ error: 'Not permitted' }, 403);
        const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
        return error ? json({ error: 'Could not reset password' }, 400) : json({ ok: true });
      }

      case 'set_disabled': {
        const userId = String(payload.user_id ?? '');
        const disabled = Boolean(payload.disabled);
        if (!userId) return json({ error: 'A user is required' }, 400);
        if (!(await targetIsModifiable(userId))) return json({ error: 'Not permitted' }, 403);
        await admin.from('profiles').update({ disabled }).eq('id', userId);
        // Also ban at the auth layer so existing sessions cannot refresh.
        await admin.auth.admin.updateUserById(userId, {
          ban_duration: disabled ? '876000h' : 'none',
        });
        return json({ ok: true, disabled });
      }

      case 'delete': {
        const userId = String(payload.user_id ?? '');
        if (!userId) return json({ error: 'A user is required' }, 400);
        if (!(await targetIsModifiable(userId))) return json({ error: 'Not permitted' }, 403);
        const { error } = await admin.auth.admin.deleteUser(userId);
        return error ? json({ error: 'Could not delete user' }, 400) : json({ ok: true });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (_err) {
    // Never leak raw internals to the client.
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
