-- 047_add_tables_to_realtime_publication.sql
--
-- The supabase_realtime publication was EMPTY — zero tables. Every realtime
-- subscription in the app (the web and mobile calendars via subscribeToJobs, and
-- the RealtimeRefresh component on seven dashboard pages) connected, reported
-- itself healthy, and then received nothing, because Postgres was never
-- publishing the changes.
--
-- The failure mode is silent by nature: the socket is up and the subscription is
-- live, so nothing looks broken — two techs on the calendar simply never see each
-- other's edits, and the dashboard never live-updates.
--
-- Tables below are exactly those named in the code:
--   lib/calendar/realtime.ts + mobile/lib/calendar/realtime.ts  -> jobs
--   app/dashboard/page.tsx                -> jobs, service_reports, pdi_reports, parts
--   app/dashboard/customers/[id]/page.tsx -> customers, work_orders, jobs
--   app/dashboard/work-orders/**          -> work_orders, work_order_jobs,
--                                            work_order_lines, work_order_payments
--   app/dashboard/work-orders/settings    -> price_levels, job_templates,
--                                            wo_settings, service_campaigns
--   app/dashboard/reports/page.tsx        -> service_reports
--
-- Realtime still respects RLS, so this does not widen what anyone can see; it only
-- lets the change feed reach clients already entitled to those rows.

do $$
declare t text;
begin
  foreach t in array array[
    'jobs', 'service_reports', 'pdi_reports', 'parts',
    'customers', 'work_orders', 'work_order_jobs', 'work_order_lines',
    'work_order_payments', 'price_levels', 'job_templates', 'wo_settings',
    'service_campaigns', 'campaign_log'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
