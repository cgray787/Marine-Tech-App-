-- Fix infinite recursion in RLS policies
-- Admin policies on other tables referenced profiles table,
-- which has its own admin policy that also references profiles → infinite loop.
-- Solution: use SECURITY DEFINER functions that bypass RLS.

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Recreate all admin policies using is_admin()
DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
CREATE POLICY "Admins full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access customers" ON public.customers;
CREATE POLICY "Admins full access customers" ON public.customers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access boats" ON public.boats;
CREATE POLICY "Admins full access boats" ON public.boats FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access marinas" ON public.marinas;
CREATE POLICY "Admins full access marinas" ON public.marinas FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access jobs" ON public.jobs;
CREATE POLICY "Admins full access jobs" ON public.jobs FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access service_reports" ON public.service_reports;
CREATE POLICY "Admins full access service_reports" ON public.service_reports FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access invites" ON public.invites;
CREATE POLICY "Admins full access invites" ON public.invites FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access notifications" ON public.notifications;
CREATE POLICY "Admins full access notifications" ON public.notifications FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Fix policies that reference profiles with inline subqueries
DROP POLICY IF EXISTS "Techs can update assigned jobs" ON public.jobs;
CREATE POLICY "Techs can update assigned jobs" ON public.jobs FOR UPDATE TO authenticated
  USING (assigned_to = public.current_profile_id())
  WITH CHECK (assigned_to = public.current_profile_id());

DROP POLICY IF EXISTS "Authenticated users can read notifications" ON public.notifications;
CREATE POLICY "Authenticated users can read notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = public.current_profile_id() OR public.is_admin());
