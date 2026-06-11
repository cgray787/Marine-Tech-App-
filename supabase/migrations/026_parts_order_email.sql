-- 026_parts_order_email.sql
-- Phase 2 of parts-to-order: email Connor one message per service-report
-- submission listing the parts to order. A pg_cron job pings the
-- `parts-order-email` edge function every 2 min; the function emails any
-- un-notified need_to_order parts (grouped by report) via Resend, then stamps
-- notified_at so each is sent once.

alter table public.parts
  add column if not exists notified_at timestamptz;

create extension if not exists pg_cron;

-- Service-role-only accessor for the function's secrets (Resend key + cron secret).
create or replace function public.parts_email_secrets()
returns jsonb
language sql
security definer
set search_path = public, vault
as $$
  select jsonb_build_object(
    'resend_key',  (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key'),
    'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'parts_email_secret')
  );
$$;

revoke all on function public.parts_email_secrets() from public, anon, authenticated;
grant execute on function public.parts_email_secrets() to service_role;

-- Every 2 minutes, ping the edge function (reads the cron secret from Vault).
select cron.schedule(
  'parts-order-email',
  '*/2 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ikfcnqdrlvhvlyhiuphs.supabase.co/functions/v1/parts-order-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'parts_email_secret')
      ),
      body := '{}'::jsonb
    );
  $cron$
);
