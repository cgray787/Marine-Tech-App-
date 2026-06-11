# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Marine Tech App

## Project Overview

Field service app for marine technicians to document boat service jobs and pre-delivery inspections. Structured checklists with BAD/GOOD assessments, photo capture (HIN plates, engine hours, damage), and report submission. Admin web dashboard for reviewing reports, managing technicians, and seeing all scheduled work on a calendar.

## Architecture

Two codebases, one Supabase backend:

- **Mobile App** (`/mobile`) — React Native + Expo (technician-facing, iOS + Android)
- **Admin Dashboard** (root `/`) — Next.js 16 web app (owner-facing, deployed to Cloudflare Workers)
- **Backend** — Supabase (auth, Postgres database, file storage, Realtime)

## Tech Stack

### Mobile App
- **Framework:** React Native with Expo SDK 54
- **Navigation:** Expo Router (file-based, 5-tab layout)
- **Camera:** expo-camera + expo-image-picker
- **Auth Storage:** expo-secure-store
- **Offline:** expo-sqlite (`useOffline` context queues mutations)
- **Calendar:** react-native-calendars + @gorhom/bottom-sheet
- **Data fetching:** @tanstack/react-query (with Supabase Realtime invalidation)

### Admin Dashboard
- **Framework:** Next.js 16 (App Router) with TypeScript
- **Styling:** Tailwind CSS v4
- **UI primitives:** Radix UI (popover, dialog), lucide-react (icons)
- **Calendar:** react-big-calendar (Month/Week/Day views) with custom theme overrides
- **Data fetching:** @tanstack/react-query (with Supabase Realtime invalidation)
- **Date utilities:** date-fns
- **Deployment:** Cloudflare Workers via OpenNext

### Tests
- **Web unit:** vitest + @testing-library/react
- **Web e2e:** Playwright (Chromium)
- **Mobile e2e:** Maestro (YAML flows)

## Design Scheme

- **Primary BG:** `#060a12`
- **Secondary BG:** `#0c1220`
- **Card BG:** `#0d1320` (calendar) / `#111827` (other)
- **Borders:** `#1a2236` (calendar) / `#1e293b` (other)
- **Gold Accent:** `#C9A96E` (hover: `#d4b87e`, muted: `rgba(201,169,110,0.08)` for "today" highlight)
- **Text Primary:** `#f1f5f9`
- **Text Secondary:** `#8892A5`
- **Status — Good:** `#22c55e` (green)
- **Status — Bad:** `#ef4444` (red)
- **Status — New (calendar stripe):** `#4ade80`
- **Status — In Progress (calendar stripe):** `#f59e0b`
- **Status — Completed (calendar stripe):** `#94a3b8`
- **Tech color palette (calendar, hashed from tech.id):** `#3b6cd6 #a855f7 #ec4899 #f97316 #14b8a6 #84cc16 #f59e0b #06b6d4`

## Commands

```bash
# Mobile App (from /mobile)
npm start              # Start Expo dev server
npm run ios            # Run on iOS simulator
npm run android        # Run on Android emulator

# EAS Build — run from /mobile
npx eas build --platform ios --profile development     # Dev client (iOS simulator)
npx eas build --platform android --profile development # Dev client (Android)
npx eas build --platform ios --profile preview         # Internal iOS build (TestFlight)
npx eas build --platform android --profile preview     # Internal Android APK
npx eas build --platform ios --profile production      # App Store build
npx eas build --platform android --profile production  # Play Store build
npx eas submit --platform ios                          # Submit to TestFlight / App Store

# OTA JS updates (build 24+ only)
npx eas-cli update --branch production --message "..." # Push JS-only patch to production channel

# App Store Connect API (from repo root, requires AuthKey_2B5Z869244.p8 at mobile/.secrets/)
node mobile/scripts/asc-builds.mjs                     # List recent builds
node scripts/asc-submit.mjs <version> <buildNum>       # Create version + attach build + submit for review (root scripts/)
node scripts/asc-resubmit.mjs                          # Retry submit past post-attach 409 (STATE_ERROR) (root scripts/)

# Mobile e2e (Maestro — install: curl -Ls "https://get.maestro.mobile.dev" | bash)
maestro test mobile/.maestro/calendar.yaml             # Run a single flow

# Admin Dashboard (from root /)
npm run dev                                            # Start Next.js dev server
npm test                                               # Run vitest unit tests
npm run test:watch                                     # Vitest in watch mode
npm run test:e2e                                       # Playwright e2e tests
npm run deploy                                         # Deploy to CF Workers (sources .env.local, cleans .next/.open-next, builds, deploys)

# Type check
npx tsc --noEmit       # Run from /mobile or root as needed
```

