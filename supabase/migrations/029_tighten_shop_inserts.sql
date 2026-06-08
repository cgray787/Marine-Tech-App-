-- 029_tighten_shop_inserts.sql
-- Closes the remaining cross-location INSERT holes uncovered while applying 028:
--   * tech_insert_jobs   — was WITH CHECK true (any tech, any job)
--   * shop_insert_customers — checked tier only, not location
--   * shop_insert_boats     — same
-- Customers are partially protected by the set_customer_tenant trigger
-- (migration 023) that overrides client-supplied org/location — but adding the
-- RLS check is defense in depth (trigger could be dropped, RLS holds).
--
-- Boats + jobs have no such trigger, so the RLS update here is the only
-- line of defense.

-- ── jobs ───────────────────────────────────────────────────────────────────
-- Replace the permissive tech_insert_jobs with tier-aware policies that
-- match the rest of the table's policies.
drop policy if exists tech_insert_jobs on public.jobs;

drop policy if exists shop_insert_jobs on public.jobs;
create policy shop_insert_jobs on public.jobs for insert
  with check (
    public.current_profile_tier() = 'shop'
    and public.customer_in_my_location(customer_id)
  );

drop policy if exists individual_insert_jobs on public.jobs;
create policy individual_insert_jobs on public.jobs for insert
  with check (
    public.current_profile_tier() = 'individual'
    and customer_id in (
      select id from public.customers
       where created_by = public.current_profile_id()
    )
  );

-- Admins keep their full org-wide INSERT via the existing admin_all_jobs policy.

-- ── customers ──────────────────────────────────────────────────────────────
drop policy if exists shop_insert_customers on public.customers;
create policy shop_insert_customers on public.customers for insert
  with check (
    public.current_profile_tier() = 'shop'
    and location_id = public.current_profile_location()
  );

-- ── boats ──────────────────────────────────────────────────────────────────
drop policy if exists shop_insert_boats on public.boats;
create policy shop_insert_boats on public.boats for insert
  with check (
    public.current_profile_tier() = 'shop'
    and public.customer_in_my_location(customer_id)
  );
