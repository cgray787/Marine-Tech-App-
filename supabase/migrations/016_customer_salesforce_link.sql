-- 016_customer_salesforce_link.sql
-- Durable link from each app customer to its Salesforce Account record.
-- salesforce_account_id is the stable join key (survives name changes);
-- salesforce_url is the deep link the mobile app opens for full history.

alter table public.customers
  add column if not exists salesforce_account_id text,
  add column if not exists salesforce_url text;

create index if not exists customers_salesforce_account_id_idx
  on public.customers (salesforce_account_id);
