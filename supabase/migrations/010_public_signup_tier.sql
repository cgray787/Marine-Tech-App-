-- 010: Public signup + tier-based multi-tenancy.
--
-- Adds a `tier` column to profiles distinguishing JBY-style shop users from
-- self-signed-up individuals. Shop users keep their current shared-data view.
-- Individual users see only their own data (the customers/boats/jobs/reports
-- they created).
--
-- Also adds:
--   - self-insert policy on profiles for public signups (auth_id-gated)
--   - free-tier soft caps for individual users (3 customers, 25 reports)
--   - tier-aware SELECT/INSERT/UPDATE/DELETE policies

-- ============================================================================
-- 1. Schema change: add tier column + role expansion for boat owners
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'individual'
  CHECK (tier IN ('shop', 'individual'));

-- All existing profiles are JBY shop users.
UPDATE public.profiles SET tier = 'shop' WHERE tier = 'individual';

-- Allow 'owner' role (boat owners maintaining their own boats) alongside admin/tech/viewer.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'tech', 'viewer', 'owner'));

-- ============================================================================
-- 2. Helper: current_profile_tier()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_profile_tier()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tier FROM public.profiles WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ============================================================================
-- 3. Profile self-insert policy (public signup)
-- ============================================================================

DROP POLICY IF EXISTS "self_insert_profile" ON public.profiles;
CREATE POLICY "self_insert_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_id = auth.uid()
    AND role IN ('tech', 'owner')
    AND tier = 'individual'
    AND status = 'active'
  );

DROP POLICY IF EXISTS "self_update_profile" ON public.profiles;
CREATE POLICY "self_update_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (
    auth_id = auth.uid()
    -- prevent privilege escalation: non-admins can't change their own role/tier/status
    AND role = (SELECT role FROM public.profiles WHERE auth_id = auth.uid())
    AND tier = (SELECT tier FROM public.profiles WHERE auth_id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE auth_id = auth.uid())
  );

-- ============================================================================
-- 4. Replace global SELECT policies with tier-aware ones.
-- Shop users keep current shared visibility. Individuals are scoped to self.
-- Admin policies (full access) are unchanged.
-- ============================================================================

-- CUSTOMERS
DROP POLICY IF EXISTS "auth_read_customers" ON public.customers;
CREATE POLICY "shop_read_customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_read_customers" ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND created_by = public.current_profile_id()
  );

-- INSERT customers — already allowed (auth_insert_customers), but tighten so
-- individuals can only insert with created_by = self.
DROP POLICY IF EXISTS "auth_insert_customers" ON public.customers;
CREATE POLICY "shop_insert_customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_insert_customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_profile_tier() = 'individual'
    AND created_by = public.current_profile_id()
  );

-- UPDATE/DELETE customers (individuals can edit their own)
CREATE POLICY "individual_update_customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND created_by = public.current_profile_id()
  );
CREATE POLICY "individual_delete_customers" ON public.customers
  FOR DELETE TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND created_by = public.current_profile_id()
  );

-- BOATS — scoped via the parent customer
DROP POLICY IF EXISTS "auth_read_boats" ON public.boats;
CREATE POLICY "shop_read_boats" ON public.boats
  FOR SELECT TO authenticated
  USING (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_read_boats" ON public.boats
  FOR SELECT TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND customer_id IN (
      SELECT id FROM public.customers WHERE created_by = public.current_profile_id()
    )
  );

DROP POLICY IF EXISTS "auth_insert_boats" ON public.boats;
CREATE POLICY "shop_insert_boats" ON public.boats
  FOR INSERT TO authenticated
  WITH CHECK (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_insert_boats" ON public.boats
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_profile_tier() = 'individual'
    AND customer_id IN (
      SELECT id FROM public.customers WHERE created_by = public.current_profile_id()
    )
  );
CREATE POLICY "individual_update_boats" ON public.boats
  FOR UPDATE TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND customer_id IN (
      SELECT id FROM public.customers WHERE created_by = public.current_profile_id()
    )
  );
CREATE POLICY "individual_delete_boats" ON public.boats
  FOR DELETE TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND customer_id IN (
      SELECT id FROM public.customers WHERE created_by = public.current_profile_id()
    )
  );

-- JOBS
DROP POLICY IF EXISTS "auth_read_jobs" ON public.jobs;
CREATE POLICY "shop_read_jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_read_jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND (
      created_by = public.current_profile_id()
      OR assigned_to = public.current_profile_id()
    )
  );

