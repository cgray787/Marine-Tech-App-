-- PDI uploads previously wrote a PDI UUID into the service-report FK; the
-- dashboard already queried pdi_report_id, but that column did not exist.
alter table public.report_photos add column if not exists pdi_report_id uuid references public.pdi_reports(id) on delete cascade;
create index if not exists report_photos_pdi_report_id_idx on public.report_photos(pdi_report_id);
alter table public.report_photos add constraint pdi_photo_exclusive_parent check (
  pdi_report_id is null or (report_id is null and campaign_log_id is null and job_id is null)
);
create policy pdi_photos_read on public.report_photos for select to authenticated
using (pdi_report_id is not null and exists(select 1 from public.pdi_reports r where r.id = pdi_report_id));
create policy pdi_photos_insert on public.report_photos for insert to authenticated
with check (pdi_report_id is not null and public.profile_can_write() and exists(select 1 from public.pdi_reports r where r.id = pdi_report_id));
create policy pdi_photos_update on public.report_photos for update to authenticated
using (pdi_report_id is not null and public.profile_can_write() and exists(select 1 from public.pdi_reports r where r.id = pdi_report_id))
with check (pdi_report_id is not null and public.profile_can_write() and exists(select 1 from public.pdi_reports r where r.id = pdi_report_id));
create policy pdi_photos_delete on public.report_photos for delete to authenticated
using (pdi_report_id is not null and public.profile_can_write() and exists(select 1 from public.pdi_reports r where r.id = pdi_report_id));

-- Existing admin INSERT policies lacked matching SELECT policies for unassigned
-- inspections and their evidence, so INSERT ... RETURNING was rejected.
create policy admin_read_pdi_reports on public.pdi_reports for select to authenticated using (public.is_admin());
create policy admin_read_checklist_items on public.checklist_items for select to authenticated using (public.is_admin());
create policy admin_read_pdi_checklist_items on public.pdi_checklist_items for select to authenticated using (public.is_admin());
create policy admin_read_report_photos on public.report_photos for select to authenticated using (public.is_admin());
