-- 042_quo_do_not_report.sql
-- Private "do-not-report" list for the quo-activity-log edge function.
--
-- Any ACTIVE row whose phone (or, as a secondary guard, matched account name)
-- corresponds to a Quo counterpart causes that person to be skipped: their
-- texts/calls are NEVER pulled or written into Salesforce. The list is
-- maintained as data (INSERT/DELETE rows), so adding or removing a private
-- contact never requires a function redeploy.
--
-- Read at runtime by the edge function via the service-role client, which
-- bypasses RLS. RLS is enabled and anon/authenticated are denied outright so the
-- list stays private (it names people Connor has flagged as confidential).

create table if not exists public.quo_do_not_report (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                       -- who (shown in the report)
  phone_last10 text,                                 -- match key: digits-only last 10 (null if unresolved)
  reason       text,                                 -- why they're private (optional)
  mode         text not null default 'exclude',      -- room to grow (e.g. 'summary_only'); today only 'exclude'
  active       boolean not null default true,        -- soft on/off without deleting the row
  added_by     text not null default 'connor',
  created_at   timestamptz not null default now(),
  -- phone_last10, when present, must be exactly 10 digits (matches quo.ts last10()).
  constraint quo_do_not_report_phone_last10_digits
    check (phone_last10 is null or phone_last10 ~ '^[0-9]{10}$'),
  constraint quo_do_not_report_mode_check
    check (mode in ('exclude'))
);

comment on table public.quo_do_not_report is
  'Private do-not-report list: contacts whose Quo activity must never be logged to Salesforce by quo-activity-log.';

-- Fast lookup by the match key for active rows.
create index if not exists quo_do_not_report_phone_active_idx
  on public.quo_do_not_report (phone_last10) where active;

alter table public.quo_do_not_report enable row level security;
-- No policies granted → anon/authenticated get nothing; service_role bypasses RLS.
revoke all on public.quo_do_not_report from anon, authenticated;
