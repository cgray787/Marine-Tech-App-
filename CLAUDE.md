# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Engineering Operating Rules

These rules govern **how** to work in this repo. They come before the feature
context below and apply to every task.

## Context discipline

This is a large repository — two codebases (Next.js dashboard at the root,
React Native/Expo app in `/mobile`) plus a Supabase backend, and a sibling
dashboard living in the separate `grayyachts.com` repo. Do not indiscriminately
load it.

For every task:

1. Identify the smallest likely evidence surface.
2. Search before opening many files.
3. Open only the files needed to answer the current question or test the current hypothesis.
4. Do not read generated/build/cache directories — `node_modules/`, `.next/`, `.open-next/`, `.expo/`, coverage, binaries.
5. Prefer the existing specs in `docs/superpowers/specs/` over rediscovering stable architecture.
6. Expand context only when evidence requires it.

This repo's docs are the technical source of truth. The Obsidian vault is
retrieved only when business, product, historical, or domain context is actually
needed — not for ordinary coding tasks.

## Evidence standard

Every repository-specific claim must rest on evidence obtained this session: a
file opened, a command run, test output, a log, a database result, or
external-service state actually inspected.

If you cannot verify something, write:

```
UNVERIFIED — need to check <specific thing>
```

Do not substitute an assumption about how this kind of system is usually built.
Framework convention is not evidence.

**Empty output is never automatically a pass.** Distinguish:

- 0 matches,
- command failure,
- unavailable tool,
- incomplete search scope,
- permission failure (including RLS returning `[]` instead of an error),
- truncated output.

Prefer "grep returned 0 matches across 184 files" to "it's not there."

For surprising or diagnosis-changing findings, show the command and the small
relevant slice of raw output alongside the interpretation.

## Debugging protocol

For bugs, follow this order:

1. **OBSERVE** — identify the exact failure. Quote the literal error text; do not paraphrase when the exact string is available.
2. **REPRODUCE** — establish a reliable failing case (input / expected / actual / steps).
3. **INSTRUMENT** — gather evidence before changing behavior.
4. **ISOLATE** — test layers independently to find the first divergence. In this stack that is usually:
   `row exists in Postgres?` → `service-role query returns it?` → `authenticated (RLS) query returns it?` → `route/API returns it?` → `UI renders it?`
5. **ROOT CAUSE** — state the cause, the evidence, why it explains the symptom, and what would falsify it.
6. **FIX** — one focused change.
7. **VERIFY** — observe the real, previously failing behavior.

Do not shotgun-debug, make several speculative fixes at once, or add retries,
wrappers, or workarounds before understanding the cause. If multiple hypotheses
remain, rank them and test one at a time.

## Verification standard

Verify outcomes, not implementation presence.

"The function exists", "the config is set", "the migration file was created",
and "the column was added" are **not** verification.

Verification here looks like:

- the authenticated user — not the service role — actually receives the expected rows,
- the previously failing screen renders the expected content,
- the scheduled job ran and produced its side effect,
- a regression test fails before the fix and passes after it,
- the deployed URL, not the local build, serves the change.

Cautionary precedent: the dashboard job-photos section selected `bucket` and
`file_path`, columns that do not exist on `report_photos`, and rendered each
tile as an empty `aspect-square` div. Both the query and the tiles "existed."
No photo had ever appeared. Presence proved nothing.

## External-service bugs

This repo touches Supabase (Postgres/RLS/Storage/Realtime/Edge Functions/pg_cron),
Cloudflare Workers, Salesforce, QuickBooks Online, Resend, Expo EAS, and App
Store Connect. When a bug touches one:

1. inspect that service's own state first,
2. compare it with the application's database/state,
3. trace which handler or branch actually ran,
4. only then change code.

Do not assume the fault is in this repository merely because the symptom appears
in the app.

## Silent failures

Treat a success signal skeptically when it measures something other than the
intended effect. Suspicious by default:

- caught exceptions followed by success responses, `.catch(() => {})`, empty catch blocks,
- RLS reads returning empty arrays that read as "no data" rather than "no access",
- `sync_queue` offline replay cases that drop or coalesce a mutation,
- pg_cron schedules and edge functions whose only health signal is "no errors" (`parts-order-email`, `salesforce-sync`),
- Realtime subscriptions on a publication that omits the table — migration 047 found the publication was EMPTY, so every subscription in the app had been silently receiving nothing,
- config or secret writes that do not take effect until redeploy.

For every automated process ask:

> If this failed silently every run for six months, what would tell us?

Where practical, verify both that no error occurred **and** that the expected
outcome actually happened.

## Change discipline

Make the smallest change that addresses the proven root cause.

Do not combine unrelated cleanup with a bug fix unless explicitly asked. After a
fix, run the narrowest meaningful verification first, then broaden.

---

# Marine Tech App

## Project Overview

Field service app for marine technicians to document boat service jobs and pre-delivery inspections. Structured checklists with BAD/GOOD assessments, photo capture (HIN plates, engine hours, damage), and report submission. Admin web dashboard for reviewing reports, managing technicians, and seeing all scheduled work on a calendar.

