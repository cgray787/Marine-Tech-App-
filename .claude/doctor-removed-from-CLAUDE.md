# Removed from CLAUDE.md by /doctor on 2026-08-18

Every block below was cut because a session can reconstruct it from the
codebase itself. Kept here verbatim so any of it can be pasted back.


---

## REMOVED: ## iOS App Store / EAS  (MOVED to .claude/skills/ios-release/SKILL.md)

```
## iOS App Store / EAS

- **Apple Developer Program:** active through 2027-04-20
- **Bundle ID:** `com.grayyachts.marinetech` · **Team ID:** `L34MUY39UV`
- **ASC App ID:** `6762853683` · **App name (ASC):** `JBY-Marine Tech` (in-app display name remains `Marine Tech`)
- **ASC API key:** `2B5Z869244` (Issuer `f3b47a16-d70b-4ef4-bc3b-e30fed4d2766`); `.p8` lives at `mobile/.secrets/AuthKey_2B5Z869244.p8` (gitignored)
- **EAS:** owner `cgrayy`, slug `marine-tech`, project `5e70f74a-b7b2-49e0-a65f-4e40d2527fb0`
- **Live:** v1.0, v1.1.0 and **v1.2.0** are all shipped. v1.2.0 (Apple + Google SSO) went live **2026-06-12** — verified against the public storefront 2026-07-29.
- **Agreements cleared 2026-08-11.** Two were outstanding (they sign separately and propagate ~3 min apart); the ASC API is fully open again. Symptom to recognise: `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`, sometimes on *some* endpoints only — reading the app can succeed while versions/builds still 403.
- **v1.3.0 / build 38** building 2026-08-11 with the mobile Service Campaigns work. ⚠️ `runtimeVersion` follows `appVersion`, so OTA to 1.3.0 will NOT reach 1.2.0 devices — publish to both runtimes while two versions are live.
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
- Email: `appreview@grayyachts.com` / Password: **not stored here** — set `APP_REVIEW_PASSWORD` in your shell; the value belongs only in App Store Connect's review notes. (It was previously committed in four tracked files; rotate it.)
- Seeded as a real `tech` Supabase user with a "Demo Customer (App Review)" customer + "Sea Trial" boat + assigned job
- Privacy + Support pages live at `https://grayyachts.com/marine-tech/privacy` and `/support` (deployed from the `grayyachts.com` repo)

```


---

## REMOVED: ## Checklist Categories & Items

```
## Checklist Categories & Items

**Engine:** Oil Pressure, Oil Level, Coolant Level, Fuel System, Exhaust System, Throttle Response, Steering System, Propeller Condition, Trim & Tilt, Belts & Hoses

**Electrical:** Battery Voltage, Battery Connections, Navigation Lights, Bilge Pump, Horn, Gauges & Instruments, Switch Panel, Shore Power

**Hull:** Hull Integrity, Gel Coat Finish, Zinc Anodes, Through-Hull Fittings, Rub Rail & Hardware

**Safety:** Life Jackets, Fire Extinguisher, Flares & Signals, First Aid Kit, Anchor & Line

**Nav:** GPS / Chartplotter, Depth Finder, VHF Radio, Compass

```


---

## REMOVED: ## Admin Dashboard Pages

```
## Admin Dashboard Pages

1. **Dashboard** (`/dashboard`) — Home overview (KPI cards incl. Parts to Order count + grouped parts section)
2. **Reports** (`/dashboard/reports`)
3. **Jobs** (`/dashboard/jobs`) — Table view with Create / Start / Complete actions, pending-jobs panel + sidebar count, multi-day scheduling + per-service descriptions on Create Job
4. **Job detail** (`/dashboard/jobs/[id]`) — vessel/engine/checklist/photos with editable JobEditor; target of the calendar's "Open job" link
5. **Calendar** (`/dashboard/calendar`) — Month/Week/Day. Tech filter. Unscheduled tray. Click-empty-cell → New job modal. Click chip → popover with "Open job" link. Popup overlay for multi-job days. Realtime updates.
6. **Technicians / Users & Access** (`/dashboard/technicians`) — owner-gated at three layers
7. **Clients** (`/dashboard/customers`) — renamed from "Customers & Boats"; editable client + boat cards, Delete Client (cascade-deletes child records)
8. **PDI Reports** (`/dashboard/pdi-reports`)
9. **Work Orders** (`/dashboard/work-orders`) — priced customer-facing work orders modeled on the Salesforce teamMarine W/O: list + editor (`[id]`) with job sections (FRH/Flat/Per-Foot labor off `price_levels`, 3-C fields, ESTIMATE flag, auto shop-supplies line), parts w/ hidden margin, stacked taxes, optional CC fee, payments + balance, internal profit (hidden from viewers), JBY-letterhead print view (`[id]/print`), Add-Jobs template catalog, settings page (`settings` — price levels / templates / defaults, admin+manager only). Money math single-sourced in `lib/work-orders/totals.ts` (unit-tested). Client profile page `/dashboard/customers/[id]` shows per-client WOs; delete-client is blocked while a client has WOs (fail-closed guard, web + mobile). Spec/plan: `docs/superpowers/{specs/2026-06-12-work-orders-design.md, plans/2026-06-12-work-orders.md}`. **Phase 2 (live 2026-06-12):** branded **Download PDF** button (lazy `@react-pdf/renderer`, doc in `lib/work-orders/pdf.tsx`, JBY logo `public/jby-logo.png`, `formatDateOnly` for date-only columns) + **QuickBooks Online**: `qb_connections` (migration 036, RLS deny-all/service-role only), OAuth routes `app/api/quickbooks/{connect,callback,status,disconnect}` (state-cookie CSRF, refresh-token rotation persisted), settings "Connect to QuickBooks" card, per-WO "Send to QuickBooks" → QBO Invoice (`lib/quickbooks/invoice.ts` pure builder, find-or-create Customer + Labor/Parts & Materials/Service Fees items, TxnTaxDetail override; Re-send = NEW invoice w/ confirm). Needs wrangler secrets `INTUIT_CLIENT_ID`/`INTUIT_CLIENT_SECRET` (QB_ENV vars already in wrangler.toml). Still not built: email/text WO, SF catalog import, portal mirror, QBO payment sync.

