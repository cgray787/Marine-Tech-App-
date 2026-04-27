-- 007: Allow techs to edit and delete their own jobs + reports.
-- Admins already have admin_all_* policies; this adds tech UPDATE/DELETE
-- scoped to rows they own (assigned_to / tech_id / via report's tech_id).

-- ============================================================================
-- jobs: tech DELETE on own assigned jobs (tech UPDATE already exists)
-- ============================================================================

DROP POLICY IF EXISTS "tech_delete_jobs" ON public.jobs;
CREATE POLICY "tech_delete_jobs" ON public.jobs
  FOR DELETE TO authenticated
  USING (
    assigned_to = public.current_profile_id()
    OR created_by = public.current_profile_id()
  );

-- ============================================================================
-- service_reports: tech UPDATE + DELETE on own reports
-- ============================================================================

DROP POLICY IF EXISTS "tech_update_service_reports" ON public.service_reports;
CREATE POLICY "tech_update_service_reports" ON public.service_reports
  FOR UPDATE TO authenticated
  USING (tech_id = public.current_profile_id())
  WITH CHECK (tech_id = public.current_profile_id());

DROP POLICY IF EXISTS "tech_delete_service_reports" ON public.service_reports;
CREATE POLICY "tech_delete_service_reports" ON public.service_reports
  FOR DELETE TO authenticated
  USING (tech_id = public.current_profile_id());

-- ============================================================================
-- checklist_items: tech UPDATE + DELETE via the parent report's tech_id
-- ============================================================================

DROP POLICY IF EXISTS "tech_update_checklist_items" ON public.checklist_items;
CREATE POLICY "tech_update_checklist_items" ON public.checklist_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_reports sr
      WHERE sr.id = checklist_items.report_id
        AND sr.tech_id = public.current_profile_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_reports sr
      WHERE sr.id = checklist_items.report_id
        AND sr.tech_id = public.current_profile_id()
    )
  );

DROP POLICY IF EXISTS "tech_delete_checklist_items" ON public.checklist_items;
CREATE POLICY "tech_delete_checklist_items" ON public.checklist_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_reports sr
      WHERE sr.id = checklist_items.report_id
        AND sr.tech_id = public.current_profile_id()
    )
  );

-- ============================================================================
-- report_photos: tech DELETE via parent report's tech_id
-- (INSERT already granted via tech_insert_report_photos)
-- ============================================================================

DROP POLICY IF EXISTS "tech_delete_report_photos" ON public.report_photos;
CREATE POLICY "tech_delete_report_photos" ON public.report_photos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_reports sr
      WHERE sr.id = report_photos.report_id
        AND sr.tech_id = public.current_profile_id()
    )
  );