## Architecture

Two codebases, one Supabase backend:

- **Mobile App** (`/mobile`) — React Native + Expo (technician-facing, iOS + Android)
- **Admin Dashboard** (root `/`) — Next.js 16 web app (owner-facing, deployed to Cloudflare Workers)
- **Backend** — Supabase (auth, Postgres database, file storage, Realtime)

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
npm run deploy                                         # Deploy to CF Workers (sources .env.local, cleans .next/.open-next, builds, deploys)

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

**Numbering collision footgun:** migrations now run to **050**. Two files share the `026` prefix — `026_owner_only_user_management.sql` and `026_parts_order_email.sql` (pg_cron schedule + `parts-order-email` edge-function wiring). Both are applied. Always check `supabase/migrations/` for the highest prefix before numbering (036 is taken by in-flight QuickBooks work on `feat/wo-phase2`). Migrations are applied via Supabase MCP (`mcp__supabase__apply_migration`), not the Supabase CLI.

## Service Campaigns — AXOPAR + Mercury (live 2026-08-11)

Manufacturer bulletins performed on specific hulls or engines, tracked end to end
from the office to the boat and back.

**Why the two manufacturers are modelled differently.** Axopar issues a *Boat
Service Task* scoped by **HIN**, with *Compensated Work Hours* and an Issue +
Introduction narrative. Mercury issues a *warranty claim* scoped by **engine
serial**, with a Part/Fail code, labor codes (`CA12 .5` + `CA18 .5`) and a
*Conditions Found* narrative. Forcing them into one form drops the fields needed
to actually file, so each entry form mirrors the portal it is transcribed from and
uses that manufacturer's own words.

**Two tables, one deliberate split** (migration 043):
- `service_campaigns` — the catalog. Mutable; maintained as bulletins arrive.
- `campaign_log` — the permanent record, one row per campaign per boat.

`campaign_log` **freezes a copy** of the campaign text at attach time rather than
referencing the catalog: manufacturers revise bulletins, and a pure reference
would silently rewrite what the records claim was done on boats already finished.
It is **append-only** — a trigger rejects snapshot rewrites, DELETE is blocked
outright, and a mistaken entry is withdrawn with `status='voided'` (excluded from
the one-live-row-per-boat unique index, so the campaign can be attached again).
It anchors to the **hull**, storing HIN and owner name as text, so history follows
a sold boat and survives a client delete.

**Surfaces** — all three read and write the same rows; nothing is copied:
| Surface | Role |
|---|---|
| Dashboard `/dashboard/jobs/[id]` | Attach campaigns, read instructions, see the tech's photos, record findings/hours/claim number, complete |
| Dashboard Work Orders → Settings | The catalog: add bulletins, per-manufacturer forms |
| Mobile job detail | **No catalog** — campaigns arrive attached. Read, photograph, write findings, complete |
| Portal `/portal/marine-tech/campaigns` | Read-only: Outstanding / Bulletins on file / Campaign history, with field photos |

**Completion is gated** on a photo *and* a written finding — the two things whose
absence gets a warranty claim rejected. `completed_by` is stamped by trigger, not
by clients, so no surface can forget it.

**Offline:** campaign photos and findings queue through the existing `sync_queue`
(`campaign_photos` / `campaign_log` replay cases). Updates coalesce per entry;
photos accumulate and count toward the completion gate while still queued.

