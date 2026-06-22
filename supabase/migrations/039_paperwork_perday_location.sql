-- 039: Paperwork blocks + per-day locations
-- Additive: existing rows default to kind='service', day_locations='{}', location_id=NULL,
-- so current behavior is unchanged. New paperwork policies are all gated on kind='paperwork'.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS day_locations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('service','paperwork'));

-- Paperwork has no customer to derive tenant/location from, so denormalize the
-- assigned tech's location onto the row (used by the app's office filter).
CREATE OR REPLACE FUNCTION public.set_paperwork_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'paperwork' AND NEW.location_id IS NULL AND NEW.assigned_to IS NOT NULL THEN
    SELECT p.location_id INTO NEW.location_id FROM public.profiles p WHERE p.id = NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_paperwork_location ON public.jobs;
CREATE TRIGGER set_paperwork_location
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_paperwork_location();

-- RLS for paperwork (customer_id is NULL, so the existing customer-scoped policies
-- never match). Predicate is assignee-based (robust, independent of trigger ordering):
-- visible/writable to the assigned tech, or to anyone in the assignee's location.
-- admins (admin_all_jobs) + viewers (viewer_select_jobs, read-only) already cover their cases.
-- The RESTRICTIVE writers_only_* (profile_can_write()) still applies on writes.

DROP POLICY IF EXISTS paperwork_read ON public.jobs;
CREATE POLICY paperwork_read ON public.jobs FOR SELECT
  USING (
    kind = 'paperwork' AND (
      assigned_to = current_profile_id()
      OR (SELECT p.location_id FROM public.profiles p WHERE p.id = jobs.assigned_to) = current_profile_location()
    )
  );

DROP POLICY IF EXISTS paperwork_insert ON public.jobs;
CREATE POLICY paperwork_insert ON public.jobs FOR INSERT
  WITH CHECK (
    kind = 'paperwork' AND customer_id IS NULL AND (
      assigned_to = current_profile_id()
      OR (SELECT p.location_id FROM public.profiles p WHERE p.id = jobs.assigned_to) = current_profile_location()
    )
  );

DROP POLICY IF EXISTS paperwork_update ON public.jobs;
CREATE POLICY paperwork_update ON public.jobs FOR UPDATE
  USING (
    kind = 'paperwork' AND (
      assigned_to = current_profile_id()
      OR (SELECT p.location_id FROM public.profiles p WHERE p.id = jobs.assigned_to) = current_profile_location()
    )
  )
  WITH CHECK (
    kind = 'paperwork' AND (
      assigned_to = current_profile_id()
      OR (SELECT p.location_id FROM public.profiles p WHERE p.id = jobs.assigned_to) = current_profile_location()
    )
  );

DROP POLICY IF EXISTS paperwork_delete ON public.jobs;
CREATE POLICY paperwork_delete ON public.jobs FOR DELETE
  USING (
    kind = 'paperwork' AND (
      assigned_to = current_profile_id()
      OR (SELECT p.location_id FROM public.profiles p WHERE p.id = jobs.assigned_to) = current_profile_location()
    )
  );
