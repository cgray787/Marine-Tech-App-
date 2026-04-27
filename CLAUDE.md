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

# Mobile e2e (Maestro — install: curl -Ls "https://get.maestro.mobile.dev" | bash)
maestro test mobile/.maestro/calendar.yaml             # Run a single flow

# Admin Dashboard (from root /)
npm run dev                                            # Start Next.js dev server
npm test                                               # Run vitest unit tests
npm run test:watch                                     # Vitest in watch mode
npm run test:e2e                                       # Playwright e2e tests
npx opennextjs-cloudflare build && npx wrangler deploy # Deploy to CF Workers

# Type check
npx tsc --noEmit       # Run from /mobile or root as needed
```

## GitHub Repo

https://github.com/cgray787/Marine-Tech-App-.git

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

**Tables (live as of migration 008):**

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | User accounts | `id`, `full_name`, `role` (`admin`/`tech`), `status`, `push_token` |
| `customers` | Boat owner contacts | `id`, `name`, `email`, `phone`, `address` |
| `boats` | Vessels linked to customers | `id`, `customer_id`, `name`, `make_model`, `year`, `hin`, `engine_make`, `engine_model`, `color`, `home_marina` |
| `marinas` | Marina/location records | `id`, `name`, `address`, `city`, `state` |
| `jobs` | Assigned work orders | `id`, `assigned_to`, `customer_id`, `boat_id`, `marina_id`, `service_types[]`, `scheduled_date` (legacy), **`scheduled_start` (timestamptz, new)**, **`scheduled_end` (timestamptz, new)**, **`location_override` (text, new)**, `status` (`new`/`in_progress`/`completed`), `notes` |
| `service_reports` | Completed report data | vessel snapshot, engine data, work description, parts, status, submitted/reviewed_at |
| `checklist_items` | BAD/GOOD assessments per report | category (`engine`/`electrical`/`hull`/`safety`/`nav`), item_name, assessment, notes, sort_order |
| `report_photos` | Photos attached to reports | `report_id`, `bucket`, `category` (`hin_plate`/`engine_hours`/`before`/`after`/`damage`), `caption` |
| `pdi_reports` | Pre-Delivery Inspection reports | same shape as service_reports |
| `pdi_checklist_items` | PDI assessments | same shape as checklist_items |
| `invites` | Tech invite tokens (7-day expiry) | `token`, `email`, `expires_at`, `used_at` |

**Migrations:**
- `001_create_tables.sql` — all base tables + RLS enabled
- `002_add_push_token.sql` — `profiles.push_token`
- `003_job_webhook.sql` — webhook trigger on `jobs` insert/update
- `004_tech_insert_customers_boats.sql` — RLS allowing techs to add customers/boats
- `005_fix_rls_infinite_recursion.sql` — RLS recursion fix
- `006_security_hardening.sql` — RLS hardening
- `007_tech_edit_delete_jobs.sql` — RLS allowing techs to edit/delete their own jobs
- `008_jobs_scheduled_timestamps.sql` — adds `scheduled_start`, `scheduled_end`, `location_override` to `jobs`. `scheduled_date` retained for one release cycle; will be dropped in `009_drop_scheduled_date.sql` after all reads switch.

**Removed:** `notifications` table reference and the push notification subsystem (`mobile/lib/notification-context.tsx`, `mobile/lib/notifications.ts`) were removed in `feat(mobile): job edit/delete + Jobs tab; remove push notifications` (commit `1659333`, branch `feat/mobile-job-edit`).

## Project Structure

```
marine-tech-app/
├── app/                           # Next.js Admin Dashboard
│   ├── login/                     # Login page
│   └── dashboard/
│       ├── layout.tsx             # Sidebar + QueryClientProvider wrap
│       ├── sidebar.tsx            # Inline-SVG nav (Dashboard / Reports / Jobs / Calendar / Technicians / Customers & Boats / PDI Reports)
│       ├── page.tsx               # Dashboard home
│       ├── jobs/                  # Jobs table
│       ├── calendar/              # NEW: Calendar tab (Month/Week/Day)
│       │   ├── page.tsx
│       │   ├── loading.tsx
│       │   └── error.tsx
│       ├── customers/, technicians/, reports/, pdi-reports/
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
│   ├── migrations/                # 001-008
│   ├── functions/                 # Edge functions (e.g., send-invite)
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
    │   └── calendar/              # NEW
    │       ├── MonthCalendar.tsx  # react-native-calendars with multi-dot markers
    │       ├── DayList.tsx        # FlatList of jobs for selected day
    │       └── JobBottomSheet.tsx # @gorhom/bottom-sheet on tap
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

