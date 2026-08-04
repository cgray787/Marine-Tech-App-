-- 043_service_campaigns.sql
-- AXOPAR + Mercury service campaigns.
--
-- Numbered 043 deliberately: prod has already applied 040_quo_activity_secrets_rpc
-- and 041_quo_activity_log_cron, and two open draft PRs both claim 040/041/042.
-- Starting at 043 sidesteps that collision entirely.
--
-- Two tables, one clear split:
--   service_campaigns — the catalog. Mutable; you maintain it as bulletins arrive.
--   campaign_log      — the permanent record. One row per campaign per boat, holding
--                       a FROZEN copy of the campaign text as it read on the day the
--                       work happened. Append-only: insert + a narrow update, never delete.
--
-- The freeze matters. If the log only referenced service_campaigns, a manufacturer
-- revising a bulletin would silently rewrite what our records claim we did on every
-- boat already finished. Manufacturers revise bulletins routinely.

-- ---------------------------------------------------------------------------
-- 1. Engine serial on boats
-- ---------------------------------------------------------------------------
-- Mercury scopes bulletins by engine serial (e.g. "ENG 3B458751"). We stored
-- engine_make / engine_model but no serial, so Mercury campaigns could not be
-- matched to a hull. Axopar scopes by HIN, which boats.hin already carries.
alter table public.boats
  add column if not exists engine_serial_port text,
  add column if not exists engine_serial_starboard text;

-- ---------------------------------------------------------------------------
-- 2. Catalog
-- ---------------------------------------------------------------------------
create table if not exists public.service_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  manufacturer text not null check (manufacturer in ('axopar', 'mercury')),
  campaign_code text not null,              -- "AX29 25-0110" / "2024-08"
  title text not null,                      -- "Galvanic isolator"
  revision text,                            -- bulletin revision, e.g. "B"
  description text,                         -- Axopar "Issue"
  instructions text,                        -- Axopar "Introduction" / Mercury procedure
  compensated_hours numeric(6, 2) not null default 0,  -- Axopar "Compensated Work Hours"
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  applies_to text,                          -- human-readable scope note
  bulletin_url text,

  -- Axopar targeting: affected hulls by HIN.
  affected_hins text[] not null default '{}',

  -- Mercury targeting + claim metadata.
  engine_model text,                        -- "MERCURY 200EFI CXL 4"
  engine_serial_from text,                  -- "3B458751" (and after)
  part_code text,                           -- "306 - COIL 18 - FAILED"
  labor_codes jsonb not null default '[]'::jsonb,   -- [{"code":"CA12","hours":0.5}]
  part_numbers jsonb not null default '[]'::jsonb,  -- [{"item_number":"8M0044991","description":"COIL IGNITION","qty":1}]

  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,

  unique (org_id, manufacturer, campaign_code)
);

create index if not exists service_campaigns_org_active_idx
  on public.service_campaigns (org_id, manufacturer) where active;

