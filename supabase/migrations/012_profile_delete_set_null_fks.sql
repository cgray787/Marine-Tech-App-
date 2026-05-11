-- 012: Allow profile deletion by changing all FKs referencing profiles.id
-- to ON DELETE SET NULL.
--
-- Why:
--   delete_user_account() (migration 011) was failing for shop-tier users
--   with: 'update or delete on table "profiles" violates foreign key
--   constraint "customers_created_by_fkey"'. Shop users own shared shop
--   data — when they delete their account we want that data to remain
--   (with NULL created_by/assigned_to/tech_id/etc), not block the delete.
--
-- For individual-tier users, delete_user_account() already wipes all
-- dependent rows before deleting the profile, so SET NULL is unreachable
-- on their path. SET NULL only kicks in for shop deletes.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_invited_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_created_by_fkey;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_assigned_to_fkey;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_created_by_fkey;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.service_reports DROP CONSTRAINT IF EXISTS service_reports_tech_id_fkey;
ALTER TABLE public.service_reports
  ADD CONSTRAINT service_reports_tech_id_fkey
  FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.service_reports DROP CONSTRAINT IF EXISTS service_reports_reviewed_by_fkey;
ALTER TABLE public.service_reports
  ADD CONSTRAINT service_reports_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.pdi_reports DROP CONSTRAINT IF EXISTS pdi_reports_tech_id_fkey;
ALTER TABLE public.pdi_reports
  ADD CONSTRAINT pdi_reports_tech_id_fkey
  FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_invited_by_fkey;
ALTER TABLE public.invites
  ADD CONSTRAINT invites_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
