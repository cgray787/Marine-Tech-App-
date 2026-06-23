-- 041_quo_activity_log_cron_APPLY_LAST.sql
--
-- ⚠️ APPLY THIS LAST — only after the Ed/Charlie dry-run + live-run have been
-- reviewed and approved. It turns the quo-activity-log function on autopilot.
--
-- Schedules a daily pg_cron job that POSTs the quo-activity-log edge function at
-- 13:13 UTC (= ~6:13am PT) with an empty body, which makes the function default
-- its date to the prior calendar day in America/Los_Angeles. The shared sync
-- secret is read from Vault and sent as the x-sync-secret header (the function
-- authenticates against the same secret via quo_activity_secrets()).
--
-- Mirrors the pg_cron + pg_net pattern in 026_parts_order_email.sql.
--
-- Prereqs before applying:
--   1. `quo_api_key` seeded in Vault.
--   2. The quo-activity-log edge function deployed (verify_jwt=false).
--   3. Migration 040 (quo_activity_secrets RPC) applied.
--   4. Dry-run + live-run on Ed/Charlie reviewed and approved.

create extension if not exists pg_cron;

select cron.schedule(
  'quo-activity-log',
  '13 13 * * *',
  $cron$
    select net.http_post(
      url := 'https://ikfcnqdrlvhvlyhiuphs.supabase.co/functions/v1/quo-activity-log',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sf_sync_secret')
      ),
      body := '{}'::jsonb
    );
  $cron$
);
