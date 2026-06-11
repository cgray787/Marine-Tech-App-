-- 020_customers_salesforce_synced_at.sql
-- Observability for the Salesforce auto-link: records when a customer was last
-- pushed to Salesforce. A null salesforce_account_id still means "not synced".

alter table public.customers
  add column if not exists salesforce_synced_at timestamptz;

comment on column public.customers.salesforce_synced_at is
  'When this customer was last synced to Salesforce by the salesforce-sync edge function';
