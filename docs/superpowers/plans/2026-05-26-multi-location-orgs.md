# Multi-Location Organizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-level multi-tenancy (Organization → Location) so each location's clients/jobs are isolated, staff self-onboard per location via a join code, and the mobile app can add/delete clients.

**Architecture:** One Supabase database. New `organizations` + `locations` tables; `org_id`/`location_id` columns on `profiles`, `customers`, `boats`, `jobs`. Row-level security scopes every read/write to the caller's accessible locations (a `tech` → their one location; `owner`/`admin` → all locations in their org). Migration seeds Jeff Brown Yachts + 4 locations and backfills existing data to Seattle. Web portal gains an Organization screen + location switcher; mobile gains join-code sign-up and add/delete clients.

**Tech Stack:** Supabase Postgres + RLS, Next.js 16 (web, `@supabase/ssr`), Expo SDK 54 / React Native (`@supabase/supabase-js`, expo-router), TanStack Query.

**Safety:** This database powers a LIVE App Store app. The migration is staged (additive columns nullable → backfill → enforce NOT NULL → swap RLS) and applied to a **dev/staging branch or a Supabase branch first**, verified, then promoted. Do not run destructive statements on prod without a verified dry run.

---

## File Structure

**Database**
- Create: `supabase/migrations/015_orgs_locations.sql` — tables, columns, helper fn, RLS, backfill (JBY + 4 locations, existing → Seattle).

**Web (`app/`, `lib/`)**
- Create: `app/dashboard/organization/page.tsx` + `organization-manager.tsx` — owner screen (locations, join codes, move staff).
- Create: `lib/locations/queries.ts` — `getLocations`, `createLocation`, `rotateJoinCode`, `setActiveLocation` helpers.
- Create: `components/location-switcher.tsx` — header dropdown (owner/admin only).
- Modify: `app/dashboard/customers/customer-list.tsx` — write/read `location_id`; respect active location.
- Modify: `lib/calendar/queries.ts` — carry `location_id` on job create/read.
- Modify: dashboard layout/header to mount the switcher; store active location in a cookie.

**Mobile (`mobile/`)**
- Modify: mobile auth/sign-up screen — add join-code field; resolve to `org_id`/`location_id`.
- Modify: `mobile/app/(tabs)/index.tsx` (Clients) — add-client form + delete; show location badge.
- Create: `mobile/lib/clients.ts` — `addClient`, `deleteClient`, `getMyLocation` scoped helpers.

---

## Phase 1 — Database & RLS (foundation)

> Apply on a Supabase **branch/dev copy** first. Verify isolation, then promote to prod.

### Task 1: Create org/location tables + columns (additive, nullable)

**Files:** Create `supabase/migrations/015_orgs_locations.sql`

- [ ] **Step 1: Write the additive schema**

```sql
-- 015_orgs_locations.sql  (Part A: additive — safe, nothing enforced yet)
create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  join_code text unique not null default upper(substr(encode(gen_random_bytes(6),'hex'),1,8)),
  created_at timestamptz not null default now()
);

alter table profiles  add column if not exists org_id uuid references organizations(id);
alter table profiles  add column if not exists location_id uuid references locations(id);
alter table customers add column if not exists org_id uuid references organizations(id);
alter table customers add column if not exists location_id uuid references locations(id);
alter table boats     add column if not exists org_id uuid references organizations(id);
alter table boats     add column if not exists location_id uuid references locations(id);
alter table jobs      add column if not exists org_id uuid references organizations(id);
alter table jobs      add column if not exists location_id uuid references locations(id);

create index if not exists idx_customers_location on customers(location_id);
create index if not exists idx_boats_location on boats(location_id);
create index if not exists idx_jobs_location on jobs(location_id);
create index if not exists idx_profiles_location on profiles(location_id);
```

- [ ] **Step 2: Apply to a Supabase dev branch and verify**

