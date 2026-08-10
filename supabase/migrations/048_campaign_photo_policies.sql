-- 048_campaign_photo_policies.sql
--
-- Found by smoke-testing the round-trip as the real roles rather than as the
-- table owner. Two bugs, one of them a blocker on the feature's whole point.
--
-- BUG 1 — a tech could not upload a campaign photo at all. Every report_photos
-- policy scopes through service_report_in_my_location(report_id). A campaign
-- photo has report_id = NULL and links via campaign_log_id, so that predicate is
-- false and both INSERT and SELECT were refused for shop-tier users. The mobile
-- camera flow was dead on arrival for everyone except an admin, which means the
-- photo never reached the office — the return leg of the round-trip.
--
-- BUG 2 — migration 046 wrote `report_id IS NULL OR ...` into
-- viewer_select_report_photos, intending "don't hide unattached photos". Campaign
-- photos are precisely the rows with report_id NULL, so that clause handed every
-- viewer every campaign photo in the org regardless of office. Replaced with an
-- explicit campaign_log_id check.
--
-- Rule from here: you may act on a campaign photo exactly when you may act on the
-- campaign_log entry it belongs to.

create or replace function public.campaign_photo_in_scope(entry uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaign_log cl
    where cl.id = entry
      and cl.org_id = public.current_profile_org()
      and (
        public.is_admin()
        or cl.location_id is null
        or cl.location_id = public.current_profile_location()
      )
  );
$$;

-- Techs and managers upload these from the field app.
drop policy if exists campaign_photos_insert on public.report_photos;
create policy campaign_photos_insert on public.report_photos
  for insert with check (
    campaign_log_id is not null
    and public.profile_can_write()
    and public.campaign_photo_in_scope(campaign_log_id)
  );

-- Everyone entitled to the campaign sees its photos — this is what puts the
-- tech's photo in front of the office for the warranty claim.
drop policy if exists campaign_photos_read on public.report_photos;
create policy campaign_photos_read on public.report_photos
  for select using (
    campaign_log_id is not null
    and public.campaign_photo_in_scope(campaign_log_id)
  );

-- Captions may be corrected. Deliberately no DELETE policy: the photo is the
-- evidence behind a warranty claim, matching how campaign_log itself behaves.
drop policy if exists campaign_photos_update on public.report_photos;
create policy campaign_photos_update on public.report_photos
  for update using (
    campaign_log_id is not null
    and public.profile_can_write()
    and public.campaign_photo_in_scope(campaign_log_id)
  );

-- Close the leak 046 opened.
drop policy if exists viewer_select_report_photos on public.report_photos;
create policy viewer_select_report_photos on public.report_photos
  for select using (
    public.is_viewer()
    and (
      (report_id is not null and public.service_report_in_my_location(report_id))
      or (campaign_log_id is not null and public.campaign_photo_in_scope(campaign_log_id))
    )
  );