## GitHub Repo

https://github.com/cgray787/Marine-Tech-App-.git

## Live URLs

- **Admin dashboard (canonical):** `https://marinetech.grayyachts.com` — custom domain on the Cloudflare-managed grayyachts.com zone (wrangler auto-creates DNS + TLS on deploy)
- **Fallback:** `https://marine-tech-dashboard.connorgray41.workers.dev` — kept alive via `workers_dev = true` for old bookmarks/docs
- **Second dashboard:** grayyachts.com `/portal/marine-tech` (lives in the separate `~/Desktop/Claude OS/grayyachts.com` repo, same Supabase backend, different UI). **Both dashboards are canonical — mirror dashboard UI changes across both repos.**
- Dashboard login is protected by Cloudflare Turnstile ('Marine Tech Login' widget; public sitekey in `wrangler.toml`, paired `TURNSTILE_SECRET` wrangler secret — falls back to Cloudflare's always-passes test secret if unset)

## Supabase

- **Project:** Marine Tech App Project
- **Org:** JBY Yachts
- **Project ID:** `ikfcnqdrlvhvlyhiuphs`
- **URL:** `https://ikfcnqdrlvhvlyhiuphs.supabase.co`
- **Region:** West US (Oregon)
- **Admin email:** connorgray@jeffbrownyachts.com
- **Admin auth_id:** `ec4c6451-623a-4a41-9dde-0cd48afc767d`
- **Env vars:** `.env.local` (gitignored). Public values are also in `wrangler.toml`. Service role key lives as a Cloudflare secret (`npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`).

## Database Schema

**Tables (live as of migration 031):**

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | User accounts | `id`, `full_name`, `role` (`admin`/`tech`/`viewer`), `status`, **`tier`** (`individual`/`shop`/`free`), **`org_id`**, **`location_id`** |
| `orgs` | Organizations (multi-tenant) | `id`, `name` (e.g. "Jeff Brown Yachts") |
| `locations` | Org sub-locations (offices/marinas) | `id`, `org_id`, `name` (Sausalito / San Diego / Seattle / Newport), `join_code` |
| `customers` | Boat owner contacts | `id`, `name`, `email`, `phone`, `address`, `created_by`, **`location_id`**, **`salesforce_account_id`**, **`salesforce_url`** |
| `boats` | Vessels linked to customers | `id`, `customer_id`, `name`, `make_model`, `year`, `hin`, `engine_make`, `engine_model`, `color`, `home_marina` |
| `marinas` | Marina records (separate from `locations`) | `id`, `name`, `address`, `city`, `state` |
| `jobs` | Assigned work orders | `id`, `assigned_to`, `customer_id`, `boat_id`, `marina_id`, `service_types[]`, `scheduled_date` (legacy), `scheduled_start` (timestamptz), `scheduled_end` (timestamptz), **`scheduled_end_date`** (multi-day), `location_override` (text), `status` (`new`/`in_progress`/`completed`), `notes` |
| `service_reports` | Completed report data | vessel snapshot, engine data, work description, parts, status, submitted/reviewed_at |
| `checklist_items` | BAD/GOOD assessments per report | category (`engine`/`electrical`/`hull`/`safety`/`nav`), item_name, assessment, notes, sort_order |
| `report_photos` | Photos attached to reports | `report_id`, `bucket`, `category` (`hin_plate`/`engine_hours`/`before`/`after`/`damage`), `caption` |
| `pdi_reports` | Pre-Delivery Inspection reports | same shape as service_reports |
| `pdi_checklist_items` | PDI assessments | same shape as checklist_items |
| `invites` | Tech invite tokens (7-day expiry) | `token`, `email`, `expires_at`, `used_at` (no tier/location columns — invitees default to `individual` + NULL location, must be promoted post-signup) |
| `parts` | Parts-to-order from service reports | `name`, `part_number`, `qty`, `description`, `supplier`, `url`, `photo_path`, `ordered`, `notified_at`, `org_id` (set by trigger), `location_id` |

**Migrations:**
- `001_create_tables.sql` — all base tables + RLS enabled
- `002_add_push_token.sql` — `profiles.push_token` (push notification subsystem since removed)
- `003_job_webhook.sql` — webhook trigger on `jobs` insert/update
- `004_tech_insert_customers_boats.sql` — RLS allowing techs to add customers/boats
- `005_fix_rls_infinite_recursion.sql` — RLS recursion fix
- `006_security_hardening.sql` — RLS hardening
- `007_tech_edit_delete_jobs.sql` — RLS allowing techs to edit/delete their own jobs
- `008_jobs_scheduled_timestamps.sql` — adds `scheduled_start`, `scheduled_end`, `location_override` to `jobs`
- `009_viewer_role.sql` — adds `viewer` role
- `010_public_signup_tier.sql` — adds `profiles.tier` (`individual`/`shop`/`free`) + tier-aware RLS; gates the Clients list (App Review fix for Guideline 3.2)
- `011_drop_soft_caps_add_account_deletion.sql` — removes free-tier soft caps, adds self-serve account deletion
- `012_profile_delete_set_null_fks.sql` — switch `customers.created_by` / `jobs.assigned_to` to ON DELETE SET NULL so profile deletes don't cascade
- `013_handle_new_user_trigger.sql` — auto-create `profiles` row on auth signup
- `014_jobs_scheduled_end_date.sql` — adds `jobs.scheduled_end_date` for multi-day scheduling (used by mobile long-press scheduling)
- `015_orgs_locations.sql` — adds `orgs` + `locations` tables, tags existing profiles/customers/boats/jobs to Seattle (additive only, no RLS isolation yet)
- `016_customer_salesforce_link.sql` — adds `customers.salesforce_account_id` (stable join key) + `customers.salesforce_url` (deep link) + index
- `017_location_scoped_office_isolation.sql` — shop-tier users now scoped to **their own office** via `profiles.location_id`. Adds `current_profile_location()` and `customer_in_my_location(uuid)` SECURITY DEFINER helpers; rewrites `shop_read_customers` / `shop_read_boats` / `shop_read_jobs` RLS policies
- `018_shop_update_delete_policies.sql` — shop-tier update/delete RLS policies
- `019_boats_engine_hours.sql` — adds `boats.engine_hours_port` + `boats.engine_hours_starboard` (numeric, per-engine hour readings; surfaced in Add/Edit Boat + boat detail + the service-report PDF)
- `020_customers_salesforce_synced_at.sql` — adds `customers.salesforce_synced_at` (observability for the SF auto-link)
- `021_customers_salesforce_sync_trigger.sql` — `pg_net` AFTER INSERT trigger `customer_salesforce_sync` → calls the `salesforce-sync` edge function (gated to JBY org + not-yet-linked); reads shared secret from Vault
- `022_salesforce_sync_secrets_rpc.sql` — `salesforce_sync_secrets()` service-role-only RPC returning the SF refresh token + sync secret from Vault
- `023_customers_tenant_from_profile.sql` — `set_customer_tenant` BEFORE INSERT trigger derives `customers.org_id`/`location_id` from the inserting user's profile (blocks client tenant-spoofing; service-role inserts keep explicit values)
- `024_admin_user_management.sql` — `admin_set_user_role(target,role)` + `admin_delete_user(target)` admin-only RPCs (gated by `is_admin()`, block acting on self) powering the dashboard Users & Access page
- `025_parts.sql` — `parts` table (parts-to-order) + RLS + `current_profile_org()` helper + `set_part_org` BEFORE INSERT org-assign trigger
- `026_owner_only_user_management.sql` — `is_owner()` SQL helper (mirrors `lib/owner.ts` email + auth_id allowlist) + re-gates `admin_set_user_role` / `admin_delete_user` on `is_owner()` instead of `is_admin()`. Role-management is now Owner-only at the database layer.
- `027_manager_role.sql` — adds `manager` role + `is_manager()` helper + fixes a latent bug from migration 018 (missing `shop_update_jobs` / `shop_delete_jobs`). Promotes Darik to `manager` + Seattle. Multi-location data model is now ready for Sausalito / San Diego — see `docs/superpowers/specs/2026-06-07-multi-location-expansion.md` for the onboarding runbook.
- `028_rls_audit_reports_parts.sql` — completes the location-scoped RLS audit across every shop-sensitive table: adds the missing shop SELECT/INSERT/UPDATE/DELETE for `service_reports`, `pdi_reports`, `report_photos`, `checklist_items`, `pdi_checklist_items`; replaces the org-only parts policies with location-scoped ones. Adds `service_report_in_my_location()` and `pdi_report_in_my_location()` helpers for chained joins.
- `029_tighten_shop_inserts.sql` — closes three remaining cross-location INSERT holes: replaces the permissive `tech_insert_jobs` (`WITH CHECK true`) with tier-aware `shop_insert_jobs` + `individual_insert_jobs`, and adds explicit location checks to `shop_insert_customers` and `shop_insert_boats` (defense in depth on top of migration 023's `set_customer_tenant` trigger).
- `030_marinas_insert_for_team.sql` — opens `marinas` INSERT to shop tier + admins (was admin-only) so Create Job's inline "+ Add new marina" works; viewers are blocked at the UI by `canWrite`.
- `031_jobs_service_descriptions.sql` — adds `jobs.service_descriptions` JSONB (per-service-type descriptions keyed by `service_types` values, default `{}`), powering per-area notes on the Create Job form.

**Numbering collision footgun:** two files share the `026` prefix — `026_owner_only_user_management.sql` and `026_parts_order_email.sql` (pg_cron schedule + `parts-order-email` edge-function wiring). Both are applied; next new migration should be `032`. Migrations are applied via Supabase MCP (`mcp__supabase__apply_migration`), not the Supabase CLI.

## Parts-to-Order (live since 2026-06-05)

Techs enter parts in the mobile service form's "Parts Needed" section (name, part #, qty, **description**, supplier, URL, photo, ordered flag); on submit they persist to `public.parts`. The dashboard shows a **Parts to Order** section (grouped Customer→Boat, gold-highlighted cards, per-part Need-to-order⇄Ordered toggle, collapsed Ordered sub-list, count badge + 5th KPI card, realtime). Spec/plan: `docs/superpowers/{specs/2026-06-05-parts-to-order-design.md, plans/2026-06-05-parts-to-order.md}`.
- **Online** persistence in `service.tsx` `handleSubmitOnline` (`persistParts`); **offline** via `pending_parts` queue (`offline-db.ts` `savePendingParts`) replayed by `sync-service.ts` `case "parts"`.
- Part photos upload to the `report-photos` storage bucket.
- `parts.org_id` set server-side by trigger; RLS scopes reads/writes to the caller's org (admin override).
- **Phase 2 (LIVE):** email alert via **Resend** — `pg_cron` (every 2 min) pings the `parts-order-email` edge function (migration 026), which emails `connorgray@jeffbrownyachts.com` one message per service report listing its un-notified `need_to_order` parts, then stamps `parts.notified_at`. Resend key + cron secret in Vault (`parts_email_secrets()` RPC). Sends from `onboarding@resend.dev` until grayyachts.com is verified in Resend.
- **Phase 3 (not built):** push notifications (needs the removed mobile push subsystem rebuilt).

## Salesforce client auto-link (live since 2026-06-04)

Every new JBY `customers` row (mobile, web, or offline-synced) auto-creates or links a Salesforce **Person Account** and writes back `salesforce_account_id` / `salesforce_url` / `salesforce_synced_at`.

- **Flow:** `customers` INSERT → trigger `customer_salesforce_sync` (migration 021) → async `pg_net` POST → edge function `salesforce-sync` → Salesforce REST API → writeback. Async, so the client insert is never blocked.
- **Edge function:** `supabase/functions/salesforce-sync/` (`index.ts` orchestration + `salesforce.ts` pure helpers + Deno tests). Deployed with `verify_jwt=false`; authed by the `x-sync-secret` header.
- **Dedup:** matches existing Person Accounts by phone then email (links instead of duplicating). **Categorization:** `Type='Customer'`, `PersonLeadSource='Marine Tech App'`, `OwnerId=005TS000008FD5BYAW` (Connor), `RecordTypeId=0123h000000ANsqAAG`.
- **Secrets in Vault** (account can't set edge-function env-secrets): `sf_refresh_token` + `sf_sync_secret`, read via `salesforce_sync_secrets()` RPC. Re-seed the refresh token after any `sf org login` rotation. Non-secret SF config is env-defaulted in `index.ts`.
- **Gating:** only `org_id = 'e22d5492-3ec1-4d5c-9118-b2eba8880586'` (Jeff Brown Yachts). **NOTE:** the live org table is named `public.organizations` (not `orgs` as elsewhere in this doc).
- **Out of scope:** backfilling existing unlinked clients, boats→SF vessels, two-way sync.
- **Spec/plan:** `docs/superpowers/specs/2026-06-04-salesforce-client-autolink-design.md`, `docs/superpowers/plans/2026-06-04-salesforce-client-autolink.md`

**Removed:** `notifications` table reference and the push notification subsystem (`mobile/lib/notification-context.tsx`, `mobile/lib/notifications.ts`) were removed during the `feat/mobile-job-edit` work.

## Multi-location & Tier Model

The Clients list (and all of `customers` / `boats` / `jobs` visibility) is gated by `profiles.tier` + `profiles.location_id`:

- **`tier='individual'`** — solo/free mode. Sees only customers where `created_by = self`. Default for new public signups.
- **`tier='shop'`** — team mode. Now **location-scoped** (migration 017): sees only customers/boats/jobs in their own `profiles.location_id`. Boats and jobs follow their parent customer's office.
- **`tier='free'`** — legacy bucket (no longer enforced; soft caps dropped in migration 011).
- **`is_admin`** — unrestricted across the org.

### Role hierarchy (live since migration 027)

| Role | Visibility | Mutations | Who can change roles |
|---|---|---|---|
| **Owner** (allowlist in `lib/owner.ts` + `public.is_owner()` SQL) | Everything across every location | Everything | Self — currently Connor only |
| `admin` | Org-wide (legacy admin profiles) | Org-wide | Owner only |
| `manager` (new in 027) | One location via `profiles.location_id` | Full create/edit/delete within that location, including other techs' work | Owner only |
| `tech` (UI label "Edit") | One location | Full create/edit/delete within that location | Owner only |
| `viewer` (UI label "Read-only") | One location | None | Owner only |

The Technicians (Users & Access) page is **owner-gated at three layers**: sidebar filter (`lib/owner.ts`), page redirect (`lib/owner-guard.ts` → `requireOwner()`), SQL RPC enforcement (`admin_set_user_role` / `admin_delete_user` check `is_owner()`). A hostile admin calling the Supabase REST API directly still gets `forbidden`. Multi-office expansion runbook: `docs/superpowers/specs/2026-06-07-multi-location-expansion.md`.

**Footgun:** invitees default to `individual` + NULL `location_id` (trigger 013 in `013_handle_new_user_trigger.sql`). Until promoted to `shop` + a real `location_id`, they will see nothing under the location-scoped model. There is no UI for this yet — set it via Supabase Studio / SQL after invite acceptance.

**RLS helpers** (added in 017, both `SECURITY DEFINER`):
- `current_profile_location()` — the caller's `location_id`
- `customer_in_my_location(uuid)` — whether a given customer's `location_id` matches the caller's

**Beta state (2026-05-26):** Org "Jeff Brown Yachts" with 4 locations (Sausalito / San Diego / Seattle / Newport). Only Seattle is in active use; the others exist but are unpopulated. Each location has a `join_code` for future code-redemption signup. No web location switcher yet.

**Design + plan:**
- `docs/superpowers/specs/2026-05-26-multi-location-orgs-design.md`
- `docs/superpowers/plans/2026-05-26-multi-location-orgs.md`

## Project Structure

```
marine-tech-app/
├── app/                           # Next.js Admin Dashboard
│   ├── login/                     # Login page
│   └── dashboard/
│       ├── layout.tsx             # Sidebar + QueryClientProvider wrap
│       ├── sidebar.tsx            # Inline-SVG nav (Dashboard / Reports / Jobs / Calendar / Technicians / Customers & Boats / PDI Reports)
│       ├── page.tsx               # Dashboard home (KPI cards incl. Parts to Order)
│       ├── jobs/                  # Jobs table + pending-jobs panel + create-job-form
│       │   └── [id]/              # Job detail page with JobEditor client island (F4/F5)
│       ├── calendar/              # Calendar tab (Month/Week/Day)
│       │   ├── page.tsx
│       │   ├── loading.tsx
│       │   └── error.tsx
│       ├── customers/             # "Clients" page (renamed from "Customers & Boats"; editable client + boat cards, Delete Client)
│       ├── technicians/, reports/, pdi-reports/
├── components/
│   └── calendar/                  # NEW
│       ├── CalendarView.tsx       # react-big-calendar wrapper
│       ├── CalendarToolbar.tsx    # Date nav + tech filter + view switcher + +new
│       ├── JobChip.tsx            # 3-line chip with location, color-by-tech, status stripe
│       ├── JobPopover.tsx         # Radix popover on chip click
│       ├── NewJobModal.tsx        # Radix dialog with create mutation
│       ├── UnscheduledTray.tsx    # Collapsible unscheduled-jobs strip
│       ├── calendar-overrides.css # react-big-calendar theme
│       └── modal-input.css
├── lib/
│   ├── supabase/                  # createClient (browser) + createClient (server, async)
│   ├── react-query.ts             # makeQueryClient factory
│   └── calendar/                  # NEW: shared lib for web
│       ├── types.ts               # CalendarJob, JobStatus, CalendarView
│       ├── colors.ts              # techColor (deterministic hash) + statusStripeColor
│       ├── format.ts              # 9 AM / 10:30 AM / 9-11 AM time formatters
│       ├── queries.ts             # getJobsInRange, getUnscheduledJobs, createJob, updateJob
│       └── realtime.ts            # subscribeToJobs (Supabase Realtime channel)
├── middleware.ts                   # Auth middleware
├── supabase/
│   ├── migrations/                # 001-031 (two files share prefix 026 — see footgun above)
│   ├── functions/                 # Edge functions: send-invite, salesforce-sync, parts-order-email, job-notification-webhook, send-notification
│   └── rls_policies.sql
├── e2e/calendar.spec.ts           # NEW: Playwright tests
├── playwright.config.ts           # NEW
├── vitest.config.ts               # NEW (excludes e2e/, mobile/, .worktrees/)
├── vitest.setup.ts                # NEW
├── __tests__/calendar/            # NEW: colors.test, format.test, queries.test (20 unit tests)
├── wrangler.toml                  # CF Workers deploy config (public env vars committed; service role as secret)
└── mobile/                        # React Native + Expo (technician app)
    ├── app/
    │   ├── _layout.tsx            # GestureHandlerRootView → QueryClientProvider → BottomSheetModalProvider → AuthProvider → OfflineProvider → Stack
    │   ├── login.tsx, register.tsx, account-settings.tsx
    │   ├── job/[id].tsx           # Job detail / summary (Edit + Delete actions on `feat/mobile-job-edit` branch)
    │   └── (tabs)/
    │       ├── _layout.tsx        # 5-tab layout
    │       ├── index.tsx          # Clients (was "My Jobs")
    │       ├── service.tsx        # Service form (edit mode via ?editJobId on `feat/mobile-job-edit`)
    │       ├── pdi.tsx            # PDI form
    │       ├── jobs.tsx           # NEW (on `feat/mobile-job-edit` branch): browse/search assigned jobs
    │       └── calendar.tsx       # NEW: Calendar tab
    ├── components/
    │   ├── calendar/
    │   │   ├── MonthCalendar.tsx  # react-native-calendars with multi-dot markers
    │   │   ├── HourGrid.tsx       # Day-view vertical hour rows (shipped via feat/calendar-hourgrid-newjobsheet)
    │   │   ├── AllDayStrip.tsx    # All-day/multi-day jobs strip above the HourGrid
    │   │   ├── ViewToggle.tsx     # Month ⇄ Day view switcher
    │   │   ├── NewJobSheet.tsx    # Create-job-from-calendar bottom sheet
    │   │   ├── WeeklyJobsPanel.tsx# Month-view bottom panel: scheduled-this-week + unscheduled tray
    │   │   ├── DayList.tsx        # Legacy FlatList variant, kept but not mounted
    │   │   └── JobBottomSheet.tsx # @gorhom/bottom-sheet on tap
    │   └── ScheduleSheet.tsx      # Long-press scheduling sheet (date + time + duration → updateJob)
    ├── lib/
    │   ├── supabase.ts            # Supabase client (SecureStore auth)
    │   ├── auth-context.tsx
    │   ├── offline-context.tsx
    │   ├── react-query.ts         # NEW: makeQueryClient factory
    │   └── calendar/              # NEW: mirrors web (types/colors/format/queries/realtime)
    ├── constants/Colors.ts
    ├── babel.config.js            # Includes 'react-native-reanimated/plugin' (last)
    └── .maestro/
        ├── calendar.yaml          # NEW: Maestro flow
        └── README.md
```

## Mobile App Screens (5 tabs, all on `main`)

1. **Login** — Email/password, gold anchor icon, "MARINE TECH" branding
2. **Clients** (Tab 1) — Client cards (location-scoped per RLS), pull-to-refresh, tap-to-call/text/email + "View in Salesforce" link from `customers.salesforce_url`
3. **Service** (Tab 2) — Job form with customer/boat dropdowns, category tabs, BAD/GOOD checklist, notes. Supports edit mode via `?editJobId=`.
4. **PDI** (Tab 3) — Pre-Delivery Inspection with progress counter
5. **Jobs** (Tab 4) — Browse + search assigned jobs, status filter, navigate to detail
6. **Calendar** (Tab 5) — Month ⇄ Day via ViewToggle. Month: multi-dot markers per tech, tap day → WeeklyJobsPanel. Day: HourGrid hour rows + AllDayStrip. Tap job → JobBottomSheet (25%/60% snap); **long-press a job → ScheduleSheet** (calendar + time picker, writes `scheduled_start`/`scheduled_end`/`scheduled_end_date`); create from calendar via NewJobSheet
7. **Job Summary** (`/job/[id]`) — Read-only report view, photo gallery, Edit + Delete actions, Export PDF + Share.

## Admin Dashboard Pages

1. **Dashboard** (`/dashboard`) — Home overview (KPI cards incl. Parts to Order count + grouped parts section)
2. **Reports** (`/dashboard/reports`)
3. **Jobs** (`/dashboard/jobs`) — Table view with Create / Start / Complete actions, pending-jobs panel + sidebar count, multi-day scheduling + per-service descriptions on Create Job
4. **Job detail** (`/dashboard/jobs/[id]`) — vessel/engine/checklist/photos with editable JobEditor; target of the calendar's "Open job" link
5. **Calendar** (`/dashboard/calendar`) — Month/Week/Day. Tech filter. Unscheduled tray. Click-empty-cell → New job modal. Click chip → popover with "Open job" link. Popup overlay for multi-job days. Realtime updates.
6. **Technicians / Users & Access** (`/dashboard/technicians`) — owner-gated at three layers
7. **Clients** (`/dashboard/customers`) — renamed from "Customers & Boats"; editable client + boat cards, Delete Client (cascade-deletes child records)
8. **PDI Reports** (`/dashboard/pdi-reports`)

## Calendar Feature (shipped to `main`)

- **Spec:** `docs/superpowers/specs/2026-04-27-calendar-tab-design.md`
- **Plan:** `docs/superpowers/plans/2026-04-27-calendar-tab.md`
- **Schema:** migration `008` (`scheduled_start`/`scheduled_end`/`location_override`) + migration `014` (`scheduled_end_date` for multi-day)
- **Web** (`/dashboard/calendar`): Month / Week / Day via `react-big-calendar`. Color-by-tech (hashed) + status stripe. Click empty cell → create. Click chip → popover. Tech filter dropdown. Unscheduled tray. Realtime via Supabase channel.
- **Mobile** (`(tabs)/calendar`): `MonthCalendar` (multi-dot markers) → `WeeklyJobsPanel` (scheduled-this-week + unscheduled tray) → `JobBottomSheet` (tap) + `ScheduleSheet` (long-press, picks date + start time + duration, writes through `updateJob`). **Day view shipped** (merged via `feat/calendar-hourgrid-newjobsheet`): `ViewToggle` → `HourGrid` hour rows + `AllDayStrip`, plus `NewJobSheet` for create-from-calendar. Spec/plan: `docs/superpowers/{specs/2026-05-27-hourgrid-newjobsheet-design.md, plans/2026-05-27-hourgrid-newjobsheet.md}`
- **Tests:** 20 unit tests (vitest), 3 Playwright e2e (auth setup still pending — won't run yet), 1 Maestro flow (manual run)
- **Deferred (still open):**
  - Realtime polling fallback for offline disconnect
  - Migration to drop the legacy `scheduled_date` column once all reads have switched
  - Playwright auth setup so the 3 scaffolded e2e tests can actually run

## Checklist Categories & Items

**Engine:** Oil Pressure, Oil Level, Coolant Level, Fuel System, Exhaust System, Throttle Response, Steering System, Propeller Condition, Trim & Tilt, Belts & Hoses

**Electrical:** Battery Voltage, Battery Connections, Navigation Lights, Bilge Pump, Horn, Gauges & Instruments, Switch Panel, Shore Power

**Hull:** Hull Integrity, Gel Coat Finish, Zinc Anodes, Through-Hull Fittings, Rub Rail & Hardware

**Safety:** Life Jackets, Fire Extinguisher, Flares & Signals, First Aid Kit, Anchor & Line

**Nav:** GPS / Chartplotter, Depth Finder, VHF Radio, Compass

## Authentication Flow

1. Admin creates tech account via invite (sends email with token via `supabase/functions/send-invite`)
2. Tech opens invite link → sets password → account activated
3. Tech signs in with email/password on mobile app
4. Session persisted in SecureStore (survives app restarts)
5. Auth state managed via React Context (AuthProvider)
6. Unauthenticated users redirected to login screen

## Current Branches

- `main` — everything shipped: calendar (Month + Day/HourGrid + NewJobSheet, web Month/Week/Day), web job detail + editable Jobs/Clients pages (F4–F8 work), parts-to-order, Salesforce auto-link, role hierarchy + location-scoped RLS through migration 031
- `feat/sso-apple-google` — Apple + Google Sign-In; periodically merged up from `main`; v1.2.0 / iOS build 36 bumped here. Finish review → merge → submit v1.2 to App Store.
- `feat/supplier-dropdown` — supplier picker in the Service form (in flight)
- `feat/calendar-hourgrid-newjobsheet` — **merged to `main`**, remote branch can be deleted
- `feat/mobile-job-edit` — remote-only. Contained the original mobile Edit/Delete + Jobs-tab + push-removal work; much of it has since landed on `main` via other commits. Needs a careful diff against `main` before any merge — wholesale merge from the original 2026-04 plan would now conflict heavily and re-introduce stale code.

## Next planned work

- **Promote SSO** — finish `feat/sso-apple-google` review, merge, submit v1.2 (build 36) to App Store.
- **Reconcile `feat/mobile-job-edit`** — diff against `main`, salvage anything not already shipped, then close the branch.
- **Playwright auth setup** — so the 3 scaffolded e2e tests can actually run.
- **Sausalito / San Diego opening pre-reqs** (runbook: `docs/superpowers/specs/2026-06-07-multi-location-expansion.md`) — remaining gaps: gate `jobs.assigned_to` reassignment to same-location techs; owner location filter on web. (The reports/parts RLS audit gap was closed by migrations 028–029.)

## iOS App Store / EAS

- **Apple Developer Program:** active through 2027-04-20
- **Bundle ID:** `com.grayyachts.marinetech` · **Team ID:** `L34MUY39UV`
- **ASC App ID:** `6762853683` · **App name (ASC):** `JBY-Marine Tech` (in-app display name remains `Marine Tech`)
- **ASC API key:** `2B5Z869244` (Issuer `f3b47a16-d70b-4ef4-bc3b-e30fed4d2766`); `.p8` lives at `mobile/.secrets/AuthKey_2B5Z869244.p8` (gitignored)
- **EAS:** owner `cgrayy`, slug `marine-tech`, project `5e70f74a-b7b2-49e0-a65f-4e40d2527fb0`
- **Live:** v1.0 and v1.1.0 both `READY_FOR_SALE` (v1.1.0 approved after the 2026-05-26 submission). v1.2.0 / build 36 bumped on `feat/sso-apple-google`, not yet submitted.
- **EAS Update:** wired with `runtimeVersion = appVersion` (build 24+ can receive OTA; build 23 cannot). OTA only applies when the installed build's runtime matches exactly — publish to both runtimes if two versions are live (run from `mobile/`, no `--runtime-version` flag).

**Autonomous App Store update flow** (uses ASC API end-to-end):
1. EAS production build, non-interactive via env vars — see `reference_eas_noninteractive_ios_creds` memory (`EXPO_ASC_KEY_ID`, not `EXPO_ASC_API_KEY_ID`)
2. `eas submit --id <buildId> --profile production` — uploads + processes
3. `node scripts/asc-submit.mjs <version> <buildNumber>` — creates `appStoreVersion`, attaches build, sets `whatsNew`, submits for review (note: root `scripts/`, not `mobile/scripts/`)
4. **Gotcha:** final submit will 409 with `STATE_ERROR "Version is not ready yet, try again later"` for a few minutes right after attach. `node scripts/asc-resubmit.mjs` polls past it.

**Reusable ASC API scripts** (`mobile/scripts/` except where noted, all sign their own JWT from the `.p8`):
- `asc-builds.mjs` — list recent builds
- `asc-upload-screenshots.mjs` — parametric by device type
- `asc-fill-metadata.mjs` — name / subtitle / description / keywords
- `asc-attach-build-and-categories.mjs` — attach build + set categories
- `asc-finalize-listing.mjs` — age rating + review details
- `asc-fix-blockers.mjs` — copyright + content rights flags
- `asc-set-free-pricing.mjs`
- `asc-submit-for-review.mjs` + `asc-resubmit-v2.mjs` (retry path)
- `asc-add-tester.mjs` — TestFlight invite

**Reviewer / demo credentials** (for Apple App Review):
- Email: `appreview@grayyachts.com` / Password: `ReviewMarine2026!`
- Seeded as a real `tech` Supabase user with a "Demo Customer (App Review)" customer + "Sea Trial" boat + assigned job
- Privacy + Support pages live at `https://grayyachts.com/marine-tech/privacy` and `/support` (deployed from the `grayyachts.com` repo)

## Related Projects

- **grayyachts.com** — Yacht management platform (`/Users/connorgray/Desktop/Claude OS/grayyachts.com`)
- **grayyachts.media** — Media production site (`/Users/connorgray/Desktop/Claude OS/grayyachts.media`)
- **grayyachts-agents** — Paperclip AI orchestration (`/Users/connorgray/Desktop/Claude OS/grayyachts-agents`)
</content>
</invoke>