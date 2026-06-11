-- 024_admin_user_management.sql
-- Admin-only RPCs to change a user's role and to permanently delete a user from
-- the dashboard. Both verify is_admin() and refuse to act on the caller's own
-- account. Granted to `authenticated` but gated internally (not to anon).

-- Change a user's role (admin/tech/viewer). Cannot change your own role.
create or replace function public.admin_set_user_role(target_profile uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if not public.is_admin() then
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

-- Permanently delete a user: profile + auth login. Shared data (jobs, customers,
-- reports) is preserved and auto-unassigned via existing ON DELETE SET NULL FKs.
-- Cannot delete your own account.
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
  if not public.is_admin() then
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

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