```


---

## REMOVED: ## Mobile App Screens (5 tabs, all on `main`)

```
## Mobile App Screens (5 tabs, all on `main`)

1. **Login** — Email/password, gold anchor icon, "MARINE TECH" branding
2. **Clients** (Tab 1) — Client cards (location-scoped per RLS), pull-to-refresh, tap-to-call/text/email + "View in Salesforce" link from `customers.salesforce_url`
3. **Service** (Tab 2) — Job form with customer/boat dropdowns, category tabs, BAD/GOOD checklist, notes. Supports edit mode via `?editJobId=`.
4. **PDI** (Tab 3) — Pre-Delivery Inspection with progress counter
5. **Jobs** (Tab 4) — Browse + search assigned jobs, status filter, navigate to detail
6. **Calendar** (Tab 5) — Month ⇄ Day via ViewToggle. Month: multi-dot markers per tech, tap day → WeeklyJobsPanel. Day: HourGrid hour rows + AllDayStrip. Tap job → JobBottomSheet (25%/60% snap); **long-press a job → ScheduleSheet** (calendar + time picker, writes `scheduled_start`/`scheduled_end`/`scheduled_end_date`); create from calendar via NewJobSheet
7. **Job Summary** (`/job/[id]`) — Read-only report view, photo gallery, Edit + Delete actions, Export PDF + Share.

```


---

## REMOVED: ## Project Structure

```
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

```


---

## REMOVED: ## Tech Stack

```
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

```


---

## REMOVED: Database Schema -> enumerated migrations 001-039

```
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
- `032_viewer_readonly_enforcement.sql` — `profile_can_write()` helper + RESTRICTIVE write policies on every user-writable table so `viewer` is read-only at the DB layer.
- `033_work_orders.sql` — Work Orders module: `price_levels`, `job_templates`, `wo_settings`, `work_orders` (+`work_order_number_seq` from 1001), `work_order_jobs`, `work_order_lines`, `work_order_payments`; `wo_can_edit()` helper (admin+manager writes only); seeds 15 templates + Seattle $175/hr price level. (Its pre-Sausalito follow-up was closed by migration 034.)
- `034_wo_location_scoped_writes.sql` — location-scopes the four `wo_*_write` policies from 033: admins stay org-wide, managers can only write WOs (and their jobs/lines/payments) in their own office.
- `035_gate_job_assignment_to_location.sql` — `job_assignee_location` BEFORE trigger on `jobs`: `assigned_to` must belong to the same location as the job's customer (admin assignees and location-less customers exempt). Covers every write path incl. mobile offline sync and raw REST.
- `036_quickbooks.sql` — `qb_connections` (QuickBooks OAuth tokens; RLS deny-all / service-role only) for Work Orders → QuickBooks invoice export.
- `037_admin_set_user_location.sql` — owner/admin RPC to set a user's `location_id`.
- `038_locations_read_policy.sql` — `locations` SELECT policy (fixes the empty office picker).
- `039_paperwork_perday_location.sql` — `jobs.kind` ('service'|'paperwork'), `jobs.day_locations` (jsonb per-day place for multi-day jobs), `jobs.location_id` (+ `set_paperwork_location` trigger deriving it from the assigned tech for clientless paperwork); `paperwork_*` RLS (read/insert/update/delete) gated on `kind='paperwork'`, assignee-location scoped. Powers schedulable Paperwork blocks + per-day multi-day locations.

```


---

## REMOVED: ## Commands -> standard manifest scripts

```
npm start              # Start Expo dev server
npm run ios            # Run on iOS simulator
npm run android        # Run on Android emulator
npm run dev                                            # Start Next.js dev server
npm test                                               # Run vitest unit tests
npm run test:watch                                     # Vitest in watch mode
npm run test:e2e                                       # Playwright e2e tests
npx tsc --noEmit       # Run from /mobile or root as needed
```
