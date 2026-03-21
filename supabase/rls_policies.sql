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

-- Policies: Authenticated users can read all data
CREATE POLICY "Authenticated users can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read boats" ON public.boats FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read marinas" ON public.marinas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read jobs" ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read service_reports" ON public.service_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read checklist_items" ON public.checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read report_photos" ON public.report_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read pdi_reports" ON public.pdi_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read pdi_checklist_items" ON public.pdi_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));

-- Policies: Techs can insert their own reports
CREATE POLICY "Techs can insert service_reports" ON public.service_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Techs can insert checklist_items" ON public.checklist_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Techs can insert report_photos" ON public.report_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Techs can insert pdi_reports" ON public.pdi_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Techs can insert pdi_checklist_items" ON public.pdi_checklist_items FOR INSERT TO authenticated WITH CHECK (true);

-- Policies: Techs can update their own jobs status
CREATE POLICY "Techs can update assigned jobs" ON public.jobs FOR UPDATE TO authenticated USING (assigned_to IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid())) WITH CHECK (assigned_to IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid()));

-- Policies: Admins can do everything
CREATE POLICY "Admins full access profiles" ON public.profiles FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins full access customers" ON public.customers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins full access boats" ON public.boats FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins full access marinas" ON public.marinas FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins full access jobs" ON public.jobs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins full access service_reports" ON public.service_reports FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins full access invites" ON public.invites FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins full access notifications" ON public.notifications FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE auth_id = auth.uid() AND role = 'admin'));
