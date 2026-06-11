# Multi-Location Organizations — Design

**Date:** 2026-05-26
**Status:** Approved (brainstorming) → ready for implementation plan

## Context

Today the Marine Tech app is single-tenant: one shared pool of `customers`, `boats`, and `jobs` that every authenticated user sees. The web portal can create these; the mobile app can only view them.

Connor wants the app to support **multiple locations**, each with its own private data, and to be sellable to other marine businesses later. Example: **Jeff Brown Yachts** (organization) operates in **Sausalito, San Diego, Seattle, Newport** (locations). A client added in Seattle must be visible only to people logged into Seattle. A future customer business becomes a new organization with its own locations — no re-architecture.

This is a two-level multi-tenant model: **Organization → Location**, with data isolation at the **location** level.

## Goals

- Two-level hierarchy: an organization owns many locations; clients/jobs/boats belong to exactly one location.
- Hard data isolation between locations, enforced in the database (RLS), not just the UI.
- Per-location sign-up via a join code, so staff self-onboard into the right location.
- Mobile app can **add and delete clients** (today it only views).
- Owner can see/manage all locations in their org; members are scoped to one location.
- Architecture ready to become a sellable multi-tenant product (each business = an org) without redesign.

## Non-goals (v1)

- Billing / subscriptions / payments.
- A cross-organization platform super-admin.
- Add/edit **jobs** from mobile (jobs remain viewable on mobile, managed on web).
- Granular custom roles beyond owner / admin / member.
- Self-serve org creation UI for new businesses (org creation is manual/seeded in v1; the model supports self-serve later).

## Data model

```
organizations (NEW)
  id uuid pk, name text, created_by uuid, created_at

locations (NEW)
  id uuid pk, org_id uuid fk→organizations, name text,
  join_code text unique, created_at

profiles (EXTEND)
  + org_id uuid fk→organizations
  + location_id uuid fk→locations   (null for org-level owner/admin)
  role: 'owner' | 'admin' | 'tech'  (owner/admin = org-wide; tech = one location)

customers / boats / jobs (EXTEND)
  + location_id uuid fk→locations   (NOT NULL after migration)
  + org_id uuid fk→organizations    (denormalized for convenient org-wide queries)
```

- `service_reports`, `pdi_reports`, `checklist_items`, `report_photos` inherit scoping transitively through their `job_id`/`customer_id`; they do not strictly need their own `location_id`, but we add `org_id`/`location_id` where it simplifies RLS (decided in the plan).
- A user belongs to one org. A `tech` belongs to one location. An `owner`/`admin` is org-scoped and can act on any location in the org.

## Access control (RLS)

RLS is enabled on all tenant tables. A SQL helper resolves the current user's accessible locations from their `profiles` row:

- **tech** → exactly their `location_id`.
- **owner / admin** → all `locations.id` where `org_id` = their org.

Policies (SELECT / INSERT / UPDATE / DELETE) on `customers`, `boats`, `jobs` (and reports via their parent) require the row's `location_id` to be in the caller's accessible set. INSERTs must set `location_id` to an accessible location. This is the security guarantee: a Seattle tech cannot read or write San Diego rows even if the app misbehaves.

`organizations` / `locations`: readable by members of that org; writable by owner/admin only. `join_code` is readable by owner/admin (to share/rotate).

## Migration (one-time, JBY)

1. Create org **"Jeff Brown Yachts"**; set `created_by` = Connor.
2. Create locations: **Sausalito, San Diego, Seattle, Newport**, each with a generated unique `join_code`.
3. Set Connor's profile → `role='owner'`, `org_id`=JBY, `location_id`=null.
4. Backfill all existing `customers`, `boats`, `jobs` → **Seattle** location (`org_id`=JBY). Existing techs → Seattle unless reassigned.
5. Add `location_id`/`org_id` columns nullable, backfill, then set **NOT NULL** and add FKs.
6. Replace the current "authenticated read all" RLS policies with the location-scoped policies above.

Migration is a new numbered file under `supabase/migrations/` (next after 014). Reversible where practical; data backfill documented.

## Onboarding / sign-up

- Each location has a `join_code` + a shareable sign-up link that pre-fills it.
- **Mobile sign-up** gains a "join code" field: enter code → account created with that location's `org_id`/`location_id` → immediately sees that location's data.
- **Web Organization screen** (owner/admin): list locations, view/rotate join codes, copy sign-up links, create locations, move staff between locations.
- The existing email-invite flow is retained for admins but is no longer required.

## App changes

**Mobile (`mobile/`)** — mirrors existing patterns (`mobile/app/(tabs)/index.tsx`, `mobile/lib/supabase.ts`):
- Sign-up screen: add join-code step (ties account to a location).
- Clients tab: **＋ Add client** form (name, phone, email, boat, notes) → insert scoped to the user's location; **delete** via swipe + confirm.
- Location badge in the header.
- Reuse the `feat/mobile-job-edit` branch's edit/delete patterns where applicable.

**Web portal (`app/dashboard/`)** — mirrors `app/dashboard/customers/customer-list.tsx`:
- New **Organization** screen (owner-only).
- **Location switcher** in the dashboard header; Customers/Jobs pages filter to the active location and write the correct `location_id`.

## Critical files

- `supabase/migrations/` — new migration (orgs, locations, columns, RLS, backfill).
- `mobile/lib/supabase.ts`, `mobile/app/(tabs)/index.tsx`, mobile sign-up/auth screens.
- `lib/supabase/{client,server}.ts`, `app/dashboard/customers/customer-list.tsx`, new `app/dashboard/organization/`.
- `lib/calendar/queries.ts` (jobs queries now carry `location_id`).

## Verification

- **Isolation:** sign up a test member into Seattle and another into San Diego; confirm each sees only their location's clients/jobs (DB-level — verify by querying as each user / via RLS, not just UI).
- **Migration:** all pre-existing clients/jobs appear under Seattle; nothing orphaned; `location_id` NOT NULL holds.
- **Mobile add/delete:** add a client on mobile in Seattle → appears for another Seattle user and in the web portal under Seattle; delete removes it everywhere.
- **Owner view:** owner can switch locations and see each location's data; a tech cannot.
- **Join code:** signing up with Seattle's code lands the user in Seattle; rotating the code invalidates the old one.
- Build/typecheck mobile (Expo) + web (Next) clean; deploy web to Cloudflare; EAS build for mobile when ready.
