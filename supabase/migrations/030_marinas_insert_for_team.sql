-- 030_marinas_insert_for_team.sql
-- Marinas are a shared preference list; pre-existing RLS only let admins add
-- them. The Create Job form needs an inline "+ Add new marina" option so the
-- people who actually know the names (managers + techs in the field) can grow
-- the list. Open INSERT to shop tier (managers + techs + viewers — viewers
-- are blocked at the UI by canWrite anyway) OR admins. Read stays open via
-- the existing auth_read_marinas policy.
-- Applied via Supabase MCP on 2026-06-08.

drop policy if exists shop_insert_marinas on public.marinas;
create policy shop_insert_marinas on public.marinas for insert
  with check (
    public.current_profile_tier() = 'shop'
    or public.is_admin()
  );
