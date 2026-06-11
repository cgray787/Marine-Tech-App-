-- 028_rls_audit_reports_parts.sql
-- Closes gap 4 from docs/superpowers/specs/2026-06-07-multi-location-expansion.md.
-- Applied via Supabase MCP on 2026-06-07.
--
-- Two classes of bug fixed:
--   A. SILENT FAIL on writes — shop-tier UPDATE/DELETE (and some INSERT)
--      policies were never created for service_reports, pdi_reports,
--      report_photos, checklist_items, pdi_checklist_items. RLS-protected
--      writes with no matching policy succeed but affect 0 rows; the client
--      sees no error, the modal closes, and the user thinks the edit saved.
--      Same root cause migration 018 / 027 patched for boats / customers / jobs.
--   B. LOCATION LEAK on reads — the existing shop_read_* policies on these
--      tables (and parts) checked tier='shop' but NOT location. Today that's
--      harmless because only Seattle is populated; the day Sausalito opens,
--      a Seattle tech would suddenly see Sausalito reports. Tightening before
--      that data shows up.
--
-- All policies use the existing customer_in_my_location(customer_id) helper.
-- Chained tables (report_photos, checklist_items, pdi_checklist_items) get
-- two new helpers (service_report_in_my_location, pdi_report_in_my_location)
-- that follow the join to the parent report's customer.

-- ── New helpers ─────────────────────────────────────────────────────────────
create or replace function public.service_report_in_my_location(rep uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_reports r
    where r.id = rep
      and public.customer_in_my_location(r.customer_id)
  );
$$;

create or replace function public.pdi_report_in_my_location(rep uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pdi_reports r
    where r.id = rep
      and public.customer_in_my_location(r.customer_id)
  );
$$;

-- ── service_reports ────────────────────────────────────────────────────────
drop policy if exists shop_read_service_reports on public.service_reports;
create policy shop_read_service_reports on public.service_reports for select
  using (public.current_profile_tier() = 'shop'
         and public.customer_in_my_location(customer_id));

drop policy if exists shop_insert_service_reports on public.service_reports;
create policy shop_insert_service_reports on public.service_reports for insert
  with check (public.current_profile_tier() = 'shop'
              and public.customer_in_my_location(customer_id));

drop policy if exists shop_update_service_reports on public.service_reports;
create policy shop_update_service_reports on public.service_reports for update
  using (public.current_profile_tier() = 'shop'
         and public.customer_in_my_location(customer_id))
  with check (public.current_profile_tier() = 'shop'
              and public.customer_in_my_location(customer_id));

drop policy if exists shop_delete_service_reports on public.service_reports;
create policy shop_delete_service_reports on public.service_reports for delete
  using (public.current_profile_tier() = 'shop'
         and public.customer_in_my_location(customer_id));

-- ── pdi_reports ────────────────────────────────────────────────────────────
drop policy if exists shop_read_pdi_reports on public.pdi_reports;
create policy shop_read_pdi_reports on public.pdi_reports for select
  using (public.current_profile_tier() = 'shop'
         and public.customer_in_my_location(customer_id));

drop policy if exists shop_insert_pdi_reports on public.pdi_reports;
create policy shop_insert_pdi_reports on public.pdi_reports for insert
  with check (public.current_profile_tier() = 'shop'
              and public.customer_in_my_location(customer_id));

drop policy if exists shop_update_pdi_reports on public.pdi_reports;
create policy shop_update_pdi_reports on public.pdi_reports for update
  using (public.current_profile_tier() = 'shop'
         and public.customer_in_my_location(customer_id))
  with check (public.current_profile_tier() = 'shop'
              and public.customer_in_my_location(customer_id));

drop policy if exists shop_delete_pdi_reports on public.pdi_reports;
create policy shop_delete_pdi_reports on public.pdi_reports for delete
  using (public.current_profile_tier() = 'shop'
         and public.customer_in_my_location(customer_id));

-- ── report_photos ──────────────────────────────────────────────────────────
drop policy if exists shop_read_report_photos on public.report_photos;
create policy shop_read_report_photos on public.report_photos for select
  using (public.current_profile_tier() = 'shop'
         and public.service_report_in_my_location(report_id));

drop policy if exists shop_insert_report_photos on public.report_photos;
create policy shop_insert_report_photos on public.report_photos for insert
  with check (public.current_profile_tier() = 'shop'
              and public.service_report_in_my_location(report_id));

