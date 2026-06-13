-- 038_locations_read_policy.sql
-- public.locations had RLS ENABLED but NO select policy -> deny-all. Every
-- authenticated read returned zero rows, so the office picker (choose-office),
-- the sidebar LocationSwitcher, and the single-office badge all came up empty
-- (only "All Offices" showed). Allow authenticated users to read the locations
-- in their own org. Org-scoped is the right tenant boundary; today that is JBY.
-- Idempotent: drop-then-create so re-applying is safe.

drop policy if exists locations_read_own_org on public.locations;

create policy locations_read_own_org on public.locations
  for select
  to authenticated
  using (org_id = public.current_profile_org());
