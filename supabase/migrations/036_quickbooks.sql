-- 036_quickbooks.sql
-- QuickBooks Online integration: connection credentials + WO invoice tracking.
-- Tokens are stored service-role-only by design — NO RLS policies on qb_connections,
-- so only the service-role client (server-side route handlers) can read/write them.
-- Client UI talks only to /api/quickbooks/* — never to Supabase directly for QB data.

create table public.qb_connections (
  org_id uuid primary key references public.organizations(id),
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  company_name text,
  connected_by uuid references public.profiles(id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.qb_connections enable row level security;
-- NO policies: service-role only

alter table public.work_orders
  add column quickbooks_invoice_id text,
  add column quickbooks_synced_at timestamptz;
