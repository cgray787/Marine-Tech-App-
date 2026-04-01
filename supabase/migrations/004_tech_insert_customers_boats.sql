-- Allow authenticated users (techs & admins) to insert customers and boats
CREATE POLICY "auth_insert_customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_boats" ON public.boats FOR INSERT TO authenticated WITH CHECK (true);
