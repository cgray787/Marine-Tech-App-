-- 011: Drop soft-tier caps + add in-app account deletion (App Store review).
--
-- Why:
--   - App Store review (Guideline 2.1(b)) read the "Contact support to upgrade"
--     trigger errors as paid digital content offered outside IAP. The app has
--     no paid features, so the caps are removed entirely.
--   - App Store review (Guideline 5.1.1(v)) requires apps with account
--     creation to also offer in-app account deletion. delete_user_account()
--     removes the user's profile, their personal data (individual tier only),
--     and the auth.users row.

-- ============================================================================
-- 1. Drop free-tier caps (was migration 010, section 5).
-- ============================================================================

DROP TRIGGER IF EXISTS customers_individual_cap ON public.customers;
DROP TRIGGER IF EXISTS service_reports_individual_cap ON public.service_reports;
DROP FUNCTION IF EXISTS public.enforce_individual_customer_cap();
DROP FUNCTION IF EXISTS public.enforce_individual_report_cap();

-- ============================================================================
-- 2. Account deletion RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth_id uuid := auth.uid();
  v_profile_id uuid;
  v_tier text;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, tier INTO v_profile_id, v_tier
  FROM public.profiles
  WHERE auth_id = v_auth_id;

  -- Individual-tier users own their data — delete it before removing the profile.
  -- Shop-tier users share data with the team; only the profile + auth row are removed.
  IF v_tier = 'individual' AND v_profile_id IS NOT NULL THEN
    DELETE FROM public.checklist_items
      WHERE report_id IN (SELECT id FROM public.service_reports WHERE tech_id = v_profile_id);
    DELETE FROM public.pdi_checklist_items
      WHERE pdi_report_id IN (SELECT id FROM public.pdi_reports WHERE tech_id = v_profile_id);
    DELETE FROM public.report_photos
      WHERE report_id IN (SELECT id FROM public.service_reports WHERE tech_id = v_profile_id);
    DELETE FROM public.service_reports WHERE tech_id = v_profile_id;
    DELETE FROM public.pdi_reports WHERE tech_id = v_profile_id;
    DELETE FROM public.jobs
      WHERE created_by = v_profile_id OR assigned_to = v_profile_id;
    DELETE FROM public.boats
      WHERE customer_id IN (SELECT id FROM public.customers WHERE created_by = v_profile_id);
    DELETE FROM public.customers WHERE created_by = v_profile_id;
  END IF;

  IF v_profile_id IS NOT NULL THEN
    DELETE FROM public.profiles WHERE id = v_profile_id;
  END IF;

  DELETE FROM auth.users WHERE id = v_auth_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
