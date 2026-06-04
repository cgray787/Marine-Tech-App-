-- 021_customers_salesforce_sync_trigger.sql
-- On INSERT of a JBY, not-yet-linked customer, fire an async pg_net POST to the
-- salesforce-sync edge function. Async => never blocks/fails the client insert.
-- The shared secret is read from Vault (not stored in this migration).

create extension if not exists pg_net;

create or replace function public.sync_customer_to_salesforce()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  sync_secret text;
begin
  -- Gate: only Jeff Brown Yachts org, only rows not already linked.
  if new.org_id is distinct from 'e22d5492-3ec1-4d5c-9118-b2eba8880586'::uuid then
    return new;
  end if;
  if new.salesforce_account_id is not null then
    return new;
  end if;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'sf_sync_secret'
  limit 1;

  perform net.http_post(
    url := 'https://ikfcnqdrlvhvlyhiuphs.supabase.co/functions/v1/salesforce-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', coalesce(sync_secret, '')
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', row_to_json(new)
    )
  );

  return new;
end;
$$;

drop trigger if exists customer_salesforce_sync on public.customers;
create trigger customer_salesforce_sync
  after insert on public.customers
  for each row
  execute function public.sync_customer_to_salesforce();
