-- 006: Security Hardening
-- Adds missing admin policies, tightens tech INSERT, adds updated_at trigger

-- ============================================================================
-- 1. Add admin ALL policies for tables that were missing them
-- ============================================================================

CREATE POLICY "admin_all_checklist_items" ON public.checklist_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_all_report_photos" ON public.report_photos
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_all_pdi_reports" ON public.pdi_reports
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_all_pdi_checklist_items" ON public.pdi_checklist_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 2. Tighten tech INSERT on jobs — techs can only create jobs assigned to self
-- ============================================================================

DROP POLICY IF EXISTS "tech_insert_jobs" ON public.jobs;
CREATE POLICY "tech_insert_jobs" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_to = public.current_profile_id()
    OR created_by = public.current_profile_id()
    OR public.is_admin()
  );

-- ============================================================================
-- 3. Tighten tech INSERT on service_reports — must be own tech_id
-- ============================================================================

DROP POLICY IF EXISTS "tech_insert_service_reports" ON public.service_reports;
CREATE POLICY "tech_insert_service_reports" ON public.service_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    tech_id = public.current_profile_id()
    OR public.is_admin()
  );

-- ============================================================================
-- 4. Tighten tech INSERT on pdi_reports — must be own tech_id
-- ============================================================================

DROP POLICY IF EXISTS "tech_insert_pdi_reports" ON public.pdi_reports;
CREATE POLICY "tech_insert_pdi_reports" ON public.pdi_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    tech_id = public.current_profile_id()
    OR public.is_admin()
  );

-- ============================================================================
-- 5. Add updated_at auto-update trigger for jobs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_set_updated_at ON public.jobs;
CREATE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. Restrict invite table reads — only unused, unexpired invites for the
--    requesting email (prevents token enumeration via anon key)
-- ============================================================================

DROP POLICY IF EXISTS "auth_read_invites" ON public.invites;
CREATE POLICY "auth_read_invites" ON public.invites
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Invite validation via SECURITY DEFINER function — prevents token enumeration.
-- Anon users cannot read the invites table directly; instead they call this
-- function with a specific token, which returns the matching row or null.
CREATE OR REPLACE FUNCTION public.validate_invite_token(invite_token text)
RETURNS TABLE (
  id uuid,
  email text,
  token text,
  used boolean,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.email, i.token, i.used, i.expires_at
  FROM public.invites i
  WHERE i.token = invite_token
    AND i.used = false
    AND i.expires_at > now()
  LIMIT 1;
$$;

-- Grant anon and authenticated users permission to call the function
GRANT EXECUTE ON FUNCTION public.validate_invite_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invite_token(text) TO authenticated;
