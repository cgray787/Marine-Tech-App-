# Paperwork Blocks + Per-Day Locations + Calendar History

**Date:** 2026-06-22
**Status:** Approved (decisions locked), implementing.
**Surfaces:** Mobile (`/mobile`), Admin dashboard (this repo), grayyachts.com portal.

## Goal & decisions (locked)
1. **Paperwork block** — a schedulable calendar item for a tech to block paperwork/admin time. **Standalone** (no client/boat), has a note/title, scheduled like any job (incl. multi-day). Distinct look ("📋 Paperwork").
2. **Per-day location** — a multi-day job can have a **different place per day** (Day 1 Edmonds, Day 2 Shilshole…). Calendar day rows show each day's place.
3. **Past history** — past + completed jobs stay visible when scrolling back through months (verify; the calendar already loads per visible month).

## Data model — migration `039_paperwork_perday_location.sql`
On `jobs`:
- `kind text NOT NULL DEFAULT 'service'` + CHECK `kind IN ('service','paperwork')`.
- `day_locations jsonb NOT NULL DEFAULT '{}'` — `{ "YYYY-MM-DD": "<place text>" }` per-day place for multi-day jobs. Empty ⇒ the job's single `marina`/`location_override` applies to all days.
- `location_id uuid REFERENCES locations(id)` — needed because paperwork has no customer to scope by. A trigger sets it for paperwork rows.

**Trigger** `set_paperwork_location` (BEFORE INSERT/UPDATE): if `NEW.kind='paperwork'` and `NEW.location_id IS NULL`, set `NEW.location_id = (SELECT location_id FROM profiles WHERE id = NEW.assigned_to)`. (Service jobs keep `location_id` NULL and stay scoped by customer, unchanged.)

**RLS (additive — only grants paperwork access; service-job policies untouched, every paperwork policy is gated on `kind='paperwork'`):**
- SELECT `paperwork_read`: `kind='paperwork' AND (location_id = current_profile_location() OR assigned_to = current_profile_id())`. (admins via `admin_all_jobs`, viewers via `viewer_select_jobs` already cover them.)
- INSERT `paperwork_insert` (WITH CHECK): `kind='paperwork' AND (assigned_to = current_profile_id() OR location_id = current_profile_location())`. (RESTRICTIVE `writers_only_insert` = `profile_can_write()` still applies ⇒ viewers blocked.)
- UPDATE `paperwork_update` (USING+CHECK) + DELETE `paperwork_delete` (USING): same predicate as read.
- Multi-day end trigger `job_assignee_location` (035) is customer-based and exempts null-customer rows, so paperwork inserts aren't blocked by it.

No backfill needed (existing rows default `kind='service'`, `day_locations='{}'`, `location_id=NULL`).

## Shared lib
- `lib/calendar/types.ts` (+ mobile + portal): add `kind`, `dayLocations`, to `CalendarJob` and the row→object mapper + `calendarSelect`.
- `lib/calendar/spans.ts`: `placeForDay(job, day)` → `day_locations[day] ?? job.marina?.name ?? job.locationOverride ?? null`. Reuse in day rows.

## UI per surface
**Scheduler — "Paperwork" option:**
- Web: `ScheduleQuickPicker` / `NewJobModal` get a **type toggle** (Service | Paperwork). Paperwork mode hides client/boat, shows a **Title/Note** field + tech + day(s) + time (+ per-day place). Mobile: `NewJobSheet` / `ScheduleSheet` / Service form get the same toggle. Paperwork blocks created with `kind='paperwork'`, `customer_id=null`, `boat_id=null`.
**Per-day location editor:** when `end date > start date`, render a compact per-day list (one place input per day) that writes `day_locations`. Applies to both service and paperwork multi-day.
**Calendar rendering:**
- Paperwork blocks: distinct color (e.g. slate/gold `#C9A96E` outline) + "📋 Paperwork — <note>" label, no boat. Month spanning + day rows same as jobs.
- Day rows (`DayFocusPanel`, mobile `WeeklyJobsPanel`, portal panel): show `placeForDay(job, day)` so each spanned day shows its own place.
**History:** verify month-back navigation shows past + completed jobs on all surfaces; confirm queries don't filter out `status='completed'` or prune old months.

## Testing
- vitest: `placeForDay` + `day_locations` mapping (web repos); migration applied + smoke SQL (paperwork row gets location_id via trigger; service rows unchanged).
- Mobile `tsc`; per-surface build.

## Deployment
Migration applied to prod (additive, safe) up front; UI ships on Connor's "deploy": admin `npm run deploy`, portal build+deploy, mobile OTA (runtime 1.2.0).

## Build order
1. Spec (this). 2. Migration 039 + verify. 3. Shared lib (types/mapper/placeForDay) per repo. 4. Scheduler paperwork toggle + per-day editor. 5. Calendar rendering. 6. History verify. 7. Deploy on go.

## Out of scope
Recurring paperwork, paperwork templates, per-day *times* (only per-day place), drag-reschedule.
