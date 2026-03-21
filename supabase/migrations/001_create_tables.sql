-- Marine Tech App — Full Database Schema
-- Paste this entire file into Supabase SQL Editor and click "Run"

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'tech' CHECK (role IN ('admin', 'tech')),
  avatar_url text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  invited_by uuid REFERENCES public.profiles(id),
  push_token text,
  created_at timestamptz DEFAULT now()
);

-- 2. customers
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 3. boats
CREATE TABLE IF NOT EXISTS public.boats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  make_model text,
  year integer,
  hin text,
  engine_make text,
  engine_model text,
  color text,
  home_marina text,
  created_at timestamptz DEFAULT now()
);

-- 4. marinas
CREATE TABLE IF NOT EXISTS public.marinas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  city text,
  state text,
  created_at timestamptz DEFAULT now()
);

-- 5. jobs
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to uuid REFERENCES public.profiles(id),
  customer_id uuid REFERENCES public.customers(id),
  boat_id uuid REFERENCES public.boats(id),
  marina_id uuid REFERENCES public.marinas(id),
  service_types text[],
  scheduled_date date,
  status text DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed')),
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. service_reports
CREATE TABLE IF NOT EXISTS public.service_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id),
  tech_id uuid REFERENCES public.profiles(id),
  boat_id uuid REFERENCES public.boats(id),
  customer_id uuid REFERENCES public.customers(id),
  boat_name text,
  owner_name text,
  make_model text,
  year integer,
  hin text,
  marina text,
  engine_make_model text,
  engine_hours numeric,
  battery_voltage numeric,
  service_types text[],
  work_description text,
  parts_used text,
  concerns text,
  general_notes text,
  signature_url text,
  status text DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'approved', 'correction_needed')),
  submitted_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id)
);

-- 7. checklist_items
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.service_reports(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_name text NOT NULL,
  assessment text CHECK (assessment IN ('good', 'bad')),
  notes text,
  photo_url text,
  sort_order integer
);

-- 8. report_photos
CREATE TABLE IF NOT EXISTS public.report_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.service_reports(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  category text,
  caption text,
  item_id uuid REFERENCES public.checklist_items(id),
  created_at timestamptz DEFAULT now()
);

-- 9. pdi_reports
CREATE TABLE IF NOT EXISTS public.pdi_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id uuid REFERENCES public.profiles(id),
  boat_id uuid REFERENCES public.boats(id),
  customer_id uuid REFERENCES public.customers(id),
  boat_name text,
  owner_name text,
  make_model text,
  year integer,
  hin text,
  color text,
  marina text,
  total_items integer DEFAULT 0,
  completed_items integer DEFAULT 0,
  flagged_items integer DEFAULT 0,
  general_notes text,
  status text DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'approved')),
  submitted_at timestamptz DEFAULT now()
);

-- 10. pdi_checklist_items
CREATE TABLE IF NOT EXISTS public.pdi_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdi_report_id uuid REFERENCES public.pdi_reports(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_name text NOT NULL,
  assessment text CHECK (assessment IN ('good', 'bad')),
  notes text,
  photo_url text,
  sort_order integer
);

-- 11. invites
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invited_by uuid REFERENCES public.profiles(id),
  token text NOT NULL UNIQUE,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days')
);

-- 12. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id),
  title text NOT NULL,
  body text,
  type text NOT NULL,
  read boolean DEFAULT false,
  data_json jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdi_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdi_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS: Authenticated users can read all data
CREATE POLICY "auth_read_profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_boats" ON public.boats FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_marinas" ON public.marinas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_jobs" ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_service_reports" ON public.service_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_checklist_items" ON public.checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_report_photos" ON public.report_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_pdi_reports" ON public.pdi_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_pdi_checklist_items" ON public.pdi_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid()));

-- RLS: Techs can insert reports
CREATE POLICY "tech_insert_service_reports" ON public.service_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tech_insert_checklist_items" ON public.checklist_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tech_insert_report_photos" ON public.report_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tech_insert_pdi_reports" ON public.pdi_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tech_insert_pdi_checklist_items" ON public.pdi_checklist_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tech_insert_jobs" ON public.jobs FOR INSERT TO authenticated WITH CHECK (true);

-- RLS: Techs can update their assigned jobs
CREATE POLICY "tech_update_jobs" ON public.jobs FOR UPDATE TO authenticated USING (assigned_to IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid()));

-- RLS: Admin full access
CREATE POLICY "admin_all_profiles" ON public.profiles FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_customers" ON public.customers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_boats" ON public.boats FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_marinas" ON public.marinas FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_jobs" ON public.jobs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_service_reports" ON public.service_reports FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_invites" ON public.invites FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_notifications" ON public.notifications FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('report-photos', 'report-photos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('pdi-photos', 'pdi-photos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "auth_upload_photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('report-photos', 'pdi-photos', 'signatures'));
CREATE POLICY "public_view_photos" ON storage.objects FOR SELECT TO public USING (bucket_id IN ('report-photos', 'pdi-photos', 'signatures'));
