-- 052_fix_tenant_trigger_null_location.sql
--
-- set_customer_tenant() clobbers location_id with NULL, contradicting its own
-- comment. Migration 023 states:
--
--   "Override only when we have a real org for the caller; never clobber with
--    NULL (e.g. an invitee not yet promoted keeps whatever default applies)."
--
-- but the body guards only on org_id and then assigns location_id
-- unconditionally:
--
--   if found and prof.org_id is not null then
--     new.org_id       := prof.org_id;
--     new.location_id  := prof.location_id;   -- NULL for any org-wide admin
--   end if;
--
-- OBSERVED 2026-08-19/20. Connor's three admin profiles carry org_id (JBY) but
-- location_id NULL. Every client he creates therefore lands with
-- location_id = NULL, and disappears:
--
--   * dashboard  — app/dashboard/customers/page.tsx does
--                  .eq("location_id", loc); .eq() never matches NULL, so the
--                  client is invisible the moment any office is selected. The
--                  same pattern gates jobs, KPIs, the calendar and parts, which
--                  is why the calendar did not update either.
--   * other staff — location-scoped RLS hides it entirely. Verified by
--                  impersonation: admin saw 2 rows, a Seattle manager saw 0.
--
-- The write itself always succeeded (edge logs: POST /rest/v1/customers -> 201,
-- twice), which is why this read as "adding a client is broken" and produced a
-- duplicate on retry. A successful write whose result is invisible is worse
-- than a failed one.
--
-- Fix: honour the documented intent. Only override location_id when the
-- caller's profile actually has one. A caller-supplied location is then
-- preserved, which lets an org-wide admin file a client into the office they
-- are currently viewing. org_id remains unconditionally server-assigned, so
-- the IDOR that 023 closed stays closed.

create or replace function public.set_customer_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
begin
  if auth.uid() is null then
    return new;  -- service role / no JWT: trust explicit values
  end if;

  select org_id, location_id into prof
  from public.profiles
  where auth_id = auth.uid();

  if found and prof.org_id is not null then
    -- Tenancy is never client-controllable.
    new.org_id := prof.org_id;

    -- Office: only override when the caller HAS one. Previously this assigned
    -- prof.location_id unconditionally, so an org-wide admin (org set, no
    -- office) silently nulled the office and the row vanished from every
    -- location-filtered view.
    if prof.location_id is not null then
      new.location_id := prof.location_id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.set_customer_tenant() from public, anon, authenticated;
