-- 045_close_unscoped_report_inserts.sql
--
-- Closes the cross-office INSERT hole on the five report tables.
--
-- Each carried a PERMISSIVE `tech_insert_*` policy with `WITH CHECK (true)`.
-- Postgres OR-combines permissive policies, so that swallowed the sibling
-- `shop_insert_*` policy which checks customer_in_my_location(). The only
-- surviving gate was the RESTRICTIVE writers_only_insert -> profile_can_write(),
-- which checks ROLE alone — no location, no org. A Seattle tech could insert a
-- service report against a San Diego customer.
--
-- Dropping the permissive policies alone would have locked two groups out, which
-- is why the replacements come first:
--   * ADMINS — Connor's admin profiles have location_id = NULL, so
--     customer_in_my_location() is false for him. Only service_reports had an
--     admin policy; on the other four he would have lost insert entirely.
--   * INDIVIDUAL TIER — none exist today, but migration 013 defaults every new
--     public signup to tier='individual', so omitting them would break signup.

drop policy if exists admin_insert_pdi_reports on public.pdi_reports;
create policy admin_insert_pdi_reports on public.pdi_reports
  for insert with check (public.is_admin());

drop policy if exists admin_insert_report_photos on public.report_photos;
create policy admin_insert_report_photos on public.report_photos
  for insert with check (public.is_admin());

drop policy if exists admin_insert_checklist_items on public.checklist_items;
create policy admin_insert_checklist_items on public.checklist_items
  for insert with check (public.is_admin());

drop policy if exists admin_insert_pdi_checklist_items on public.pdi_checklist_items;
create policy admin_insert_pdi_checklist_items on public.pdi_checklist_items
  for insert with check (public.is_admin());

drop policy if exists individual_insert_service_reports on public.service_reports;
create policy individual_insert_service_reports on public.service_reports
  for insert with check (
    public.current_profile_tier() = 'individual'
    and tech_id = public.current_profile_id()
  );

drop policy if exists individual_insert_pdi_reports on public.pdi_reports;
create policy individual_insert_pdi_reports on public.pdi_reports
  for insert with check (
    public.current_profile_tier() = 'individual'
    and tech_id = public.current_profile_id()
  );

drop policy if exists individual_insert_report_photos on public.report_photos;
create policy individual_insert_report_photos on public.report_photos
  for insert with check (
    public.current_profile_tier() = 'individual'
    and exists (
      select 1 from public.service_reports r
      where r.id = report_id and r.tech_id = public.current_profile_id()
    )
  );

drop policy if exists individual_insert_checklist_items on public.checklist_items;
create policy individual_insert_checklist_items on public.checklist_items
  for insert with check (
    public.current_profile_tier() = 'individual'
    and exists (
      select 1 from public.service_reports r
      where r.id = report_id and r.tech_id = public.current_profile_id()
    )
  );

drop policy if exists individual_insert_pdi_checklist_items on public.pdi_checklist_items;
create policy individual_insert_pdi_checklist_items on public.pdi_checklist_items
  for insert with check (
    public.current_profile_tier() = 'individual'
    and exists (
      select 1 from public.pdi_reports r
      where r.id = pdi_report_id and r.tech_id = public.current_profile_id()
    )
  );

drop policy if exists tech_insert_service_reports on public.service_reports;
drop policy if exists tech_insert_pdi_reports on public.pdi_reports;
drop policy if exists tech_insert_report_photos on public.report_photos;
drop policy if exists tech_insert_checklist_items on public.checklist_items;
drop policy if exists tech_insert_pdi_checklist_items on public.pdi_checklist_items;
