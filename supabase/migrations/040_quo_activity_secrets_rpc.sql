-- 040_quo_activity_secrets_rpc.sql
-- Read-only accessor the quo-activity-log edge function uses to fetch its three
-- runtime secrets from Vault:
--   sf_refresh_token  — Salesforce OAuth refresh token (shared with salesforce-sync)
--   sf_sync_secret    — shared header secret for x-sync-secret auth (shared w/ salesforce-sync)
--   quo_api_key       — OpenPhone (Quo) API key (value on Connor's Notion "API keys" page)
--
-- SECURITY DEFINER so it can read vault.decrypted_secrets; locked to service_role
-- only (the edge function calls it with the service-role key). Mirrors
-- 022_salesforce_sync_secrets_rpc.sql.
--
-- This migration does NOT insert any secret values. `sf_refresh_token` and
-- `sf_sync_secret` already exist in Vault (seeded for salesforce-sync); the
-- `quo_api_key` secret must be seeded into Vault separately before the function
-- can authenticate to Quo.

create or replace function public.quo_activity_secrets()
returns jsonb
language sql
security definer
set search_path = public, vault
as $$
  select jsonb_build_object(
    'sf_refresh_token', (select decrypted_secret from vault.decrypted_secrets where name = 'sf_refresh_token'),
    'sf_sync_secret',   (select decrypted_secret from vault.decrypted_secrets where name = 'sf_sync_secret'),
    'quo_api_key',      (select decrypted_secret from vault.decrypted_secrets where name = 'quo_api_key')
  );
$$;

revoke all on function public.quo_activity_secrets() from public, anon, authenticated;
grant execute on function public.quo_activity_secrets() to service_role;
