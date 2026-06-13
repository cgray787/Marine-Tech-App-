-- 034_wo_location_scoped_writes.sql
-- Pre-Sausalito follow-up tracked in CLAUDE.md + the 2026-06-07 expansion
-- runbook: the four wo_*_write policies from migration 033 were role-only
-- (wo_can_edit() = admin|manager). That was latent while Seattle was the only
-- office, but with Sausalito/San Diego opening, a manager could cross-location
-- write via raw REST. Mirror the wo_*_read location filters onto the write
-- policies: admins stay org-wide, managers are scoped to their own office.
--
-- Reference data (price_levels / job_templates / wo_settings) stays org-wide
-- by design — it's shared catalog/settings, not per-office data.

drop policy if exists wo_write on public.work_orders;
create policy wo_write on public.work_orders for all to authenticated
  using (
    public.wo_can_edit()
    and (public.is_admin() or location_id = public.current_profile_location())
  )
  with check (
    public.wo_can_edit()
    and (public.is_admin() or location_id = public.current_profile_location())
  );

drop policy if exists wo_jobs_write on public.work_order_jobs;
create policy wo_jobs_write on public.work_order_jobs for all to authenticated
  using (
    public.wo_can_edit()
    and exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and (public.is_admin() or w.location_id = public.current_profile_location())
    )
  )
  with check (
    public.wo_can_edit()
    and exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and (public.is_admin() or w.location_id = public.current_profile_location())
    )
  );

drop policy if exists wo_lines_write on public.work_order_lines;
create policy wo_lines_write on public.work_order_lines for all to authenticated
  using (
    public.wo_can_edit()
    and exists (
      select 1 from public.work_order_jobs j
      join public.work_orders w on w.id = j.work_order_id
      where j.id = work_order_job_id
        and (public.is_admin() or w.location_id = public.current_profile_location())
    )
  )
  with check (
    public.wo_can_edit()
    and exists (
      select 1 from public.work_order_jobs j
      join public.work_orders w on w.id = j.work_order_id
      where j.id = work_order_job_id
        and (public.is_admin() or w.location_id = public.current_profile_location())
    )
  );

drop policy if exists wo_payments_write on public.work_order_payments;
create policy wo_payments_write on public.work_order_payments for all to authenticated
  using (
    public.wo_can_edit()
    and exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and (public.is_admin() or w.location_id = public.current_profile_location())
    )
  )
  with check (
    public.wo_can_edit()
    and exists (
      select 1 from public.work_orders w
      where w.id = work_order_id
        and (public.is_admin() or w.location_id = public.current_profile_location())
    )
  );
