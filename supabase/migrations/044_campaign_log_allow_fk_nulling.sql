-- 044_campaign_log_allow_fk_nulling.sql
--
-- Bug found by stress-testing migration 043 against the live schema.
--
-- Deleting a client fires Postgres's own FK maintenance:
--     UPDATE campaign_log SET customer_id = NULL WHERE customer_id = <deleted>
-- and campaign_log_immutable rejected it, because customer_id sat in a blanket
-- immutable list. Net effect: any client, boat or job that had campaign history
-- could not be deleted at all, and the failure surfaced on an unrelated screen as
-- a baffling "campaign_log is append-only" error.
--
-- The rule was too broad. An FK may be CLEARED to NULL — that cascade is precisely
-- the mechanism that lets history outlive its subject — but it may never be
-- re-pointed at a DIFFERENT row, which would silently reassign a warranty record
-- to another boat or customer. The text snapshots (boat_hin, boat_name,
-- customer_name, engine_serial) stay fully immutable, and they are what preserve
-- the record's meaning once the ids are gone.
--
-- Verified against prod: deleting a client now succeeds and its campaign_log rows
-- survive with boat name, HIN and owner name intact; re-pointing is still refused.

create or replace function public.campaign_log_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A voided row is sealed.
  if old.status = 'voided' and new.status = 'voided' then
    if new.voided_reason    is distinct from old.voided_reason
    or new.conditions_found is distinct from old.conditions_found
    or new.actual_hours     is distinct from old.actual_hours then
      raise exception 'campaign_log entry % is voided and sealed; add a new entry instead', old.id;
    end if;
  end if;

  -- Frozen snapshot + provenance: never change, in any direction.
  if new.campaign_code         is distinct from old.campaign_code
  or new.campaign_title        is distinct from old.campaign_title
  or new.campaign_revision     is distinct from old.campaign_revision
  or new.instructions_snapshot is distinct from old.instructions_snapshot
  or new.compensated_hours     is distinct from old.compensated_hours
  or new.manufacturer          is distinct from old.manufacturer
  or new.boat_hin              is distinct from old.boat_hin
  or new.boat_name             is distinct from old.boat_name
  or new.customer_name         is distinct from old.customer_name
  or new.engine_serial         is distinct from old.engine_serial
  or new.org_id                is distinct from old.org_id
  or new.backfilled            is distinct from old.backfilled
  or new.created_at            is distinct from old.created_at
  or new.created_by            is distinct from old.created_by
  then
    raise exception 'campaign_log is append-only: the campaign snapshot and its subject cannot be changed. Add a correcting entry instead.';
  end if;

  -- Subject FKs: may be cleared to NULL by an ON DELETE SET NULL cascade, never
  -- re-pointed at a different row.
  if (new.campaign_id is not null and new.campaign_id is distinct from old.campaign_id)
  or (new.boat_id     is not null and new.boat_id     is distinct from old.boat_id)
  or (new.customer_id is not null and new.customer_id is distinct from old.customer_id)
  or (new.job_id      is not null and new.job_id      is distinct from old.job_id)
  then
    raise exception 'campaign_log entries cannot be re-pointed at a different campaign, boat, customer or job. Void this entry and create a new one.';
  end if;

  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'a voided campaign_log entry cannot be reopened; attach the campaign again instead';
  end if;

  if new.status = 'voided' and old.status <> 'voided' then
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(new.voided_by, public.current_profile_id());
  end if;

  return new;
end;
$$;
