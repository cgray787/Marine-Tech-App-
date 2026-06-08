# Multi-Location Expansion — Sausalito + San Diego Runbook

**Date:** 2026-06-07
**Status:** Reference doc + onboarding runbook. Apply when opening a second office.
**Prereqs:** Migrations 015, 017, 018, 024, 026, 027 already applied to `ikfcnqdrlvhvlyhiuphs`.

## Current state (as of 2026-06-07)

The Marine Tech data model is **already multi-location aware** thanks to migrations 015 / 017 / 018 / 027. Beta is live in Seattle; expanding to a second office is a configuration change, not a schema change.

### Role model (live)

| Role | Visibility | Mutations | Who manages roles |
|---|---|---|---|
| **Owner** (allowlist in `lib/owner.ts` + `is_owner()` SQL) | Everything across every location | Everything | Self — the operator, currently Connor |
| **admin** | Org-wide (legacy admin profiles) | Org-wide | Owner only |
| **manager** | One location (`profiles.location_id`) | Full create / edit / delete within that location, including other techs' work | Owner only |
| **tech** (Edit) | One location | Full create / edit / delete within that location | Owner only |
| **viewer** (Read-only) | One location | None | Owner only |

The Technicians page (`/dashboard/technicians`) is **owner-only** at three layers:

1. Sidebar filter (`lib/owner.ts` + `isOwner(profile)`)
2. Page redirect (`lib/owner-guard.ts` → `requireOwner()`)
3. SQL RPCs `admin_set_user_role` + `admin_delete_user` gated on `public.is_owner()` (migration 026)

### Owner allowlist (must stay in sync)

Two places must agree on which auth identities are owners:

- `lib/owner.ts` — TypeScript constants `OWNER_EMAILS` + `OWNER_AUTH_IDS`
- `public.is_owner()` SQL function — created by migration 026

Currently:

- `connorgray@jeffbrownyachts.com` (canonical JBY admin)
- `connorgray41@gmail.com` (personal Gmail)
- `xv2hp9sc2j@privaterelay.appleid.com` (Apple Sign-In alias)
- auth_id `ec4c6451-623a-4a41-9dde-0cd48afc767d` (CLAUDE.md admin auth_id)

### Locations in the JBY org

```
Seattle    665e7a6b-968b-46a3-87a3-ec6050ab8ffc  (active beta)
Sausalito  aca07f4b-2c93-471b-b2ef-a9e4428fab24  (planned)
San Diego  af0eb6a2-0866-4919-959e-940baea9205d  (planned)
Newport    3a2c83ac-2195-41c3-909a-e7495103c49b  (exists, no plans yet)
```

Join codes (for code-redemption signup, not yet wired in mobile):

```
Seattle    0C9F7087
Sausalito  0855D1E8
San Diego  4CCB7302
Newport    A0E876F1
```

## How RLS isolates locations

Migration 017 + 018 + 027 add **shop-tier** RLS policies that filter on
`location_id = public.current_profile_location()` (for customers) or
`customer_in_my_location(customer_id)` (for boats / jobs).

So a `manager` + `tier='shop'` + `location_id=Seattle` profile sees:

- All Seattle customers
- All boats whose parent customer is in Seattle
- All jobs whose parent customer is in Seattle
- All service_reports / pdi_reports / parts / report_photos under those jobs

…and **nothing** from Sausalito / San Diego / Newport. The cross-location filter is enforced at the database, not just in app code — a hostile client calling the Supabase REST API directly still gets zero rows.

Admins and the Owner bypass this filter via separate `admin_all_*` policies + the `is_owner()` allowlist.

## Onboarding a Sausalito tech lead (the actual runbook)

Suppose Sausalito's tech manager is `manager.sausalito@jeffbrownyachts.com`. From "they don't have an account" to "fully working" takes **4 SQL statements + 1 dashboard click**.

### Step 1 — Send them an invite (from the Technicians page)

Currently the existing invite flow creates profiles at `tier='individual'` + `location_id=NULL` (per migration 013 + the invite footgun noted in CLAUDE.md). After they accept and create their password, run step 2 to fix that.

### Step 2 — Promote them to manager + Sausalito (Owner-only SQL)

Run from the Supabase SQL Editor or via `mcp__supabase__execute_sql`:

```sql
update public.profiles
   set role        = 'manager',
       tier        = 'shop',
       location_id = 'aca07f4b-2c93-471b-b2ef-a9e4428fab24'  -- Sausalito
 where auth_id = '<sausalito-leads-auth-id>';
```

That's it for them. The existing `shop_*` RLS policies handle isolation.

### Step 3 — Seed at least one Sausalito customer / boat / job

Sausalito starts empty. From Connor's owner account or via SQL:

