-- 009: Add 'viewer' role for read-only web dashboard access.
--
-- Viewers can SELECT every table tied to scheduling/work tracking
-- (jobs, customers, boats, marinas, profiles, service/PDI reports,
-- checklist items, photos) but cannot INSERT/UPDATE/DELETE anything.
-- They can use the web dashboard to see calendar and job state.
--
-- Schema change:
--   profiles.role CHECK constraint extended from ('admin','tech')
--   to ('admin','tech','viewer').
--
-- New helper:
--   public.is_viewer() — returns true when the current auth user's
--   profile.role = 'viewer'. Mirrors the existing is_admin() pattern.

-- ============================================================================
-- 1. Extend role enum
-- ============================================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'tech', 'viewer'));

-- ============================================================================
-- 2. is_viewer() helper
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_id = auth.uid()
      AND role = 'viewer'
      AND status = 'active'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO authenticated;

-- ============================================================================
-- 3. SELECT policies for viewers on every read-relevant table.
--    Named with 'viewer_select_<table>' so they're easy to grep / drop.
-- ============================================================================

-- Profiles — viewers can see all techs (needed for calendar tech filter)
CREATE POLICY "viewer_select_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_viewer());

-- Jobs — full read access
CREATE POLICY "viewer_select_jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (public.is_viewer());

-- Customers — needed for calendar chip labels and jobs-by-customer
CREATE POLICY "viewer_select_customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_viewer());

-- Boats — needed for boat names on chips/lists
CREATE POLICY "viewer_select_boats" ON public.boats
  FOR SELECT TO authenticated
  USING (public.is_viewer());

-- Marinas — needed for marina display on calendar chips
CREATE POLICY "viewer_select_marinas" ON public.marinas
  FOR SELECT TO authenticated
  USING (public.is_viewer());

-- Service reports + checklist + photos — visible if viewer browses to a job
CREATE POLICY "viewer_select_service_reports" ON public.service_reports
  FOR SELECT TO authenticated
  USING (public.is_viewer());

CREATE POLICY "viewer_select_checklist_items" ON public.checklist_items
  FOR SELECT TO authenticated
  USING (public.is_viewer());

CREATE POLICY "viewer_select_report_photos" ON public.report_photos
  FOR SELECT TO authenticated
  USING (public.is_viewer());

-- PDI reports + checklist
CREATE POLICY "viewer_select_pdi_reports" ON public.pdi_reports
  FOR SELECT TO authenticated
  USING (public.is_viewer());

CREATE POLICY "viewer_select_pdi_checklist_items" ON public.pdi_checklist_items
  FOR SELECT TO authenticated
  USING (public.is_viewer());

-- Notes:
-- - No INSERT/UPDATE/DELETE policies are added for viewers — RLS denies by
--   default, so write attempts will fail at the database. The web UI also
--   hides write buttons for viewers (see middleware + admin.ts changes).
-- - The 'invites' table is intentionally NOT exposed to viewers — viewer
--   role can read existing data but cannot see or generate invitations.