drop policy if exists shop_update_report_photos on public.report_photos;
create policy shop_update_report_photos on public.report_photos for update
  using (public.current_profile_tier() = 'shop'
         and public.service_report_in_my_location(report_id))
  with check (public.current_profile_tier() = 'shop'
              and public.service_report_in_my_location(report_id));

drop policy if exists shop_delete_report_photos on public.report_photos;
create policy shop_delete_report_photos on public.report_photos for delete
  using (public.current_profile_tier() = 'shop'
         and public.service_report_in_my_location(report_id));

-- ── checklist_items ────────────────────────────────────────────────────────
drop policy if exists shop_read_checklist_items on public.checklist_items;
create policy shop_read_checklist_items on public.checklist_items for select
  using (public.current_profile_tier() = 'shop'
         and public.service_report_in_my_location(report_id));

drop policy if exists shop_insert_checklist_items on public.checklist_items;
create policy shop_insert_checklist_items on public.checklist_items for insert
  with check (public.current_profile_tier() = 'shop'
              and public.service_report_in_my_location(report_id));

drop policy if exists shop_update_checklist_items on public.checklist_items;
create policy shop_update_checklist_items on public.checklist_items for update
  using (public.current_profile_tier() = 'shop'
         and public.service_report_in_my_location(report_id))
  with check (public.current_profile_tier() = 'shop'
              and public.service_report_in_my_location(report_id));

drop policy if exists shop_delete_checklist_items on public.checklist_items;
create policy shop_delete_checklist_items on public.checklist_items for delete
  using (public.current_profile_tier() = 'shop'
         and public.service_report_in_my_location(report_id));

-- ── pdi_checklist_items ────────────────────────────────────────────────────
drop policy if exists shop_read_pdi_checklist_items on public.pdi_checklist_items;
create policy shop_read_pdi_checklist_items on public.pdi_checklist_items for select
  using (public.current_profile_tier() = 'shop'
         and public.pdi_report_in_my_location(pdi_report_id));

drop policy if exists shop_insert_pdi_checklist_items on public.pdi_checklist_items;
create policy shop_insert_pdi_checklist_items on public.pdi_checklist_items for insert
  with check (public.current_profile_tier() = 'shop'
              and public.pdi_report_in_my_location(pdi_report_id));

drop policy if exists shop_update_pdi_checklist_items on public.pdi_checklist_items;
create policy shop_update_pdi_checklist_items on public.pdi_checklist_items for update
  using (public.current_profile_tier() = 'shop'
         and public.pdi_report_in_my_location(pdi_report_id))
  with check (public.current_profile_tier() = 'shop'
              and public.pdi_report_in_my_location(pdi_report_id));

drop policy if exists shop_delete_pdi_checklist_items on public.pdi_checklist_items;
create policy shop_delete_pdi_checklist_items on public.pdi_checklist_items for delete
  using (public.current_profile_tier() = 'shop'
         and public.pdi_report_in_my_location(pdi_report_id));

-- ── parts ──────────────────────────────────────────────────────────────────
-- Currently org-scoped. Tighten to location-scoped for shop tier so a
-- Sausalito user doesn't see Seattle parts. Admins still see everything
-- in their org via is_admin(). DELETE was created_by-only for techs;
-- managers can now delete any part in their location (matches the
-- "manager edits team data" intent).
drop policy if exists parts_select on public.parts;
create policy parts_select on public.parts for select
  using (
    is_admin()
    or (public.current_profile_tier() = 'shop'
        and public.customer_in_my_location(customer_id))
  );

drop policy if exists parts_update on public.parts;
create policy parts_update on public.parts for update
  using (
    is_admin()
    or (public.current_profile_tier() = 'shop'
        and public.customer_in_my_location(customer_id))
  )
  with check (
    is_admin()
    or (public.current_profile_tier() = 'shop'
        and public.customer_in_my_location(customer_id))
  );

drop policy if exists parts_delete on public.parts;
create policy parts_delete on public.parts for delete
  using (
    is_admin()
    or (public.current_profile_tier() = 'shop'
        and public.customer_in_my_location(customer_id))
  );

-- parts_insert had no location filter at all (anyone in the org could insert).
-- Tightening to "must insert against a customer in my location".
drop policy if exists parts_insert on public.parts;
create policy parts_insert on public.parts for insert
  with check (
    is_admin()
    or (public.current_profile_tier() = 'shop'
        and public.customer_in_my_location(customer_id))
  );