## Mobile App Screens (5 tabs)

1. **Login** — Email/password, gold anchor icon, "MARINE TECH" branding
2. **Clients** (Tab 1) — Job cards with status badges, pull-to-refresh
3. **Service** (Tab 2) — Job form with customer/boat dropdowns, category tabs, BAD/GOOD checklist, notes. Supports edit mode via `?editJobId=` (on `feat/mobile-job-edit` branch).
4. **PDI** (Tab 3) — Pre-Delivery Inspection with progress counter
5. **Jobs** (Tab 4 — on `feat/mobile-job-edit` branch) — Browse and search assigned jobs, status filter, navigate to detail
6. **Calendar** (Tab 5 — NEW) — Month grid with multi-dot markers per tech; tap day → DayList; tap job → JobBottomSheet (25%/60% snap)
7. **Job Summary** (`/job/[id]`) — Read-only report view, photo gallery, Export PDF + Share. Edit + Delete actions on `feat/mobile-job-edit` branch.

## Admin Dashboard Pages

1. **Dashboard** (`/dashboard`) — Home overview
2. **Reports** (`/dashboard/reports`)
3. **Jobs** (`/dashboard/jobs`) — Table view with Create / Start / Complete actions
4. **Calendar** (`/dashboard/calendar`) — NEW. Month/Week/Day. Tech filter. Unscheduled tray. Click-empty-cell → New job modal. Click chip → popover with "Open job" link. Realtime updates.
5. **Technicians** (`/dashboard/technicians`)
6. **Customers & Boats** (`/dashboard/customers`)
7. **PDI Reports** (`/dashboard/pdi-reports`)

## Calendar Feature (shipped 2026-04-27)

- **Spec:** `docs/superpowers/specs/2026-04-27-calendar-tab-design.md`
- **Plan:** `docs/superpowers/plans/2026-04-27-calendar-tab.md`
- **Branch:** merged to `main` from `feat/calendar-tab`
- **Schema:** migration `008` adds `scheduled_start`, `scheduled_end` (timestamptz), `location_override` (text)
- **Web:** `/dashboard/calendar` — Month / Week / Day. Color-by-tech (hashed) + status stripe. Click empty cell → create. Click chip → popover. Tech filter dropdown. Unscheduled tray. Realtime via Supabase channel.
- **Mobile:** `(tabs)/calendar` — Month grid with dot markers + DayList for selected day + JobBottomSheet on tap.
- **Tests:** 20 unit tests (vitest), 3 Playwright e2e (auth setup pending), 1 Maestro flow (manual run).
- **Deferred to follow-up:** mobile HourGrid (day-view hour rows), mobile NewJobSheet (create-job UI), Realtime polling fallback for offline disconnect, migration `009` to drop `scheduled_date`.

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

- `main` — calendar feature merged + pushed
- `feat/mobile-job-edit` — pushed, not merged. Contains: mobile Edit/Delete actions, mobile Jobs tab, removal of push notifications, migration 007 tracking. Has expected merge conflicts in `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`, `mobile/package.json` to resolve as part of Stage B.

## Stage B (next planned work)

- Mobile scheduling — `service.tsx` writes `scheduled_start`/`scheduled_end` so techs can put jobs on the calendar from mobile.
- Web `/dashboard/jobs/[id]` — admin job detail page mirroring mobile job view (vessel, engine data, checklist, photos). Calendar's "Open job" link currently 404s — this fixes it.
- Merge `feat/mobile-job-edit` → `main` with conflict resolution.

## Related Projects

- **grayyachts.com** — Yacht management platform (`/Users/connorgray/Desktop/Claude OS/grayyachts.com`)
- **grayyachts.media** — Media production site (`/Users/connorgray/Desktop/Claude OS/grayyachts.media`)
- **grayyachts-agents** — Paperclip AI orchestration (`/Users/connorgray/Desktop/Claude OS/grayyachts-agents`)
</content>
</invoke>