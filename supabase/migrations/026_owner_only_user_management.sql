-- 026_owner_only_user_management.sql
-- Defense in depth for the Technicians (Users & Access) page. The UI already
-- hides this surface from non-owners (lib/owner.ts), but the previous version
-- of admin_set_user_role / admin_delete_user only required is_admin() — which
-- means a hostile admin (Darik) with the Supabase anon key could call the
-- RPCs directly and bypass the UI.
--
-- This migration:
--   1. Adds is_owner() — mirror of the dashboard's lib/owner.ts allowlist.
--   2. Re-gates both RPCs on is_owner() instead of is_admin().
-- Connor (and only Connor) keeps the ability to change roles or delete users.
-- Every other admin gets "forbidden" at the database layer.

-- ── is_owner() ────────────────────────────────────────────────────────────────
-- Keep in sync with lib/owner.ts. If you add an owner email or auth_id there,
-- add it here too — both sides must agree.

create or replace function public.is_owner() returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select
        lower(coalesce(email, '')) in (
          'connorgray@jeffbrownyachts.com',
          'connorgray41@gmail.com',
          'xv2hp9sc2j@privaterelay.appleid.com'
        )
        or id::text = 'ec4c6451-623a-4a41-9dde-0cd48afc767d'
      from auth.users
      where id = auth.uid()
      limit 1
    ),
    false
  );
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- ── admin_set_user_role: now owner-only ─────────────────────────────────────
-- Same signature + body as migration 024 except the first check is is_owner().
-- All other safety rails preserved (can't change own role, validates role
-- enum, raises 'user not found' on no-op).

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
  if new_role not in ('admin', 'tech', 'viewer') then
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

-- ── admin_delete_user: now owner-only ───────────────────────────────────────

create or replace function public.admin_delete_user(target_profile uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_auth uuid;
begin
  if not public.is_owner() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select auth_id into v_auth from public.profiles where id = target_profile;
  if not found then
    raise exception 'user not found';
  end if;
  if v_auth = me then
    raise exception 'cannot delete your own account';
  end if;

  -- Legacy push-notifications table has a NO ACTION FK to profiles; clear it first.
  delete from public.notifications where user_id = target_profile;
  delete from public.profiles where id = target_profile;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;
end;
$$;

-- Grants are unchanged from 024 (still callable by `authenticated` role at
-- the Postgres level; the internal is_owner() check is what does the real
-- enforcement).
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