Run (management API or `supabase db push` against the dev branch). Expected: tables exist, columns added, no errors.
Verify: `select count(*) from organizations;` → 0; `\d customers` shows `org_id`,`location_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_orgs_locations.sql
git commit -m "feat(db): add organizations/locations tables + tenant columns (additive)"
```

### Task 2: Seed JBY + 4 locations and backfill existing data

**Files:** Modify `supabase/migrations/015_orgs_locations.sql` (append Part B)

- [ ] **Step 1: Write the seed + backfill**

```sql
-- Part B: seed + backfill
do $$
declare org uuid; sea uuid;
begin
  insert into organizations (name) values ('Jeff Brown Yachts') returning id into org;
  insert into locations (org_id, name) values
    (org,'Sausalito'),(org,'San Diego'),(org,'Newport');
  insert into locations (org_id, name) values (org,'Seattle') returning id into sea;

  -- owner: Connor (match by profiles.email)
  update profiles set org_id = org, location_id = null, role = 'admin'
    where email = 'connorgray41@gmail.com';

  -- backfill existing tenant data → Seattle
  update customers set org_id = org, location_id = sea where location_id is null;
  update boats     set org_id = org, location_id = sea where location_id is null;
  update jobs      set org_id = org, location_id = sea where location_id is null;

  -- existing non-owner profiles → Seattle by default
  update profiles set org_id = org, location_id = sea
    where org_id is null;
end $$;
```

> Note: `role` values use the existing `profiles.role` enum/text (`admin`/`tech`). "Owner" privileges are represented by `role='admin'` + `location_id is null` (org-wide). If a dedicated `owner` role is preferred, add it to the enum in this step.

- [ ] **Step 2: Apply on dev branch; verify backfill**

Verify: `select count(*) from customers where location_id is null;` → 0. `select name, join_code from locations;` → 4 rows. Connor's profile `location_id is null`, `org_id` set.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_orgs_locations.sql
git commit -m "feat(db): seed JBY + 4 locations, backfill existing data to Seattle"
```

### Task 3: Enforce NOT NULL + RLS isolation

**Files:** Modify `supabase/migrations/015_orgs_locations.sql` (append Part C)

- [ ] **Step 1: Write helper + enforcement + policies**

```sql
-- Part C: enforce + isolate

alter table customers alter column location_id set not null;
alter table boats     alter column location_id set not null;
alter table jobs      alter column location_id set not null;
alter table profiles  alter column org_id      set not null;

-- accessible locations for the current auth user
create or replace function accessible_location_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select case
    when p.location_id is not null then p.location_id      -- tech: one location
    else l.id                                              -- admin/owner: all org locations
  end
  from profiles p
  left join locations l on l.org_id = p.org_id and p.location_id is null
  where p.auth_id = auth.uid()
$$;

