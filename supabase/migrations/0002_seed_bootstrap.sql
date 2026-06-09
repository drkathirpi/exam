-- ============================================================================
-- MRCPCH LMS — Migration 0002 (seed + bootstrap)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Singleton AI settings row (AI disabled until a super admin turns it on)
-- ---------------------------------------------------------------------------
insert into public.ai_settings (id, ai_enabled, gemini_model)
values (1, false, 'gemini-2.0-flash')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. OPTIONAL: Storage bucket for archived/exported bank JSON.
--    Skip this block if you don't need server-side archives at <10 users.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bank-archives', 'bank-archives', false)
on conflict (id) do nothing;

create policy bank_archives_staff_all on storage.objects
  for all
  using  (bucket_id = 'bank-archives' and public.is_staff())
  with check (bucket_id = 'bank-archives' and public.is_staff());

-- ============================================================================
-- 3. MANUAL BOOTSTRAP STEPS  (run once, in order — NOT part of automated SQL)
-- ============================================================================
--
-- a) DISABLE PUBLIC SIGN-UPS
--    Supabase Dashboard > Authentication > Providers > Email:
--    turn OFF "Enable Sign Ups". All accounts are created by the
--    admin-users Edge Function (Phase 3+). The handle_new_user trigger
--    forces 'student' for any non-service_role insert as defence-in-depth.
--
-- b) CREATE THE FIRST SUPER ADMIN
--    1. Create one user in Dashboard > Authentication > Users (Add user).
--    2. Copy that user's UUID and promote it:
--
--         update public.profiles
--         set role = 'super_admin'
--         where id = 'PASTE-AUTH-USER-UUID-HERE';
--
-- c) STORE THE GEMINI API KEY IN VAULT (never in a normal table)
--    The ai-proxy Edge Function reads it via the service_role. Set it once
--    from the SQL editor (or rotate later):
--
--         select vault.create_secret('YOUR_GEMINI_KEY', 'gemini_api_key',
--                                     'Gemini API key for ai-proxy');
--
--    To rotate, read the existing id from vault.secrets and call
--    vault.update_secret(...). The key is readable only through
--    vault.decrypted_secrets, which is restricted to the service_role.
--
-- d) EDGE FUNCTION SECRETS (set in Phase 3+ when functions are deployed)
--       supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   (admin-users)
--    The Gemini key is read from Vault by ai-proxy, so it is NOT duplicated here.
-- ============================================================================