**Migrations:** 043 (tables) · 044 (allow FK-null cascades) · 045 (close unscoped
report INSERTs) · 046 (scope viewer reads) · 047 (realtime publication — it was
EMPTY, so every subscription in the app had been silently receiving nothing) ·
048 (campaign photo policies) · 049 (created_by cascade, both engine serials,
completed_by stamp) · 050 (boat-link hardening; ⚠️ depends on PR #3's 040).

**Not yet wired:** `lib/campaigns/matching.ts` is tested but unused — the pickers
list every active bulletin. Boats can now record engine serials, but until they
are populated, filtering would hide every Mercury campaign.

Spec: `docs/superpowers/specs/2026-08-04-service-campaigns-design.md`

## Job photos — from the calendar to the office (2026-08-11)

Three kinds of photo now live in `report_photos`, distinguished by which FK is set:

| Kind | Key column | Purpose |
|---|---|---|
| Report photo | `report_id` | Attached to a submitted service report |
| Campaign photo | `campaign_log_id` | Warranty evidence for a bulletin; **not deletable** |
| **Job photo** | `job_id` (others null) | Work area on a job, often before any report exists |

**The path that matters:** a tech taps a job on the Calendar tab → *Open job →* →
`mobile/app/job/[id].tsx`, which now carries a **JOB PHOTOS** section. Camera or
library, thumbnails, long-press to remove. Job photos are working documentation
rather than warranty evidence, so unlike campaign photos they *can* be deleted.

**Offline:** queues through `sync_queue` (`job_photos` replay case). A photo taken
without signal is stored on the device, rendered immediately from its local uri
tagged "queued", and uploaded when signal returns. A failed *online* upload queues
too rather than making the tech reshoot.

**Where they appear:** `/dashboard/jobs/[id]` Photos section and the portal jobs
list, both reading the same rows.

⚠️ **Two long-standing dashboard bugs were fixed here.** The Photos query selected
`bucket` and `file_path` — neither column exists on `report_photos` — so it
returned nothing and the section never rendered. And each tile was an empty
`aspect-square` div; a comment claimed image rendering "uses the mobile app and
reports tabs for now". Photos had therefore never been visible on the job page.

**RLS:** migration 051's `job_photo_in_scope()` mirrors `campaign_photo_in_scope()`
— you may act on a job photo exactly when you may act on the job's customer, with
clientless paperwork jobs falling back to the assignee's office.

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

**Office state (2026-06-12):** Org "Jeff Brown Yachts" with 4 locations (Sausalito / San Diego / Seattle / Newport). **Seattle, Sausalito, and San Diego are open** — Sausalito + San Diego each have a `manager` + `tech` account (`{office}.manager@jeffbrownyachts.com` / `{office}.tech@jeffbrownyachts.com`, shop tier, location-scoped). Newport exists but is unstaffed. Each location has a `join_code` for future code-redemption signup (mobile flow still unbuilt — gap 2 in the expansion runbook).

**Owner office filter (web, since 2026-06-12):** org-wide users (admins + Owner) get an "Office" dropdown in the sidebar (`components/location-switcher.tsx`). It writes the `mt-location` cookie (`lib/location/{constants,server,client}.ts`) and filters Dashboard KPIs, Reports, Jobs (incl. the assignable-techs dropdown), Work Orders, Calendar (react-query keys include the location), Clients, and PDI Reports. Location-scoped users never see it and the cookie is ignored for them. The Technicians page shows each user's office chip and an amber "No office assigned" badge for the migration-013 NULL-location footgun.

**Design + plan:**
- `docs/superpowers/specs/2026-05-26-multi-location-orgs-design.md`
- `docs/superpowers/plans/2026-05-26-multi-location-orgs.md`

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

## Scheduling / Calendar — 2026-06 updates (shipped to `main`, deployed all surfaces)

- **Day-focused panel** — tap a day → that day's jobs on top, then "Scheduled this week", then "Unscheduled — needs a time". Mobile `WeeklyJobsPanel` (3-section); web admin + portal get a `DayFocusPanel` below the grid. Shared pure helper `lib/calendar/spans.ts` (`jobDays`/`jobsForDay`/`jobsForWeek`/`placeForDay`), mirrored in mobile + portal.
- **Multi-day spanning** — jobs render on every day they span (month markers per covered day, "Day N of M" tags; web shows spanning bars).
- **Per-day locations** — a multi-day job can have a different place per day via `jobs.day_locations` (jsonb `{YYYY-MM-DD: place}`); `placeForDay(job, day)` resolves it; `PerDayLocationEditor` (web + mobile) / portal `PerDayLocations` island write it.
- **Paperwork blocks** — schedulable `kind='paperwork'` calendar items (no client/boat, title/note, multi-day capable). Service|Paperwork toggle in the scheduler (mobile NewJobSheet via a "+ New" FAB on the Calendar tab; admin `NewJobModal`); portal renders + edits them (no portal create flow). Backend = migration 039.
- **Unscheduled UX** — real clients first; clientless jobs read "No client — tap to assign" (tap → job editor) and sort last.
- **Mini-calendar popover** — month-grid date picker on the web Schedule pickers' Start/End date fields (admin `components/calendar/DatePopover.tsx`; portal `src/components/portal/DateFieldWithCalendar.tsx`).
- **Mobile Job Details back arrow fix** — the native auto back button no-ops on RN 0.81 new-arch + react-native-screens; replaced with a custom `headerLeft` in `mobile/app/job/[id].tsx` (all roles).
- **Specs:** `docs/superpowers/specs/2026-06-18-scheduling-redesign-design.md`, `docs/superpowers/specs/2026-06-22-paperwork-perday-location-design.md`.

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
- **Multi-office follow-ups** (Sausalito + San Diego opened 2026-06-12; runbook: `docs/superpowers/specs/2026-06-07-multi-location-expansion.md`) — remaining: mobile join-code signup flow (gap 2; until then promote invitees via SQL), mirror the office filter onto the grayyachts.com `/portal/marine-tech` dashboard, seed Sausalito/San Diego price levels in `price_levels` (only Seattle's $175/hr exists).

## Related Projects

- **grayyachts.com** — Yacht management platform (`/Users/connorgray/Desktop/Claude OS/grayyachts.com`)
- **grayyachts.media** — Media production site (`/Users/connorgray/Desktop/Claude OS/grayyachts.media`)
- **grayyachts-agents** — Paperclip AI orchestration (`/Users/connorgray/Desktop/Claude OS/grayyachts-agents`)
</content>
</invoke>