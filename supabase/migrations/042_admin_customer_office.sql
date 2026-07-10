-- 042_admin_customer_office.sql
-- Bug found during a prod smoke test: an org-wide admin (profiles.location_id
-- null) creating a client always produced customers.location_id = null — 023's
-- set_customer_tenant clobbers the column with the caller's profile location
-- even when the insert explicitly chose an office. NULL-location clients are
-- invisible to every office-filtered surface (Clients list, Jobs, the Create
-- Job customer dropdown), so a client created while browsing "Seattle" vanished
-- from the very next screen.
--
-- Org-wide callers may now target any office IN THEIR ORG explicitly;
-- location-bound staff are still forced to their own office (the 023
-- anti-spoofing guarantee is unchanged). The web Clients page passes the
-- active Office filter on create.

create or replace function public.set_customer_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
begin
  if auth.uid() is null then
    return new;  -- service role / no JWT: trust explicit values
  end if;

  select org_id, location_id into prof
  from public.profiles
  where auth_id = auth.uid();

  if found and prof.org_id is not null then
    new.org_id := prof.org_id;
    if prof.location_id is not null then
      -- Location-bound staff cannot write into another office.
      new.location_id := prof.location_id;
    elsif new.location_id is not null and not exists (
      select 1 from public.locations
      where id = new.location_id and org_id = prof.org_id
    ) then
      -- Org-wide caller pointed at an office outside their org: drop it.
      new.location_id := null;
    end if;
  end if;

  return new;
end;
$$;
