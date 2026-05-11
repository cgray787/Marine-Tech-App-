-- 013: Auto-create profile row + auto-confirm email on signup.
--
-- Why:
--   Public signup from build 28 fails silently. supabase.auth.signUp()
--   creates an auth.users row, but the client-side profile upsert is
--   blocked by RLS (no session yet when email-confirm is enabled). The
--   user ends up on a blank screen with no profile, can't sign in.
--
-- Fix: Move profile creation server-side via a SECURITY DEFINER trigger
-- on auth.users INSERT. The trigger reads full_name and role from the
-- user_metadata payload, inserts the profile, and auto-confirms the
-- email so the user can sign in immediately (matches the App Review
-- expectation of "tap signup, you're in").
--
-- Idempotent — safe to run multiple times; safe alongside invite flow
-- (skips if profile already exists for that auth_id).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_full_name text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  v_role text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'tech');
BEGIN
  -- Idempotent: skip if a profile already exists for this auth id.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = NEW.id) THEN
    -- Still auto-confirm email so they can sign in.
    UPDATE auth.users SET email_confirmed_at = NOW()
      WHERE id = NEW.id AND email_confirmed_at IS NULL;
    RETURN NEW;
  END IF;

  -- Role gates: only allow values the app's CHECK constraint permits.
  IF v_role NOT IN ('tech', 'owner', 'admin', 'viewer') THEN
    v_role := 'tech';
  END IF;

  INSERT INTO public.profiles (auth_id, email, full_name, role, status, tier)
  VALUES (NEW.id, NEW.email, v_full_name, v_role, 'active', 'individual')
  ON CONFLICT (email) DO UPDATE
    SET auth_id = EXCLUDED.auth_id,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  -- Auto-confirm so signInWithPassword works right after signUp.
  UPDATE auth.users SET email_confirmed_at = NOW()
    WHERE id = NEW.id AND email_confirmed_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
