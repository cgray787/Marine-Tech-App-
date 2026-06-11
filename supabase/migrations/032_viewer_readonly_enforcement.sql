-- 032_viewer_readonly_enforcement.sql
-- Enforce "viewer = read-only" at the database layer.
--
-- Every shop_* mutation policy (migrations 015/017/018/027/028/029/030)
-- checks tier + location but never role, so a shop-tier `viewer` could
-- INSERT/UPDATE/DELETE through the REST API even though the role table
-- says viewers have no mutations (the UI merely hides the buttons).
--
-- Fix: one helper + RESTRICTIVE policies on the write commands of every
-- user-writable table. Restrictive policies AND with the existing
-- permissive ones, so no existing policy needs rewriting. SELECT is
-- untouched — viewers keep full read access. Service-role (portal,
-- edge functions, triggers) bypasses RLS entirely and is unaffected.

create or replace function public.profile_can_write() returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles
    where auth_id = auth.uid()
      and role in ('admin', 'manager', 'tech', 'owner')
  );
$$;

revoke all on function public.profile_can_write() from public, anon;
grant execute on function public.profile_can_write() to authenticated;

-- Apply to every table a field/dashboard user can write. profiles and
-- invites are intentionally excluded (self-service profile edits and the
-- admin-only invite flow have their own gating).
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'boats', 'jobs', 'marinas',
    'service_reports', 'pdi_reports', 'report_photos',
    'checklist_items', 'pdi_checklist_items', 'parts'
  ]
  loop
    execute format('drop policy if exists writers_only_insert on public.%I', t);
    execute format(
      'create policy writers_only_insert on public.%I as restrictive for insert
         with check (public.profile_can_write())', t);

    execute format('drop policy if exists writers_only_update on public.%I', t);
    execute format(
      'create policy writers_only_update on public.%I as restrictive for update
         using (public.profile_can_write())
         with check (public.profile_can_write())', t);

    execute format('drop policy if exists writers_only_delete on public.%I', t);
    execute format(
      'create policy writers_only_delete on public.%I as restrictive for delete
         using (public.profile_can_write())', t);
  end loop;
end $$;