```sql
insert into public.customers (name, email, phone, location_id, org_id, created_by)
values ('First Sausalito Customer',
        'customer@example.com',
        '+14155551212',
        'aca07f4b-2c93-471b-b2ef-a9e4428fab24',
        'e22d5492-3ec1-4d5c-9118-b2eba8880586',  -- JBY org
        '<inserting-user-auth-id>');
```

Once seeded, the Sausalito manager logs in and sees their location populated.

### Step 4 — Verify isolation

After step 2 and step 3, run as a sanity check:

```sql
-- As the Sausalito manager (impersonate via service-role then set jwt locally,
-- OR simply have them log in and look at the Customers tab):
select count(*) from public.customers;
-- should equal: only Sausalito rows. Seattle rows must NOT appear.
```

If the manager sees Seattle data, the most likely cause is `tier <> 'shop'` (check step 2) or `location_id` set to the wrong UUID.

### Step 5 — Mobile join code (optional, not yet wired)

The plan in migration 015 has a code-redemption signup: a user signs up via mobile, types the join code `0855D1E8`, and gets auto-assigned to Sausalito. That flow isn't built in the mobile app yet. Until it is, step 2 (manual SQL) is the path for every new Sausalito teammate too.

## Known gaps to close before Sausalito launches

These aren't blockers for beta-in-Seattle but become real friction with two offices.

| # | Gap | Impact | Fix complexity |
|---|---|---|---|
| 1 | Web UI has no location switcher / no "current location" badge for owner | Owner sees aggregated data but can't easily filter "show me only Seattle" | small (~20 lines, dropdown in header) |
| 2 | Mobile signup join-code flow not wired | Every new teammate needs SQL step 2 by hand | medium — needs an `invite_with_location` RPC + mobile UI |
| 3 | The Calendar tab currently shows all jobs the operator can see — for a multi-location owner, that means everything bunched together | Owner has to mentally separate locations | small (filter dropdown wired through the existing `getJobsInRange` query) |
| ~~4~~ | ~~`service_reports`, `pdi_reports`, `parts`, `report_photos` RLS not audited for the manager path~~ | **CLOSED 2026-06-07** | migrations 028 + 029. Every shop-scoped table (boats, customers, jobs, service_reports, pdi_reports, report_photos, checklist_items, pdi_checklist_items, parts) now has full SELECT/INSERT/UPDATE/DELETE policies with location filtering. The previously-permissive `tech_insert_jobs` (`WITH CHECK true`) was replaced with tier-aware policies. |
| 5 | `assigned_to` reassignment isn't gated to "must be a tech in my location" | A manager could currently assign a Seattle job to a Sausalito tech if they knew the auth_id | small — add a trigger or a tighter UPDATE check policy |
| 6 | No way to surface "this user has no location_id assigned yet" warning in the Technicians page | Footgun from migration 013 — invitees show up as `individual` + NULL location and see nothing | tiny — badge on the profile card if location_id is null |

When Sausalito timeline becomes concrete, tackle remaining in order: 5, 1, 6, 3, 2.

## Files involved (so you know where to look)

- **Schema:** `supabase/migrations/015_orgs_locations.sql` (creates orgs + locations + join codes), `017_location_scoped_office_isolation.sql` (shop-tier read RLS), `018_shop_update_delete_policies.sql` (shop-tier update/delete for boats + customers — note: jobs were added later in 027), `027_manager_role.sql` (manager role + shop UPDATE/DELETE for jobs + Derik promotion).
- **App helpers:** `lib/owner.ts` (pure isOwner check), `lib/owner-guard.ts` (server-only requireOwner), `lib/admin.ts` (requireAdmin), `app/dashboard/sidebar.tsx` (filters Technicians link), `app/dashboard/technicians/page.tsx` (owner-gated page), `app/dashboard/technicians/manage-user-controls.tsx` (the role dropdown).
- **Mobile:** Tier/location enforcement is purely RLS-based, so no mobile code changes are required for new locations; the app just respects whatever Supabase returns.

## Quick-reference UUIDs

```
JBY org id      e22d5492-3ec1-4d5c-9118-b2eba8880586
Seattle         665e7a6b-968b-46a3-87a3-ec6050ab8ffc
Sausalito       aca07f4b-2c93-471b-b2ef-a9e4428fab24
San Diego       af0eb6a2-0866-4919-959e-940baea9205d
Newport         3a2c83ac-2195-41c3-909a-e7495103c49b

Connor (JBY admin)    ec4c6451-623a-4a41-9dde-0cd48afc767d
Connor (personal)     58d78989-9dca-4267-bc3f-62ae3122335c
Connor (Apple SI)     3821416d-961d-47c2-b670-a87c5292d825
Derik                 657000b6-6c4c-4dcd-b115-f84048fb677d
Tommy                 423e6596-4ff1-4537-a68e-717040e239e4
```

## Resume phrase

*"Open Sausalito on Marine Tech."* → re-read this doc, walk steps 1–5 with the new tech lead's auth_id substituted in. Tackle gap 4 first (RLS audit on reports/parts) before they touch real data.
