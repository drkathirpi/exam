import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Falls back to harmless placeholders so createClient never throws at import.
// When env.isConfigured is false the app shows a setup screen and never calls this.
export const supabase = createClient(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'public-anon-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // we use HashRouter; avoid hash-fragment conflicts
    },
  },
);
