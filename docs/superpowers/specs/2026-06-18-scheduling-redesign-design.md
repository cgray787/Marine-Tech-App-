# Scheduling Redesign — Day-Focused Calendar + Multi-Day Spanning

**Date:** 2026-06-18
**Status:** Approved (design validated with visual mockups), implementing.
**Surfaces:** Mobile app (`/mobile`), Admin dashboard (this repo `/app/dashboard/calendar`), grayyachts.com portal (`~/Desktop/Claude OS/grayyachts.com` → `/portal/marine-tech`).

## Goal

A day-focused schedule view everywhere: tapping/clicking a day surfaces that day's jobs first, then the rest of the week, then unscheduled jobs that need a time. Multi-day jobs appear on **every day they span**.

## Decisions (locked via mockups)

1. **Panel layout (Layout A):** stacked sections, top to bottom:
   1. **Selected day** — the tapped day's scheduled jobs (with times).
   2. **Scheduled this week** — the rest of the week (lighter list; each job once).
   3. **Unscheduled — needs a time** — with a Schedule button (unchanged behavior).
2. **Multi-day jobs:** appear on **every** day they span. Month grid marks every covered day; each spanned day's list shows the job tagged `Day N of M`. Web grids (react-big-calendar) render the spanning bar natively.
3. **Scope: everything everywhere.** Mobile gets the panel redesign; admin dashboard + portal get a matching day-focused panel **below** the calendar grid (Option B), reusing the existing grid + multi-day spanning.

## Data model — NO migration

`jobs` already has `scheduled_start` (timestamptz), `scheduled_end` (timestamptz), `scheduled_end_date` (date, multi-day). A job's span = `date(scheduled_start)` → `scheduled_end_date` inclusive (fall back to the single start day when `scheduled_end_date` is null/empty). The Service form already writes these. This is a **rendering** change, not a scheduling-entry change.

## Shared helper (added to each repo's `lib/calendar/`)

Pure, unit-tested:
- `jobDays(job): string[]` — every `yyyy-MM-dd` the job covers (start day → scheduled_end_date inclusive; `[startDay]` when no end date; `[]` when unscheduled).
- `jobsForDay(jobs, dayISO): Array<job & { dayIndex, dayCount }>` — jobs whose span includes `dayISO`, each annotated with `Day N of M` (N = position within its span, M = total span days), sorted by start time.
- `jobsForWeek(jobs, weekStart)` — distinct jobs scheduled within the week (each once), for section ②.

Alternative considered & rejected: materializing per-day rows in the DB (needs a migration + write-path changes; heavier). Client-side expansion reuses existing range queries.

## Per-surface work

### Mobile (`/mobile`)
- `lib/calendar/` — add `jobDays` / `jobsForDay` / `jobsForWeek` (+ tests).
- `components/calendar/WeeklyJobsPanel.tsx` — becomes the 3-section stack (①selected day ②this week ③unscheduled). Receives `selectedDate`.
- `components/calendar/MonthCalendar.tsx` — multi-dot markers mark every spanned day, not just the start.
- `app/(tabs)/calendar.tsx` — pass `selectedDate` to the panel.
- (Already done on the carried branch: `app/job/[id].tsx` dead-back-arrow fix.)

### Admin dashboard (this repo)
- `lib/calendar/` — same helper + vitest tests.
- `components/calendar/CalendarView.tsx` (or queries) — set react-big-calendar event `end` from `scheduled_end_date` so multi-day events span every day.
- New `components/calendar/DayFocusPanel.tsx` — the ①/②/③ stack, rendered **below** the grid in `app/dashboard/calendar/page.tsx`, driven by the selected day; respects the office (`mt-location`) filter.

### grayyachts.com portal (separate repo)
- Mirror the admin dashboard changes in `/portal/marine-tech` (helper + spanning + DayFocusPanel-below). Keep both dashboards in sync per the repo rule.

## Testing
- vitest unit tests for `jobDays`/`jobsForDay`/`jobsForWeek` (both web repos).
- Mobile: `tsc --noEmit` + a Maestro flow (tap day → day section populates; a 2-day job shows on both days).
- Web: a `DayFocusPanel` render test.

## Deployment
- Mobile: OTA to live runtimes (JS-only) + next build; the back-arrow fix ships in the same push.
- Admin dashboard: `npm run deploy` (Cloudflare Workers).
- Portal: its repo's deploy (`npx opennextjs-cloudflare build && npx wrangler deploy`).

## Build order
1. Spec (this doc). ✓
2. Mobile: helper + tests → WeeklyJobsPanel → MonthCalendar → wire calendar.tsx → typecheck. Commit.
3. Admin dashboard: helper + tests → spanning events → DayFocusPanel → page wiring → vitest/build. Commit.
4. Portal: mirror. Commit.
5. Deploy all + verify.

## Out of scope
- Changing how scheduling is entered (Service form multi-day picker already works).
- Drag-to-reschedule on web.
- Dropping the legacy `scheduled_date` column.
