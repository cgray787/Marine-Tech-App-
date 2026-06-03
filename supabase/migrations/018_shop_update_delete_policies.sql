-- 018_shop_update_delete_policies.sql
-- Fixes the silent-fail bug where shop-tier techs (e.g. Apple Sign In
-- techs who land at tier='shop' with no admin role) edit a boat or
-- a customer in the mobile app, see no error, but the change never
-- persists. Root cause: when migration 015/017 added shop-tier read
-- and insert policies, the matching shop-tier UPDATE and DELETE
-- policies were never created. UPDATE/DELETE against an RLS-protected
-- table with no matching policy returns success but affects 0 rows —
-- the client never sees an error, the modal closes, and the user
-- assumes the edit saved.
--
-- Mirrors the existing shop_read_* policies: location-scoped via
-- customer_in_my_location() so a Seattle tech can only edit Seattle
-- customers and their boats.
--
-- Admins (admin_all_*) and individual-tier users (individual_update_*,
-- individual_delete_*) are untouched.

-- ---------------------------------------------------------------- boats

drop policy if exists shop_update_boats on public.boats;
create policy shop_update_boats on public.boats for update
  using (
    public.current_profile_tier() = 'shop'
    and public.customer_in_my_location(customer_id)
  )
  with check (
    public.current_profile_tier() = 'shop'
    and public.customer_in_my_location(customer_id)
  );

drop policy if exists shop_delete_boats on public.boats;
create policy shop_delete_boats on public.boats for delete
  using (
    public.current_profile_tier() = 'shop'
    and public.customer_in_my_location(customer_id)
  );

-- ------------------------------------------------------------ customers

drop policy if exists shop_update_customers on public.customers;
create policy shop_update_customers on public.customers for update
  using (
    public.current_profile_tier() = 'shop'
    and location_id = public.current_profile_location()
  )
  with check (
    public.current_profile_tier() = 'shop'
    and location_id = public.current_profile_location()
  );

drop policy if exists shop_delete_customers on public.customers;
create policy shop_delete_customers on public.customers for delete
  using (
    public.current_profile_tier() = 'shop'
    and location_id = public.current_profile_location()
  );
