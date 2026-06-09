// Reads public build-time config. Never throws at import time so the app can
// render a friendly "not configured" screen instead of a blank page.
const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  isConfigured: Boolean(url && anonKey),
};
