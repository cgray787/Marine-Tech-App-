-- 049_campaign_log_review_fixes.sql
--
-- Three defects found in code review of the campaigns feature, all reproduced
-- against production before fixing and re-verified after.
--
-- 1. DELETING A USER WAS IMPOSSIBLE once they had attached a campaign.
--    campaign_log.created_by is `references profiles(id) on delete set null`, but
--    migration 044 left created_by in the blanket-immutable list. admin_delete_user()
--    runs `delete from profiles`, which fires `UPDATE campaign_log SET created_by
--    = NULL`, which the trigger refused — reporting the misleading "campaign_log
--    is append-only" on an unrelated screen. This is exactly the bug class 044 was
--    written to fix: it was handled for campaign_id/boat_id/customer_id/job_id and
--    missed for created_by. Same rule now applies — an FK may be cleared to NULL by
--    a cascade, but never re-pointed at a different row.
--
-- 2. THE WRONG ENGINE SERIAL COULD BE FROZEN. The snapshot recorded
--    engine_serial_port only, while a Mercury bulletin may apply via either
--    engine. On a permanent, deliberately immutable warranty record that is the
--    wrong evidence. Both engines' serials are now frozen.
--
-- 3. completed_by WAS NEVER POPULATED. The column exists so a warranty audit can
--    name who did the work, but neither the web nor the mobile completion path set
--    it — every completed record would have had completed_by IS NULL. Stamped in
--    the trigger rather than in each client, so a third surface cannot forget it
--    and a caller cannot spoof it.

alter table public.campaign_log
  add column if not exists engine_serial_starboard text;

comment on column public.campaign_log.engine_serial is
  'Port engine serial frozen at attach time. See engine_serial_starboard for the other engine — a Mercury bulletin may apply via either.';

create or replace function public.freeze_campaign_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  b record;
begin
  if new.campaign_id is not null then
    select * into c from service_campaigns where id = new.campaign_id;
    if not found then
      raise exception 'campaign % does not exist', new.campaign_id;
    end if;
    new.manufacturer          := c.manufacturer;
    new.campaign_code         := c.campaign_code;
    new.campaign_title        := c.title;
    new.campaign_revision     := c.revision;
    new.instructions_snapshot := c.instructions;
    new.compensated_hours     := c.compensated_hours;
    new.org_id                := c.org_id;
  end if;

  if new.boat_id is not null then
    select b2.name, b2.hin, b2.customer_id, b2.location_id,
           b2.engine_serial_port, b2.engine_serial_starboard
      into b
      from boats b2 where b2.id = new.boat_id;
    if found then
      new.boat_name := b.name;
      new.boat_hin  := b.hin;
      -- Freeze both: a Mercury bulletin can apply via either engine, so recording
      -- only the port serial can put the wrong evidence on a permanent record.
      new.engine_serial           := coalesce(new.engine_serial, b.engine_serial_port);
      new.engine_serial_starboard := coalesce(new.engine_serial_starboard, b.engine_serial_starboard);
      new.customer_id := coalesce(new.customer_id, b.customer_id);
      new.location_id := coalesce(new.location_id, b.location_id);
    end if;
  end if;

  if new.customer_id is not null then
    select name into new.customer_name from customers where id = new.customer_id;
  end if;

  new.created_by := coalesce(new.created_by, public.current_profile_id());
  new.voided_at := null;
  new.voided_by := null;
  return new;
end;
$$;

revoke execute on function public.freeze_campaign_snapshot() from public, anon, authenticated;

create or replace function public.campaign_log_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'voided' and new.status = 'voided' then
    if new.voided_reason    is distinct from old.voided_reason
    or new.conditions_found is distinct from old.conditions_found
    or new.actual_hours     is distinct from old.actual_hours then
      raise exception 'campaign_log entry % is voided and sealed; add a new entry instead', old.id;
    end if;
  end if;

  -- Frozen snapshot: never changes, in any direction.
  if new.campaign_code            is distinct from old.campaign_code
  or new.campaign_title           is distinct from old.campaign_title
  or new.campaign_revision        is distinct from old.campaign_revision
  or new.instructions_snapshot    is distinct from old.instructions_snapshot
  or new.compensated_hours        is distinct from old.compensated_hours
  or new.manufacturer             is distinct from old.manufacturer
  or new.boat_hin                 is distinct from old.boat_hin
  or new.boat_name                is distinct from old.boat_name
  or new.customer_name            is distinct from old.customer_name
  or new.engine_serial            is distinct from old.engine_serial
  or new.engine_serial_starboard  is distinct from old.engine_serial_starboard
  or new.org_id                   is distinct from old.org_id
  or new.backfilled               is distinct from old.backfilled
  or new.created_at               is distinct from old.created_at
  then
    raise exception 'campaign_log is append-only: the campaign snapshot and its subject cannot be changed. Add a correcting entry instead.';
  end if;

  -- Reference columns, INCLUDING created_by: an ON DELETE SET NULL cascade may
  -- clear them, but they may never be re-pointed at a different row. Leaving
  -- created_by out of this branch made every technician who had attached a
  -- campaign permanently undeletable.
  if (new.campaign_id is not null and new.campaign_id is distinct from old.campaign_id)
  or (new.boat_id     is not null and new.boat_id     is distinct from old.boat_id)
  or (new.customer_id is not null and new.customer_id is distinct from old.customer_id)
  or (new.job_id      is not null and new.job_id      is distinct from old.job_id)
  or (new.created_by  is not null and new.created_by  is distinct from old.created_by)
  then
    raise exception 'campaign_log entries cannot be re-pointed at a different campaign, boat, customer, job or author. Void this entry and create a new one.';
  end if;

  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'a voided campaign_log entry cannot be reopened; attach the campaign again instead';
  end if;

  if new.status = 'voided' and old.status <> 'voided' then
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(new.voided_by, public.current_profile_id());
  end if;

  -- Stamp who completed it. Done here rather than in each client so a third
  -- surface cannot forget it, and so a caller cannot spoof it.
  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, public.current_profile_id());
  end if;

  return new;
end;
$$;
