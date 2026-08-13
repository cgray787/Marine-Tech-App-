-- 051_job_photo_policies.sql
--
-- Photos attached directly to a job.
--
-- Migration 043 added report_photos.job_id so a tech could photograph a work area
-- on a job with no service report yet — the normal case when they open a job from
-- the calendar. Nothing ever wrote or read it, and no policy covered it: every
-- existing policy keys on report_id (NULL for a job photo) or is campaign-
-- specific. Exactly the failure campaign photos hit in migration 048.
--
-- Scope rule mirrors campaign_photo_in_scope: you may act on a job photo exactly
-- when you may act on the job's customer. Clientless jobs (paperwork blocks) fall
-- back to the assignee's own office.

create or replace function public.job_photo_in_scope(j uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jobs jb
    where jb.id = j
      and (
        public.is_admin()
        or (jb.customer_id is not null and public.customer_in_my_location(jb.customer_id))
        or (jb.customer_id is null and (
              jb.location_id is null
              or jb.location_id = public.current_profile_location()
           ))
      )
  );
$$;

drop policy if exists job_photos_insert on public.report_photos;
create policy job_photos_insert on public.report_photos
  for insert with check (
    job_id is not null and report_id is null and campaign_log_id is null
    and public.profile_can_write()
    and public.job_photo_in_scope(job_id)
  );

drop policy if exists job_photos_read on public.report_photos;
create policy job_photos_read on public.report_photos
  for select using (
    job_id is not null and report_id is null and campaign_log_id is null
    and public.job_photo_in_scope(job_id)
  );

drop policy if exists job_photos_update on public.report_photos;
create policy job_photos_update on public.report_photos
  for update using (
    job_id is not null and report_id is null and campaign_log_id is null
    and public.profile_can_write()
    and public.job_photo_in_scope(job_id)
  );

-- Unlike campaign photos, these are working documentation rather than warranty
-- evidence, so a shot taken in error should not be permanent.
drop policy if exists job_photos_delete on public.report_photos;
create policy job_photos_delete on public.report_photos
  for delete using (
    job_id is not null and report_id is null and campaign_log_id is null
    and public.profile_can_write()
    and public.job_photo_in_scope(job_id)
  );

drop policy if exists viewer_select_report_photos on public.report_photos;
create policy viewer_select_report_photos on public.report_photos
  for select using (
    public.is_viewer()
    and (
      (report_id is not null and public.service_report_in_my_location(report_id))
      or (campaign_log_id is not null and public.campaign_photo_in_scope(campaign_log_id))
      or (job_id is not null and report_id is null and campaign_log_id is null
          and public.job_photo_in_scope(job_id))
    )
  );
