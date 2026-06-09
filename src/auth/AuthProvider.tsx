import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppRole, Profile } from '@/types/database';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

// User-facing message; never leaks raw provider errors.
function friendlySignInError(code: string | undefined): string {
  if (code === 'invalid_credentials') return 'Email or password is incorrect.';
  if (code === 'email_not_confirmed') return 'This account is not active yet.';
  return 'We could not sign you in. Try again in a moment.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name, username, disabled')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data as Profile;
  }, []);

  // Resolve session -> profile. Disabled accounts are signed straight back out.
  const resolve = useCallback(
    async (nextSession: Session | null) => {
      if (!nextSession) {
        if (mounted.current) {
          setSession(null);
          setProfile(null);
        }
        return;
      }
      const p = await loadProfile(nextSession.user.id);
      if (!mounted.current) return;
      if (p?.disabled) {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        return;
      }
      setSession(nextSession);
      setProfile(p);
    },
    [loadProfile],
  );

  useEffect(() => {
    mounted.current = true;
    supabase.auth
      .getSession()
      .then(({ data }) => resolve(data.session))
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      void resolve(s);
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [resolve]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: friendlySignInError((error as { code?: string }).code) };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ loading, session, profile, role: profile?.role ?? null, signIn, signOut }),
    [loading, session, profile, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
