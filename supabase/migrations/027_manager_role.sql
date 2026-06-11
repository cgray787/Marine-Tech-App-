-- 027_manager_role.sql
-- Adds a `manager` role between admin and tech. A manager has the same SQL
-- footprint as a shop-tier tech (location-scoped read + write) but is named
-- explicitly so the operator can identify the person who runs a given office.
-- Promoting a teammate to manager is how you delegate Seattle/Sausalito/etc.
-- without giving them owner-level abilities (user management stays on Connor
-- per migration 026).
--
-- Also fixes a latent gap in migration 018: shop UPDATE/DELETE were added for
-- customers + boats but NOT for jobs. That's why Derik (currently
-- tier=shop + role=tech + Seattle) can read every Seattle job but only edit
-- the ones he created. With this migration, every shop user (tech AND
-- manager) can edit any job in their location.

-- ── 1. Extend the role enum ─────────────────────────────────────────────────
-- profiles.role CHECK constraint currently allows ('admin','tech','viewer').
-- We need to land 'manager' before the UPDATE further down can succeed.

-- Live constraint already accepts 'owner' from earlier work — preserve it so
-- a future migration that uses role='owner' doesn't have to re-add the value.
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'tech', 'viewer', 'owner'));

-- ── 2. is_manager() helper ──────────────────────────────────────────────────
-- Mirrors public.is_admin() shape. Stable + SECURITY DEFINER so RLS can call
-- it without recursion or extra round-trips.

create or replace function public.is_manager() returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles
    where auth_id = auth.uid() and role = 'manager'
  );
$$;

revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

-- ── 3. Fix the missing shop UPDATE/DELETE policies for jobs ─────────────────
-- Symmetric to shop_update_boats / shop_delete_boats from migration 018.
-- A shop user (tech OR manager) can mutate any job tied to a customer in
-- their location. The owner + admin paths remain through their own policies.

drop policy if exists shop_update_jobs on public.jobs;
create policy shop_update_jobs on public.jobs for update
  using (
    public.current_profile_tier() = 'shop'
    and public.customer_in_my_location(customer_id)
  )
  with check (
    public.current_profile_tier() = 'shop'
    and public.customer_in_my_location(customer_id)
  );

drop policy if exists shop_delete_jobs on public.jobs;
create policy shop_delete_jobs on public.jobs for delete
  using (
    public.current_profile_tier() = 'shop'
    and public.customer_in_my_location(customer_id)
  );

-- ── 4. admin_set_user_role accepts 'manager' ────────────────────────────────
-- Migration 026 hard-codes the allowed role list in the RPC body; widening
-- it here so owners can promote teammates to Manager from the dashboard.

create or replace function public.admin_set_user_role(target_profile uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if not public.is_owner() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if new_role not in ('admin', 'manager', 'tech', 'viewer') then
    raise exception 'invalid role: %', new_role;
  end if;
  if exists (select 1 from public.profiles where id = target_profile and auth_id = me) then
    raise exception 'cannot change your own role';
  end if;
  update public.profiles set role = new_role where id = target_profile;
  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

-- ── 5. Promote Derik to Manager ─────────────────────────────────────────────
-- One-off backfill. Idempotent — the WHERE clause locks to Derik's auth_id
-- (per profiles.auth_id = 657000b6-...). Safe to re-run.

update public.profiles
  set role = 'manager'
  where auth_id = '657000b6-6c4c-4dcd-b115-f84048fb677d'
    and role <> 'manager';
