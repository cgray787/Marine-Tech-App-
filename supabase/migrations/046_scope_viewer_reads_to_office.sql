-- 046_scope_viewer_reads_to_office.sql
--
-- Stops the viewer role reading every office.
--
-- is_viewer() checks role = 'viewer' AND status = 'active' — no location, no org —
-- yet it was the ENTIRE using-expression for the viewer_select_* policies. Any
-- read-only account therefore saw all clients across every office, contact details
-- included. Migration 032 successfully made viewers read-ONLY; it did not make
-- them read-SCOPED.
--
-- Each policy now carries the same location predicate the shop-tier read policies
-- already use. Records with no office assigned stay visible: a NULL location_id
-- means "not yet assigned", not "secret".
--
-- marinas and profiles are deliberately left org-wide. A marina is shared
-- reference data, and the staff list is already readable by every authenticated
-- user through auth_read_profiles — narrowing that is a separate decision.

drop policy if exists viewer_select_customers on public.customers;
create policy viewer_select_customers on public.customers
  for select using (
    public.is_viewer()
    and (location_id is null or location_id = public.current_profile_location())
  );

drop policy if exists viewer_select_boats on public.boats;
create policy viewer_select_boats on public.boats
  for select using (
    public.is_viewer()
    and (customer_id is null or public.customer_in_my_location(customer_id))
  );

drop policy if exists viewer_select_jobs on public.jobs;
create policy viewer_select_jobs on public.jobs
  for select using (
    public.is_viewer()
    and (customer_id is null or public.customer_in_my_location(customer_id))
  );

drop policy if exists viewer_select_service_reports on public.service_reports;
create policy viewer_select_service_reports on public.service_reports
  for select using (
    public.is_viewer()
    and (customer_id is null or public.customer_in_my_location(customer_id))
  );

drop policy if exists viewer_select_pdi_reports on public.pdi_reports;
create policy viewer_select_pdi_reports on public.pdi_reports
  for select using (
    public.is_viewer()
    and (customer_id is null or public.customer_in_my_location(customer_id))
  );

drop policy if exists viewer_select_report_photos on public.report_photos;
create policy viewer_select_report_photos on public.report_photos
  for select using (
    public.is_viewer()
    and (report_id is null or public.service_report_in_my_location(report_id))
  );

drop policy if exists viewer_select_checklist_items on public.checklist_items;
create policy viewer_select_checklist_items on public.checklist_items
  for select using (
    public.is_viewer()
    and (report_id is null or public.service_report_in_my_location(report_id))
  );

drop policy if exists viewer_select_pdi_checklist_items on public.pdi_checklist_items;
create policy viewer_select_pdi_checklist_items on public.pdi_checklist_items
  for select using (
    public.is_viewer()
    and (pdi_report_id is null or public.pdi_report_in_my_location(pdi_report_id))
  );
