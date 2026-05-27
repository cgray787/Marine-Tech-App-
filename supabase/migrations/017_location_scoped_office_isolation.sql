-- 017_location_scoped_office_isolation.sql
-- Location-based office isolation (Part C of the multi-location model).
-- A shop (team) user sees only the clients/boats/jobs belonging to THEIR
-- assigned office (profiles.location_id). Boats/jobs follow their parent
-- customer's office so they never orphan if the row's own location_id is unset.
-- Admins (is_admin) and viewers (is_viewer) are unaffected (separate policies).
-- Individual/free-tier users keep their own-records-only isolation.

create or replace function public.current_profile_location()
returns uuid language sql stable security definer set search_path = public as $$
  select location_id from public.profiles where id = public.current_profile_id()
$$;

create or replace function public.customer_in_my_location(cust uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.customers c
    where c.id = cust and c.location_id = public.current_profile_location()
  )
$$;

drop policy if exists shop_read_customers on public.customers;
create policy shop_read_customers on public.customers for select
  using (current_profile_tier() = 'shop' and location_id = public.current_profile_location());

drop policy if exists shop_read_boats on public.boats;
create policy shop_read_boats on public.boats for select
  using (current_profile_tier() = 'shop' and public.customer_in_my_location(customer_id));

drop policy if exists shop_read_jobs on public.jobs;
create policy shop_read_jobs on public.jobs for select
  using (current_profile_tier() = 'shop' and public.customer_in_my_location(customer_id));
