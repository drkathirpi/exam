-- ============================================================================
-- MRCPCH LMS — Migration 0005 (AI key handling)
-- The Gemini key lives in Vault. The super admin sets it from the UI via
-- set_ai_key(); the browser can check presence via ai_key_present() but can
-- never read it. Only the service_role (the ai-proxy function) can read it.
-- ============================================================================

-- Write / rotate the key (super admin only)
create or replace function public.set_ai_key(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Not permitted';
  end if;
  if p_key is null or length(btrim(p_key)) = 0 then
    raise exception 'Key is required';
  end if;
  select id into v_id from vault.secrets where name = 'gemini_api_key';
  if v_id is null then
    perform vault.create_secret(p_key, 'gemini_api_key', 'Gemini API key for ai-proxy');
  else
    perform vault.update_secret(v_id, p_key);
  end if;
end;
$$;
grant execute on function public.set_ai_key(text) to authenticated;

-- Presence check (no secret exposed) — any signed-in user may call
create or replace function public.ai_key_present()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.secrets where name = 'gemini_api_key');
$$;
grant execute on function public.ai_key_present() to authenticated;

-- Read the key — restricted to the service_role (used by the ai-proxy function)
create or replace function public.get_ai_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gemini_api_key';
$$;
revoke all on function public.get_ai_key() from public, anon, authenticated;
grant execute on function public.get_ai_key() to service_role;