-- ---------------------------------------------------------------------------
-- 3. Permanent per-boat record
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,

  -- Live references. All ON DELETE SET NULL — deleting a client, boat or job must
  -- never destroy the audit trail. boats.customer_id CASCADEs from customers, so a
  -- naive FK here would let one "delete client" wipe the history.
  campaign_id uuid references public.service_campaigns(id) on delete set null,
  boat_id uuid references public.boats(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,

  -- Frozen snapshot, written once at attach time and never updated.
  manufacturer text not null,
  campaign_code text not null,
  campaign_title text not null,
  campaign_revision text,
  instructions_snapshot text,
  compensated_hours numeric(6, 2) not null default 0,
  boat_name text,
  boat_hin text,
  engine_serial text,
  customer_name text,

  -- Mutable working fields (see the update policy below for the exact allowed set).
  status text not null default 'open'
    check (status in ('open', 'completed', 'not_applicable')),
  conditions_found text,                    -- Mercury "Conditions Found"
  actual_hours numeric(6, 2),
  engine_hours numeric(10, 1),              -- Mercury records engine hours at failure
  claim_number text,                        -- MERCNET claim no. once filed
  claim_status text,                        -- submitted / approved / paid / rejected
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,

  -- True when recorded after the fact rather than captured live. A backfilled row
  -- has no photos and often no tech, and an audit needs to tell the difference
  -- between a record made at the time and one reconstructed later.
  backfilled boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists campaign_log_boat_idx on public.campaign_log (boat_id, created_at desc);
create index if not exists campaign_log_customer_idx on public.campaign_log (customer_id, created_at desc);
create index if not exists campaign_log_job_idx on public.campaign_log (job_id);
create index if not exists campaign_log_open_idx on public.campaign_log (org_id, status) where status = 'open';

-- One live row per campaign per boat. Re-running a completed campaign on the same
-- hull is not a thing; a correcting entry is a new row against a new job.
create unique index if not exists campaign_log_one_per_boat
  on public.campaign_log (campaign_id, boat_id)
  where campaign_id is not null and boat_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Photos of the work area
-- ---------------------------------------------------------------------------
-- Reuse report_photos rather than standing up a second photo system: same
-- report-photos storage bucket, same upload path, same offline queue.
-- report_id is already nullable, so a campaign photo simply carries campaign_log_id
-- instead. job_id lets a tech photograph a work area on a job with no report yet.
alter table public.report_photos
  add column if not exists campaign_log_id uuid references public.campaign_log(id) on delete cascade,
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

create index if not exists report_photos_campaign_idx on public.report_photos (campaign_log_id);
create index if not exists report_photos_job_idx on public.report_photos (job_id);

-- ---------------------------------------------------------------------------
-- 5. Snapshot trigger — freeze the campaign text at attach time
-- ---------------------------------------------------------------------------
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
    if found then
      new.manufacturer        := coalesce(new.manufacturer, c.manufacturer);
      new.campaign_code       := coalesce(new.campaign_code, c.campaign_code);
      new.campaign_title      := coalesce(new.campaign_title, c.title);
      new.campaign_revision   := coalesce(new.campaign_revision, c.revision);
      new.instructions_snapshot := coalesce(new.instructions_snapshot, c.instructions);
      -- compensated_hours defaults to 0, so only inherit when nothing was passed.
      if new.compensated_hours = 0 then
        new.compensated_hours := c.compensated_hours;
      end if;
      new.org_id := coalesce(new.org_id, c.org_id);
    end if;
  end if;

  if new.boat_id is not null then
    select b2.name, b2.hin, b2.customer_id, b2.location_id,
           b2.engine_serial_port
      into b
      from boats b2 where b2.id = new.boat_id;
    if found then
      new.boat_name     := coalesce(new.boat_name, b.name);
      new.boat_hin      := coalesce(new.boat_hin, b.hin);
      new.engine_serial := coalesce(new.engine_serial, b.engine_serial_port);
      new.customer_id   := coalesce(new.customer_id, b.customer_id);
      new.location_id   := coalesce(new.location_id, b.location_id);
    end if;
  end if;

  if new.customer_id is not null and new.customer_name is null then
    select name into new.customer_name from customers where id = new.customer_id;
  end if;

  if new.created_by is null then
    new.created_by := public.current_profile_id();
  end if;

  return new;
end;
$$;

revoke execute on function public.freeze_campaign_snapshot() from public, anon, authenticated;

drop trigger if exists campaign_log_freeze on public.campaign_log;
create trigger campaign_log_freeze
  before insert on public.campaign_log
  for each row execute function public.freeze_campaign_snapshot();

-- ---------------------------------------------------------------------------
-- 6. Append-only guard
-- ---------------------------------------------------------------------------
-- The snapshot columns and the identity of the row are immutable. Only the
-- working fields below may ever change. Enforced in a trigger rather than RLS so
-- it holds for every path — REST, service role, mobile offline sync, everything.
create or replace function public.campaign_log_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.campaign_code       is distinct from old.campaign_code
  or new.campaign_title      is distinct from old.campaign_title
  or new.campaign_revision   is distinct from old.campaign_revision
  or new.instructions_snapshot is distinct from old.instructions_snapshot
  or new.compensated_hours   is distinct from old.compensated_hours
  or new.manufacturer        is distinct from old.manufacturer
  or new.boat_id             is distinct from old.boat_id
  or new.boat_hin            is distinct from old.boat_hin
  or new.customer_id         is distinct from old.customer_id
  or new.org_id              is distinct from old.org_id
  or new.created_at          is distinct from old.created_at
  then
    raise exception 'campaign_log is append-only: the campaign snapshot and its subject cannot be changed. Add a correcting entry instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_log_no_rewrite on public.campaign_log;
create trigger campaign_log_no_rewrite
  before update on public.campaign_log
  for each row execute function public.campaign_log_immutable();

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
alter table public.service_campaigns enable row level security;
alter table public.campaign_log enable row level security;

-- Catalog: everyone in the org reads (the tech needs the instructions);
-- only admins and managers write, matching wo_can_edit()'s boundary.
drop policy if exists campaigns_read on public.service_campaigns;
create policy campaigns_read on public.service_campaigns
  for select using (org_id = public.current_profile_org());

drop policy if exists campaigns_write on public.service_campaigns;
create policy campaigns_write on public.service_campaigns
  for all using (org_id = public.current_profile_org() and public.wo_can_edit())
  with check (org_id = public.current_profile_org() and public.wo_can_edit());

-- Log: location-scoped reads, so an office only sees its own boats' history.
-- Admins stay org-wide. Note the explicit location predicate — the viewer_select_*
-- policies elsewhere use a bare is_viewer() and leak across offices; this does not
-- repeat that.
drop policy if exists campaign_log_read on public.campaign_log;
create policy campaign_log_read on public.campaign_log
  for select using (
    org_id = public.current_profile_org()
    and (
      public.is_admin()
      or location_id is null
      or location_id = public.current_profile_location()
    )
  );

drop policy if exists campaign_log_insert on public.campaign_log;
create policy campaign_log_insert on public.campaign_log
  for insert with check (
    org_id = public.current_profile_org()
    and public.profile_can_write()
    and (
      public.is_admin()
      or boat_id is null
      or exists (
        select 1 from public.boats b
        where b.id = boat_id
          and (b.location_id is null or b.location_id = public.current_profile_location())
      )
    )
  );

drop policy if exists campaign_log_update on public.campaign_log;
create policy campaign_log_update on public.campaign_log
  for update using (
    org_id = public.current_profile_org()
    and public.profile_can_write()
    and (public.is_admin() or location_id is null or location_id = public.current_profile_location())
  );

-- Deliberately no DELETE policy anywhere: the record is permanent.

comment on table public.campaign_log is
  'Permanent append-only record of service campaigns performed per boat. Snapshot columns are frozen at insert; no delete policy exists by design.';