CREATE POLICY "individual_delete_jobs" ON public.jobs
  FOR DELETE TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND created_by = public.current_profile_id()
  );

-- SERVICE_REPORTS
DROP POLICY IF EXISTS "auth_read_service_reports" ON public.service_reports;
CREATE POLICY "shop_read_service_reports" ON public.service_reports
  FOR SELECT TO authenticated
  USING (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_read_service_reports" ON public.service_reports
  FOR SELECT TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND tech_id = public.current_profile_id()
  );

-- PDI_REPORTS
DROP POLICY IF EXISTS "auth_read_pdi_reports" ON public.pdi_reports;
CREATE POLICY "shop_read_pdi_reports" ON public.pdi_reports
  FOR SELECT TO authenticated
  USING (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_read_pdi_reports" ON public.pdi_reports
  FOR SELECT TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND tech_id = public.current_profile_id()
  );

-- CHECKLIST_ITEMS — scoped via parent report
DROP POLICY IF EXISTS "auth_read_checklist_items" ON public.checklist_items;
CREATE POLICY "shop_read_checklist_items" ON public.checklist_items
  FOR SELECT TO authenticated
  USING (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_read_checklist_items" ON public.checklist_items
  FOR SELECT TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND report_id IN (
      SELECT id FROM public.service_reports WHERE tech_id = public.current_profile_id()
    )
  );

-- PDI_CHECKLIST_ITEMS
DROP POLICY IF EXISTS "auth_read_pdi_checklist_items" ON public.pdi_checklist_items;
CREATE POLICY "shop_read_pdi_checklist_items" ON public.pdi_checklist_items
  FOR SELECT TO authenticated
  USING (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_read_pdi_checklist_items" ON public.pdi_checklist_items
  FOR SELECT TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND report_id IN (
      SELECT id FROM public.pdi_reports WHERE tech_id = public.current_profile_id()
    )
  );

-- REPORT_PHOTOS — scoped via parent report
DROP POLICY IF EXISTS "auth_read_report_photos" ON public.report_photos;
CREATE POLICY "shop_read_report_photos" ON public.report_photos
  FOR SELECT TO authenticated
  USING (public.current_profile_tier() = 'shop');
CREATE POLICY "individual_read_report_photos" ON public.report_photos
  FOR SELECT TO authenticated
  USING (
    public.current_profile_tier() = 'individual'
    AND report_id IN (
      SELECT id FROM public.service_reports WHERE tech_id = public.current_profile_id()
    )
  );

-- ============================================================================
-- 5. Free-tier caps for individuals (3 customers, 25 service reports).
-- Implemented as BEFORE INSERT triggers that raise on overflow. Shop users and
-- admins are unaffected.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_individual_customer_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_tier text;
  current_count int;
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tier INTO creator_tier FROM public.profiles WHERE id = NEW.created_by;
  IF creator_tier = 'individual' THEN
    SELECT count(*) INTO current_count FROM public.customers WHERE created_by = NEW.created_by;
    IF current_count >= 3 THEN
      RAISE EXCEPTION 'Free tier limit reached: 3 customers. Contact support to upgrade.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_individual_cap ON public.customers;
CREATE TRIGGER customers_individual_cap
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_individual_customer_cap();

CREATE OR REPLACE FUNCTION public.enforce_individual_report_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tech_tier text;
  current_count int;
BEGIN
  IF NEW.tech_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tier INTO tech_tier FROM public.profiles WHERE id = NEW.tech_id;
  IF tech_tier = 'individual' THEN
    SELECT count(*) INTO current_count FROM public.service_reports WHERE tech_id = NEW.tech_id;
    IF current_count >= 25 THEN
      RAISE EXCEPTION 'Free tier limit reached: 25 service reports. Contact support to upgrade.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_reports_individual_cap ON public.service_reports;
CREATE TRIGGER service_reports_individual_cap
  BEFORE INSERT ON public.service_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_individual_report_cap();

-- ============================================================================
-- Notes for application code:
--   - Public signup must create profile with tier='individual', role='tech' (or
--     'owner' for boat owners), status='active', auth_id=auth.uid().
--   - Existing JBY invite flow still works: invited profiles default to tier
--     'individual' but the admin invite flow should set tier='shop' explicitly
--     after acceptance (see admin invite RPC if used; otherwise app-level).
--   - Marinas remain globally readable — they are not customer data.
-- ============================================================================
