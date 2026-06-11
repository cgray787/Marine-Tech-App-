-- Add scheduled_end_date so jobs can span multiple days.
-- Existing `scheduled_date` becomes the start of the range; `scheduled_end_date` is the (inclusive) last day.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS scheduled_end_date date;

-- Backfill: any existing job becomes a single-day job (end = start).
UPDATE public.jobs
SET scheduled_end_date = scheduled_date
WHERE scheduled_end_date IS NULL
  AND scheduled_date IS NOT NULL;

-- Guard against inverted ranges.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_scheduled_range_ck;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_scheduled_range_ck
  CHECK (
    scheduled_end_date IS NULL
    OR scheduled_date IS NULL
    OR scheduled_end_date >= scheduled_date
  );

-- Index for month-window calendar queries.
CREATE INDEX IF NOT EXISTS jobs_scheduled_range_idx
  ON public.jobs (scheduled_date, scheduled_end_date);

COMMENT ON COLUMN public.jobs.scheduled_end_date IS
  'Inclusive end date of the scheduled job. Equals scheduled_date for single-day jobs.';
