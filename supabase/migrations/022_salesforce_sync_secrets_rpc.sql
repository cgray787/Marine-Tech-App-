-- 022_salesforce_sync_secrets_rpc.sql
-- Read-only accessor the salesforce-sync edge function uses to fetch its two
-- runtime secrets from Vault: the Salesforce OAuth refresh token and the shared
-- sync secret. SECURITY DEFINER so it can read vault.decrypted_secrets; locked to
-- service_role only (the edge function calls it with the service-role key).
--
-- The non-sensitive Salesforce config (client id "PlatformCLI", instance URL,
-- RecordType/Owner ids, JBY org id) lives as constants/env defaults in the edge
-- function, not here.

create or replace function public.salesforce_sync_secrets()
returns jsonb
language sql
security definer
set search_path = public, vault
as $$
  select jsonb_build_object(
    'refresh_token', (select decrypted_secret from vault.decrypted_secrets where name = 'sf_refresh_token'),
    'sync_secret',   (select decrypted_secret from vault.decrypted_secrets where name = 'sf_sync_secret')
  );
$$;

revoke all on function public.salesforce_sync_secrets() from public, anon, authenticated;
grant execute on function public.salesforce_sync_secrets() to service_role;