-- replace prior "authenticated read all" policies on tenant tables
do $$ declare t text; begin
  foreach t in array array['customers','boats','jobs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format($f$create policy %1$I_select on %1$I for select using (location_id in (select accessible_location_ids()))$f$, t);
    execute format($f$create policy %1$I_write on %1$I for all using (location_id in (select accessible_location_ids())) with check (location_id in (select accessible_location_ids()))$f$, t);
  end loop;
end $$;

-- org/location visibility
alter table organizations enable row level security;
alter table locations enable row level security;
create policy org_read on organizations for select using (id in (select org_id from profiles where auth_id = auth.uid()));
create policy loc_read on locations for select using (org_id in (select org_id from profiles where auth_id = auth.uid()));
create policy loc_admin_write on locations for all using (org_id in (select org_id from profiles where auth_id = auth.uid() and location_id is null)) with check (org_id in (select org_id from profiles where auth_id = auth.uid() and location_id is null));
```

> Review the existing policy names in migrations 001–014 and `drop policy if exists` each old one on these tables by its real name before creating the new ones (the dynamic block covers common names; add any project-specific names found).

- [ ] **Step 2: Verify isolation on dev branch**

Create two test auth users via `auth.admin`: one Seattle tech (`location_id`=Seattle), one San Diego tech. As each (using their JWT), `select count(*) from customers`. Expected: Seattle tech sees the backfilled rows; San Diego tech sees 0. Owner (Connor) sees all.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_orgs_locations.sql
git commit -m "feat(db): enforce location_id NOT NULL + location-scoped RLS"
```

### Task 4: Promote migration to production

- [ ] **Step 1:** Snapshot/backup prod (Supabase dashboard → Database → Backups, confirm a recent point-in-time exists).
- [ ] **Step 2:** Apply `015_orgs_locations.sql` to prod (`ikfcnqdrlvhvlyhiuphs`) during low traffic.
- [ ] **Step 3:** Re-run the isolation verification (Task 3 Step 2) against prod test users; confirm the live app still loads Seattle data for existing users.
- [ ] **Step 4:** Commit nothing new (migration already committed); tag note in PR.

---

## Phase 2 — Web portal

### Task 5: Location queries + active-location cookie

**Files:** Create `lib/locations/queries.ts`

- [ ] **Step 1: Implement helpers**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getLocations(sb: SupabaseClient, orgId: string) {
  const { data } = await sb.from("locations").select("id,name,join_code,org_id").eq("org_id", orgId).order("name");
  return data ?? [];
}
export async function createLocation(sb: SupabaseClient, orgId: string, name: string) {
  const { data, error } = await sb.from("locations").insert({ org_id: orgId, name }).select().single();
  if (error) throw error;
  return data;
}
export async function rotateJoinCode(sb: SupabaseClient, locationId: string) {
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const { error } = await sb.from("locations").update({ join_code: code }).eq("id", locationId);
  if (error) throw error;
  return code;
}
```

- [ ] **Step 2: Active location cookie** — read/write `mt_active_location` cookie in a server util; default to the owner's first location or the user's `location_id`.
- [ ] **Step 3: Commit** `feat(web): location queries + active-location cookie`

### Task 6: Organization screen

**Files:** Create `app/dashboard/organization/page.tsx`, `app/dashboard/organization/organization-manager.tsx`; add nav link in dashboard sidebar.

- [ ] **Step 1:** Server `page.tsx` — `requireAdmin()`, load org + `getLocations`, pass to client manager. Mirror `app/dashboard/customers/page.tsx` structure.
- [ ] **Step 2:** Client `organization-manager.tsx` — list locations with name + join code + "copy sign-up link" (`/signup?code=<join_code>`) + "rotate code"; "add location" inline form (mirror `customer-list.tsx` add-customer pattern); "move staff" = select a profile + reassign `location_id`.
- [ ] **Step 3:** Verify in browser (logged in as Connor): see 4 locations + codes; add a 5th; rotate a code; move a test profile. `router.refresh()` after each.
- [ ] **Step 4: Commit** `feat(web): organization management screen`

### Task 7: Location switcher + scope customers/jobs

**Files:** Create `components/location-switcher.tsx`; modify dashboard header, `app/dashboard/customers/customer-list.tsx`, `lib/calendar/queries.ts`.

- [ ] **Step 1:** `location-switcher.tsx` — dropdown of the owner's locations (hidden for single-location techs); selecting sets the `mt_active_location` cookie + `router.refresh()`.
- [ ] **Step 2:** Customers/jobs reads filter by the active location; inserts set `location_id` = active location, `org_id` = org. (RLS already prevents cross-location, this keeps the UI coherent.)
- [ ] **Step 3:** Verify: switch to San Diego (empty) → no clients; switch to Seattle → existing clients; add a client in San Diego → appears only there.
- [ ] **Step 4: Commit** `feat(web): location switcher + location-scoped customers/jobs`

### Task 8: Deploy web

- [ ] Build + deploy to Cloudflare (`npm run build:cf && wrangler deploy` per repo). Smoke-test login + location switch on the live URL.

---

## Phase 3 — Mobile app

### Task 9: Join-code sign-up

**Files:** Modify mobile auth/sign-up screen (locate under `mobile/app/` — the sign-up/onboarding route); create `mobile/lib/clients.ts` `getMyLocation`.

- [ ] **Step 1:** Add a "Join code" text field to sign-up. On submit: `signUp` → then look up `locations` by `join_code` (via an RPC or a public `select id,org_id from locations where join_code = ?` allowed pre-profile) → set the new profile's `org_id`/`location_id`. Implement as a Supabase RPC `join_with_code(code text)` (security definer) that validates the code and stamps the caller's profile, to avoid exposing all locations.
- [ ] **Step 2:** Add RPC to migration 015 Part C:

```sql
create or replace function join_with_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare loc locations%rowtype;
begin
  select * into loc from locations where join_code = code;
  if not found then raise exception 'invalid join code'; end if;
  update profiles set org_id = loc.org_id, location_id = loc.id where auth_id = auth.uid();
  return loc.id;
end $$;
```

- [ ] **Step 3:** Verify: sign up a fresh user with Seattle's code on a simulator → profile gets Seattle `location_id`; with a bad code → error.
- [ ] **Step 4: Commit** `feat(mobile): join-code sign-up`

### Task 10: Add/delete clients on mobile

**Files:** Create `mobile/lib/clients.ts`; modify `mobile/app/(tabs)/index.tsx`.

- [ ] **Step 1:** `clients.ts` — `addClient(sb, {name,phone,email,notes})` inserts with `location_id`/`org_id` from the caller's profile (or omit and let an INSERT trigger/default set it from `accessible_location_ids()`); `deleteClient(sb, id)`.
- [ ] **Step 2:** Clients tab — `＋ Add client` opens a `@gorhom/bottom-sheet` form (reuse the existing sheet pattern); on save, insert + refetch (existing `fetchClients`). Swipe row → confirm → `deleteClient` + refetch. Mirror the `feat/mobile-job-edit` branch's edit/delete UX.
- [ ] **Step 3:** Add a location badge in the Clients header from `getMyLocation`.
- [ ] **Step 4:** Verify on simulator (Seattle user): add a client → appears in the list and in the web portal under Seattle; delete → gone in both; a San Diego user never sees it.
- [ ] **Step 5: Commit** `feat(mobile): add/delete clients scoped to location`

### Task 11: Mobile build

- [ ] EAS build (per `mobile/eas.json`) when ready; the join-code + add-client flow becomes the next app version (1.1).

---

## Verification (end-to-end)

- **Isolation (DB):** Seattle tech and San Diego tech each see only their location's clients/jobs — verified by querying as each user, not just the UI.
- **Migration:** all pre-existing clients/jobs under Seattle; `location_id` NOT NULL holds; live app still works for existing users.
- **Sign-up:** Seattle code → Seattle; bad code → rejected; rotating a code invalidates the old one.
- **Mobile add/delete:** add a client on mobile (Seattle) → visible to another Seattle user + web portal; delete removes it everywhere.
- **Owner:** Connor switches locations and sees each; a tech cannot.
- **Builds:** web typecheck + build + Cloudflare deploy clean; mobile typecheck + EAS build clean.

## Self-review notes

- Spec coverage: org/location model (Task 1), isolation+RLS (Task 3), migration+Seattle backfill (Task 2/4), join-code sign-up (Task 9 + RPC), mobile add/delete (Task 10), web Organization screen + switcher (Tasks 6–7) — all mapped.
- "Owner" is modeled as `role='admin'` + `location_id is null` to avoid an enum migration; revisit if a distinct owner role is wanted.
- Existing RLS policy names in migrations 001–014 must be confirmed and dropped by real name in Task 3 before creating new ones.
