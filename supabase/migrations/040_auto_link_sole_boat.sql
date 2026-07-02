-- 040_auto_link_sole_boat.sql
-- Cross-section boat sync. Jobs and work orders reference boats by boat_id,
-- but the link was only ever set at creation time: adding a boat to a client
-- afterward left their existing jobs/WOs rendering "No boat" on every surface
-- (admin dashboard, portal, mobile). Fix at the data layer so all three UIs
-- and already-shipped mobile builds behave identically:
--   1. btrim boat name/make_model on write (" Axopar 37 XC" rendered everywhere)
--   2. adding a customer's FIRST boat links their boat-less jobs + work orders
--   3. new jobs/WOs with no boat default to the customer's sole boat; changing
--      a job's customer clears a boat that doesn't belong to the new customer
--   4. one-time backfill of existing unlinked rows
-- Only the sole-boat case is auto-linked; multi-boat customers stay a human
-- decision. Paperwork blocks (jobs.kind='paperwork') carry no boat by design.

-- 1) Trim boat text fields on write.
create or replace function public.trim_boat_fields()
returns trigger
language plpgsql
as $$
begin
  new.name := nullif(btrim(new.name), '');
  new.make_model := nullif(btrim(new.make_model), '');
  return new;
end;
$$;

drop trigger if exists boats_trim_fields on public.boats;
create trigger boats_trim_fields
  before insert or update on public.boats
  for each row execute function public.trim_boat_fields();

-- 2) First boat added to a customer -> link their boat-less jobs and WOs.
-- SECURITY DEFINER: the backfill is an integrity action, not a user privilege;
-- it must apply even when the inserting user can't update every affected row.
create or replace function public.link_new_boat_to_boatless_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is null then
    return new;
  end if;
  -- AFTER INSERT: count includes the new boat, so 1 means it's the only one.
  if (select count(*) from boats where customer_id = new.customer_id) = 1 then
    update jobs
       set boat_id = new.id, updated_at = now()
     where customer_id = new.customer_id
       and boat_id is null
       and coalesce(kind, 'service') <> 'paperwork';
    update work_orders
       set boat_id = new.id, updated_at = now()
     where customer_id = new.customer_id
       and boat_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists boats_link_boatless_records on public.boats;
create trigger boats_link_boatless_records
  after insert on public.boats
  for each row execute function public.link_new_boat_to_boatless_records();

-- 3) Default boat on jobs/work_orders writes. Shared across both tables;
-- jobs-only columns are read via to_jsonb so the function stays generic.
create or replace function public.default_boat_from_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  boat_count int;
  sole_boat uuid;
begin
  if coalesce(to_jsonb(new)->>'kind', 'service') = 'paperwork' then
    return new;
  end if;
  -- Customer changed: drop a boat that doesn't belong to the new customer.
  if tg_op = 'UPDATE'
     and new.customer_id is distinct from old.customer_id
     and new.boat_id is not null
     and not exists (
       select 1 from boats where id = new.boat_id and customer_id = new.customer_id
     ) then
    new.boat_id := null;
  end if;
  if new.boat_id is not null or new.customer_id is null then
    return new;
  end if;
  select count(*), min(id::text)::uuid
    into boat_count, sole_boat
    from boats
   where customer_id = new.customer_id;
  if boat_count = 1 then
    new.boat_id := sole_boat;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_default_boat on public.jobs;
create trigger jobs_default_boat
  before insert or update of customer_id on public.jobs
  for each row execute function public.default_boat_from_customer();

drop trigger if exists work_orders_default_boat on public.work_orders;
create trigger work_orders_default_boat
  before insert or update of customer_id on public.work_orders
  for each row execute function public.default_boat_from_customer();

-- 4) One-time backfill of existing rows.
update jobs j
   set boat_id = b.id, updated_at = now()
  from boats b
 where j.boat_id is null
   and coalesce(j.kind, 'service') <> 'paperwork'
   and b.customer_id = j.customer_id
   and (select count(*) from boats b2 where b2.customer_id = j.customer_id) = 1;

update work_orders w
   set boat_id = b.id, updated_at = now()
  from boats b
 where w.boat_id is null
   and b.customer_id = w.customer_id
   and (select count(*) from boats b2 where b2.customer_id = w.customer_id) = 1;

update boats
   set name = btrim(name), make_model = btrim(make_model)
 where name is distinct from btrim(name)
    or make_model is distinct from btrim(make_model);
