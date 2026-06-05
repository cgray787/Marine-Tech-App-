-- 025_parts.sql
-- Parts a technician needs ordered for a service job. Surfaced on the dashboard
-- "Parts to Order" section. org_id is set server-side (cannot be client-supplied).

create table if not exists public.parts (
  id                 uuid primary key default gen_random_uuid(),
  service_report_id  uuid references public.service_reports(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete set null,
  customer_id        uuid references public.customers(id) on delete set null,
  boat_id            uuid references public.boats(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  org_id             uuid references public.organizations(id) on delete set null,
  name               text not null,
  part_number        text,
  quantity           integer not null default 1,
  description        text,
  supplier           text,
  url                text,
  photo_url          text,
  status             text not null default 'need_to_order'
                       check (status in ('need_to_order','ordered')),
  ordered_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists parts_status_idx on public.parts (status);
create index if not exists parts_customer_idx on public.parts (customer_id);
create index if not exists parts_org_idx on public.parts (org_id);

-- Caller's org (SECURITY DEFINER so RLS policies can use it without recursion).
create or replace function public.current_profile_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where auth_id = auth.uid();
$$;

-- Assign org_id from the inserting tech's profile; never trust a client value.
create or replace function public.set_part_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.org_id := public.current_profile_org();
  return new;
end;
$$;

drop trigger if exists set_part_org_before_insert on public.parts;
create trigger set_part_org_before_insert
  before insert on public.parts
  for each row execute function public.set_part_org();

alter table public.parts enable row level security;

drop policy if exists parts_select on public.parts;
create policy parts_select on public.parts
  for select to authenticated
  using (org_id = public.current_profile_org() or public.is_admin());

drop policy if exists parts_insert on public.parts;
create policy parts_insert on public.parts
  for insert to authenticated
  with check (created_by = public.current_profile_id());

drop policy if exists parts_update on public.parts;
create policy parts_update on public.parts
  for update to authenticated
  using (org_id = public.current_profile_org() or public.is_admin())
  with check (org_id = public.current_profile_org() or public.is_admin());

drop policy if exists parts_delete on public.parts;
create policy parts_delete on public.parts
  for delete to authenticated
  using (created_by = public.current_profile_id() or public.is_admin());

revoke all on function public.current_profile_org() from public, anon;
grant execute on function public.current_profile_org() to authenticated;
