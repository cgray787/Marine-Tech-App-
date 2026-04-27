-- Add scheduled timestamp range and free-text location override to jobs.
-- scheduled_date (date) is intentionally kept for one release cycle so
-- existing read sites (jobs page, mobile, webhook in 003) keep working.
-- A follow-up migration (009_drop_scheduled_date.sql) will remove it
-- after every read site has switched to scheduled_start.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS scheduled_start   timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end     timestamptz,
  ADD COLUMN IF NOT EXISTS location_override text;

CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_start
  ON public.jobs (scheduled_start);

COMMENT ON COLUMN public.jobs.scheduled_start IS
  'When the job is scheduled to begin. NULL = unscheduled, shown in calendar Unscheduled tray.';
COMMENT ON COLUMN public.jobs.scheduled_end IS
  'When the job is scheduled to end. NULL = unknown end (treated as +1hr from start in UI).';
COMMENT ON COLUMN public.jobs.location_override IS
  'Free-text location for one-off sites not worth a marina record (e.g., "Lake WA, near marker 12"). Takes precedence over marina.name in calendar chips.';
