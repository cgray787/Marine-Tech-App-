-- 023_customers_tenant_from_profile.sql
-- Tenant assignment must not be client-controllable. Derive customers.org_id /
-- location_id server-side from the inserting user's profile, overriding whatever
-- the client sent. This closes an IDOR where a caller could set an arbitrary
-- org_id (e.g. another tenant, or JBY to force a Salesforce sync).
--
-- Only enforced for end-user (JWT) inserts: when auth.uid() is null (service-role
-- inserts, seeds, migrations) the explicitly-provided values are preserved.

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

  -- Override only when we have a real org for the caller; never clobber with NULL
  -- (e.g. an invitee not yet promoted keeps whatever default applies).
  if found and prof.org_id is not null then
    new.org_id := prof.org_id;
    new.location_id := prof.location_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_customer_tenant_before_insert on public.customers;
create trigger set_customer_tenant_before_insert
  before insert on public.customers
  for each row
  execute function public.set_customer_tenant();

revoke all on function public.set_customer_tenant() from public, anon, authenticated;
