-- 041_boat_link_hardening.sql
-- Hermes cross-agent audit follow-ups on migration 040 (all four findings verified):
--  1. per-customer advisory lock around sole-boat decisions — two concurrent
--     first-boat inserts could each see count(*) = 1 under READ COMMITTED and
--     both auto-link even though the customer ends up with two boats
--  2. reconcile links when a boat changes owner or is deleted, not just on insert
--  3. the work_orders auto-link now honors the module's write boundary: end-user
--     paths require wo_can_edit() (admin/manager); system paths (auth.uid() is
--     null: service role, migrations, seeds) are trusted integrity actions
--  4. revoke default EXECUTE on the trigger functions (house style, cf. 023/035)

-- Single shared reconciler: if the customer has exactly one boat, link their
-- boat-less jobs (+ work orders where permitted).
create or replace function public.reconcile_customer_sole_boat(cust uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  boat_count int;
  sole_boat uuid;
begin
  if cust is null then
    return;
  end if;
  -- Serialize sole-boat decisions per customer (finding 1).
  perform pg_advisory_xact_lock(hashtextextended('sole-boat:' || cust::text, 0));
  select count(*), min(id::text)::uuid
    into boat_count, sole_boat
    from boats
   where customer_id = cust;
  if boat_count <> 1 then
    return;
  end if;
  update jobs
     set boat_id = sole_boat, updated_at = now()
   where customer_id = cust
     and boat_id is null
     and coalesce(kind, 'service') <> 'paperwork';
  -- WO writes are admin/manager-only; a tech's boat insert must not mutate
  -- work orders through the definer (finding 3).
  if auth.uid() is null or public.wo_can_edit() then
    update work_orders
       set boat_id = sole_boat, updated_at = now()
     where customer_id = cust
       and boat_id is null;
  end if;
end;
$$;

-- 040's AFTER INSERT trigger function now delegates to the reconciler.
create or replace function public.link_new_boat_to_boatless_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reconcile_customer_sole_boat(new.customer_id);
  return new;
end;
$$;

-- Boat moved to another customer (REST/SQL only today — no UI flow): detach it
-- from records still pointing at it under a different customer, then re-evaluate
-- the sole-boat rule on both sides (finding 2).
create or replace function public.boat_owner_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is distinct from old.customer_id then
    update jobs
       set boat_id = null, updated_at = now()
     where boat_id = new.id
       and customer_id is distinct from new.customer_id;
    if auth.uid() is null or public.wo_can_edit() then
      update work_orders
         set boat_id = null, updated_at = now()
       where boat_id = new.id
         and customer_id is distinct from new.customer_id;
    end if;
    perform public.reconcile_customer_sole_boat(old.customer_id);
    perform public.reconcile_customer_sole_boat(new.customer_id);
  end if;
  return new;
end;
$$;

drop trigger if exists boats_owner_changed on public.boats;
create trigger boats_owner_changed
  after update of customer_id on public.boats
  for each row execute function public.boat_owner_changed();

-- Deleting a boat can leave the customer with exactly one — link it (finding 2).
create or replace function public.boat_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reconcile_customer_sole_boat(old.customer_id);
  return old;
end;
$$;

drop trigger if exists boats_deleted on public.boats;
create trigger boats_deleted
  after delete on public.boats
  for each row execute function public.boat_deleted();

-- Close the same race on the insert-time default: a job/WO insert racing the
-- customer's first-boat insert serializes on the same per-customer lock.
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
  perform pg_advisory_xact_lock(hashtextextended('sole-boat:' || new.customer_id::text, 0));
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

-- Finding 4: house-style privilege hygiene (040 omitted these).
revoke all on function public.reconcile_customer_sole_boat(uuid) from public, anon, authenticated;
revoke all on function public.link_new_boat_to_boatless_records() from public, anon, authenticated;
revoke all on function public.default_boat_from_customer() from public, anon, authenticated;
revoke all on function public.boat_owner_changed() from public, anon, authenticated;
revoke all on function public.boat_deleted() from public, anon, authenticated;
revoke all on function public.trim_boat_fields() from public, anon, authenticated;
