-- 033_work_orders.sql
-- Work Orders module: price levels, job templates, settings, work orders,
-- job sections, lines, payments. Spec: docs/superpowers/specs/2026-06-12-work-orders-design.md
-- Writes: admin + manager only (NOT tech). Reads: admins all, others location-scoped.

create sequence if not exists public.work_order_number_seq start 1001;

create table public.price_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null,
  rate numeric(10,2) not null default 0,
  unit text not null default 'hour' check (unit in ('hour','foot')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.job_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null,
  description text,
  notes_to_tech text,
  default_hours numeric(6,2),
  default_price_level_id uuid references public.price_levels(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.wo_settings (
  org_id uuid primary key references public.organizations(id),
  shop_supplies_amount numeric(10,2) not null default 75.00,
  default_margin_pct numeric(5,2) not null default 25.00,
  default_cc_fee_pct numeric(5,2) not null default 3.00,
  default_taxes jsonb not null default '[{"name":"WA Sales Tax","rate_pct":10.35}]'::jsonb
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  wo_number int unique not null default nextval('public.work_order_number_seq'),
  org_id uuid not null references public.organizations(id),
  location_id uuid references public.locations(id),
  customer_id uuid not null references public.customers(id) on delete restrict,
  boat_id uuid references public.boats(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','approved','completed','invoiced')),
  service_advisor uuid references public.profiles(id),
  wo_date date not null default current_date,
  default_margin_pct numeric(5,2) not null default 25.00,
  taxes jsonb not null default '[]'::jsonb,
  cc_fee_pct numeric(5,2),
  printed_notes text,
  internal_notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  invoiced_at timestamptz
);
create index work_orders_customer_idx on public.work_orders(customer_id);
create index work_orders_status_idx on public.work_orders(status);

create table public.work_order_jobs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  position int not null default 0,
  title text not null,
  description text,
  notes_to_tech text,
  cause text,
  correction text,
  customer_status text not null default 'estimate' check (customer_status in ('estimate','approved')),
  job_status text not null default 'open' check (job_status in ('open','awaiting_customer','in_progress','done')),
  job_type text not null default 'frh' check (job_type in ('frh','flat','per_foot')),
  price_level_id uuid references public.price_levels(id) on delete set null,
  hours numeric(6,2),
  flat_price numeric(10,2),
  boat_length_ft numeric(5,1),
  labor_taxable boolean not null default true,
  assigned_tech uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index wo_jobs_wo_idx on public.work_order_jobs(work_order_id);

create table public.work_order_lines (
  id uuid primary key default gen_random_uuid(),
  work_order_job_id uuid not null references public.work_order_jobs(id) on delete cascade,
  kind text not null check (kind in ('part','shop_supplies','shipping','flat_service','other')),
  item_code text,
  description text,
  qty numeric(8,2) not null default 1,
  unit_cost numeric(10,2) not null default 0,
  margin_pct numeric(5,2),
  taxable boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index wo_lines_job_idx on public.work_order_lines(work_order_job_id);

create table public.work_order_payments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  paid_on date not null default current_date,
  method text,
  note text,
  amount numeric(10,2) not null,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index wo_payments_wo_idx on public.work_order_payments(work_order_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Helper: only admin + manager may write work-order data (viewer and tech
-- are read-only here; pricing/margins are office business).
create or replace function public.wo_can_edit() returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles
    where auth_id = auth.uid() and role in ('admin','manager')
  );
$$;
revoke all on function public.wo_can_edit() from public, anon;
grant execute on function public.wo_can_edit() to authenticated;

alter table public.price_levels enable row level security;
alter table public.job_templates enable row level security;
alter table public.wo_settings enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_jobs enable row level security;
alter table public.work_order_lines enable row level security;
alter table public.work_order_payments enable row level security;

-- Reference data: all authenticated org members read; admin/manager write.
do $$
declare t text;
begin
  foreach t in array array['price_levels','job_templates','wo_settings'] loop
    execute format('create policy %I_read on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.wo_can_edit()) with check (public.wo_can_edit())', t, t);
  end loop;
end $$;

-- Work orders: admins read all; everyone else reads own-location WOs.
create policy wo_read on public.work_orders for select to authenticated
  using (public.is_admin() or location_id = public.current_profile_location());
create policy wo_write on public.work_orders for all to authenticated
  using (public.wo_can_edit()) with check (public.wo_can_edit());

-- Children follow the parent WO's visibility.
create policy wo_jobs_read on public.work_order_jobs for select to authenticated
  using (exists (select 1 from public.work_orders w where w.id = work_order_id
    and (public.is_admin() or w.location_id = public.current_profile_location())));
create policy wo_jobs_write on public.work_order_jobs for all to authenticated
  using (public.wo_can_edit()) with check (public.wo_can_edit());

create policy wo_lines_read on public.work_order_lines for select to authenticated
  using (exists (select 1 from public.work_order_jobs j join public.work_orders w on w.id = j.work_order_id
    where j.id = work_order_job_id
    and (public.is_admin() or w.location_id = public.current_profile_location())));
create policy wo_lines_write on public.work_order_lines for all to authenticated
  using (public.wo_can_edit()) with check (public.wo_can_edit());

create policy wo_payments_read on public.work_order_payments for select to authenticated
  using (exists (select 1 from public.work_orders w where w.id = work_order_id
    and (public.is_admin() or w.location_id = public.current_profile_location())));
create policy wo_payments_write on public.work_order_payments for all to authenticated
  using (public.wo_can_edit()) with check (public.wo_can_edit());

-- ── Seeds ────────────────────────────────────────────────────────────────
do $$
declare
  v_org uuid;
  v_pl uuid;
begin
  select id into v_org from public.organizations limit 1;
  if v_org is null then return; end if;

  insert into public.wo_settings (org_id) values (v_org) on conflict do nothing;

  insert into public.price_levels (org_id, name, rate, unit)
  values (v_org, 'Seattle - Standard Pricing', 175.00, 'hour')
  returning id into v_pl;

  insert into public.job_templates (org_id, name, description, default_hours, default_price_level_id) values
    (v_org, 'Engine Service 100 Hour 200 HP V6 2025', 'Single - 100 Hour - 200 HP V6 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 250 R V8 2025', 'Single - 100 Hour - 250 R V8 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 300 HP V8 2025', 'Single - 100 Hour - 300 HP V8 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 350 HP L6 2025', 'Single - 100 Hour - 350 HP L6 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 350/400 HP V10 2025', 'Single - 100 Hour 350/450 HP V10 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 450 R V8 2025', 'Single - 100 Hour - 450 R V8 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 300 Hour 200 HP V6 2025', 'Single - 300 Hour - 200 HP V6 Engine Service', 5.00, v_pl),
    (v_org, 'Engine Service 300 Hour 250 R V8 2025', 'Single - 300 Hour - 250R V8 Engine Service', 5.00, v_pl),
    (v_org, 'Engine Service 300 Hour 300 HP V8 2025', 'Single - 300 Hour - 300HP V8 Engine Service', 5.00, v_pl),
    (v_org, 'Engine Service 300 Hour 350 HP L6 2025', 'Single - 300 Hour - 350 HP L6 Engine Service', 5.00, v_pl),
    (v_org, '28 Axopar Ceramic Coat', 'Top side Ceramic Coat applied to boat - 28', 20.00, v_pl),
    (v_org, '37 Axopar Ceramic Coat', 'Top side Ceramic Coat applied to boat - 37', 28.00, v_pl),
    (v_org, 'Travel Fee', 'Travel to/from vessel', 2.00, v_pl),
    (v_org, 'Install Transducer', 'Transducer install', 8.00, v_pl),
    (v_org, 'Boat Wash', 'Exterior boat wash', 1.00, v_pl);
end $$;
