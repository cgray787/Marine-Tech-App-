-- 015_orgs_locations.sql
-- Multi-location tenancy: Organization -> Location, with location-scoped RLS.
-- Staged: additive columns (Part A) -> seed/backfill (Part B) -> enforce + isolate (Part C).
-- Apply on a Supabase dev/branch first, verify isolation, then promote to prod.

-- =========================================================
-- Part A: additive schema (safe — nothing enforced yet)
-- =========================================================
create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  join_code text unique not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

alter table profiles  add column if not exists org_id uuid references organizations(id);
alter table profiles  add column if not exists location_id uuid references locations(id);
alter table customers add column if not exists org_id uuid references organizations(id);
alter table customers add column if not exists location_id uuid references locations(id);
alter table boats     add column if not exists org_id uuid references organizations(id);
alter table boats     add column if not exists location_id uuid references locations(id);
alter table jobs      add column if not exists org_id uuid references organizations(id);
alter table jobs      add column if not exists location_id uuid references locations(id);

create index if not exists idx_customers_location on customers(location_id);
create index if not exists idx_boats_location on boats(location_id);
create index if not exists idx_jobs_location on jobs(location_id);
create index if not exists idx_profiles_location on profiles(location_id);

-- =========================================================
-- Part B: seed Jeff Brown Yachts + 4 locations, backfill -> Seattle
-- =========================================================
do $$
declare org uuid; sea uuid;
begin
  if not exists (select 1 from organizations where name = 'Jeff Brown Yachts') then
    insert into organizations (name) values ('Jeff Brown Yachts') returning id into org;
    insert into locations (org_id, name) values (org, 'Sausalito'), (org, 'San Diego'), (org, 'Newport');
    insert into locations (org_id, name) values (org, 'Seattle') returning id into sea;

    update profiles set org_id = org, location_id = null, role = 'admin'
      where email = 'connorgray41@gmail.com';

    update customers set org_id = org, location_id = sea where location_id is null;
    update boats     set org_id = org, location_id = sea where location_id is null;
    update jobs      set org_id = org, location_id = sea where location_id is null;

    update profiles set org_id = org, location_id = sea where org_id is null;
  end if;
end $$;

-- =========================================================
-- Part C: enforce NOT NULL + location-scoped RLS + join RPC
-- =========================================================
alter table customers alter column location_id set not null;
alter table boats     alter column location_id set not null;
alter table jobs      alter column location_id set not null;
alter table profiles  alter column org_id      set not null;

-- accessible locations for the current auth user
create or replace function accessible_location_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select case
    when p.location_id is not null then p.location_id          -- tech: one location
    else l.id                                                  -- admin/owner: all org locations
  end
  from profiles p
  left join locations l on l.org_id = p.org_id and p.location_id is null
  where p.auth_id = auth.uid()
$$;

-- replace prior policies on tenant tables with location-scoped ones
do $$
declare t text;
begin
  foreach t in array array['customers', 'boats', 'jobs'] loop
    execute format('alter table %I enable row level security', t);
    -- drop common legacy policy names (confirm/extend against migrations 001-014)
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('drop policy if exists authenticated_read_%I on %I', t, t);
    execute format($f$create policy %1$I_select on %1$I for select using (location_id in (select accessible_location_ids()))$f$, t);
    execute format($f$create policy %1$I_write on %1$I for all using (location_id in (select accessible_location_ids())) with check (location_id in (select accessible_location_ids()))$f$, t);
  end loop;
end $$;

-- org/location visibility
alter table organizations enable row level security;
alter table locations enable row level security;
drop policy if exists org_read on organizations;
create policy org_read on organizations for select
  using (id in (select org_id from profiles where auth_id = auth.uid()));
drop policy if exists loc_read on locations;
create policy loc_read on locations for select
  using (org_id in (select org_id from profiles where auth_id = auth.uid()));
drop policy if exists loc_admin_write on locations;
create policy loc_admin_write on locations for all
  using (org_id in (select org_id from profiles where auth_id = auth.uid() and location_id is null))
  with check (org_id in (select org_id from profiles where auth_id = auth.uid() and location_id is null));

-- mobile: join a location by code (validates + stamps caller's profile)
create or replace function join_with_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare loc locations%rowtype;
begin
  select * into loc from locations where join_code = code;
  if not found then raise exception 'invalid join code'; end if;
  update profiles set org_id = loc.org_id, location_id = loc.id where auth_id = auth.uid();
  return loc.id;
end $$;
