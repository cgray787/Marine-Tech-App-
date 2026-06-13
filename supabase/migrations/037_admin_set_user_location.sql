-- 037_admin_set_user_location.sql
-- Owner-only RPC to assign a user's office (location_id). Mirrors
-- admin_set_user_role (027): is_owner() gated, refuses to act on self.
-- Assigning a real office also flips the user to tier='shop' so the
-- location-scoped RLS (017/027/028/029) actually binds them — this closes
-- the migration-013 footgun (invitees land at individual/NULL and see nothing).
-- Passing NULL unassigns the office (location stays NULL; tier untouched).

create or replace function public.admin_set_user_location(
  target_profile uuid,
  new_location uuid
)
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

  if new_location is not null
     and not exists (select 1 from public.locations where id = new_location) then
    raise exception 'unknown location: %', new_location;
  end if;

  if exists (
    select 1 from public.profiles where id = target_profile and auth_id = me
  ) then
    raise exception 'cannot change your own office';
  end if;

  if new_location is null then
    update public.profiles
       set location_id = null
     where id = target_profile;
  else
    update public.profiles
       set location_id = new_location,
           tier = 'shop'
     where id = target_profile;
  end if;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

revoke all on function public.admin_set_user_location(uuid, uuid) from public, anon;
grant execute on function public.admin_set_user_location(uuid, uuid) to authenticated;
