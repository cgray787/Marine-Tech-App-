# Calendar Tab — Design Spec

**Date:** 2026-04-27
**Status:** Approved (awaiting plan)
**Apps affected:** Admin Dashboard (Next.js, web) + Mobile App (React Native + Expo)

## Goal

Add a Calendar tab to both the admin dashboard and the technician mobile app. Owners see all techs' jobs across the month for scheduling and oversight; technicians see only their own assigned jobs. Calendar supports Month, Week, and Day views (mobile defers Week to v2).

## User Stories

- **Owner (admin web):** "I want to see every tech's jobs on a single calendar so I can spot scheduling conflicts and unassigned days."
- **Technician (mobile):** "I want to see my upcoming jobs on a monthly grid so I can plan my week, then tap a day to see exactly when I'm working."
- **Both:** "I want to click an empty slot and create a new job without leaving the calendar. I want to click a job to see customer/boat/location details and jump to the full job page."

## Scope

**In scope:**
- Admin dashboard route `/dashboard/calendar` with Month + Week + Day views.
- Mobile tab `(tabs)/calendar` with Month + Day views.
- Schema migration adding `scheduled_start`, `scheduled_end`, `location_override` to `jobs`.
- Quick-create modal on empty slot click; quick-popover on job chip click.
- "Unscheduled" tray for jobs with null `scheduled_start`.
- Color-by-tech with status indicator stripe; tech filter dropdown (admin).
- Realtime updates via Supabase subscription.

**Out of scope (deferred):**
- Recurring jobs ("every Tuesday").
- Drag-to-reschedule.
- Calendar export (.ics).
- Push notifications for upcoming jobs.
- Mobile week view.

## Architecture

### Apps + libraries

| Concern | Web (Next.js) | Mobile (RN/Expo) |
|---|---|---|
| Calendar primitive | `react-big-calendar` | `react-native-calendars` (Month) + custom hour grid (Day) |
| Popover | Radix Popover | `@gorhom/bottom-sheet` |
| Modals | Radix Dialog | Full-screen Expo modal |
| Date utils | `date-fns` (new) | `date-fns` (new) |
| Data fetching | `@tanstack/react-query` (new) over Supabase JS client | Same |

### File layout

**Web:**
```
app/dashboard/calendar/
  page.tsx                   # CalendarPage server shell
  loading.tsx
  error.tsx
components/calendar/
  CalendarView.tsx           # react-big-calendar wrapper, view-mode state
  CalendarToolbar.tsx        # date nav, tech filter, view switcher, +New
  JobChip.tsx                # 3-line custom event renderer
  JobPopover.tsx             # Radix popover, opens on chip click
  NewJobModal.tsx            # Radix dialog, opens on empty-slot click or +New
  UnscheduledTray.tsx        # collapsible row above grid
lib/calendar/
  queries.ts                 # getJobsInRange, getUnscheduledJobs, mutations
  colors.ts                  # deterministic tech-id → hex
  format.ts                  # 9 AM / 10:30 AM time formatter
```

**Mobile:**
```
mobile/app/(tabs)/
  _layout.tsx                # add 5th tab "Calendar"
  calendar.tsx               # CalendarScreen
mobile/components/calendar/
  MonthCalendar.tsx          # react-native-calendars wrapper
  DayList.tsx                # FlatList of jobs grouped by hour
  JobBottomSheet.tsx         # @gorhom/bottom-sheet popover equivalent
  NewJobSheet.tsx            # full-screen create modal
  HourGrid.tsx               # custom day-view hour rows
mobile/lib/calendar/
  (mirrors web — queries, colors, format)
```

**Sidebar update (web):** add Calendar entry between Jobs and Technicians in `app/dashboard/sidebar.tsx`, lucide-react `Calendar` icon.

## Database Migration

New file: `supabase/migrations/008_jobs_scheduled_timestamps.sql`

```sql
ALTER TABLE public.jobs
  ADD COLUMN scheduled_start   timestamptz,
  ADD COLUMN scheduled_end     timestamptz,
  ADD COLUMN location_override text;

CREATE INDEX idx_jobs_scheduled_start ON public.jobs (scheduled_start);
```

**Notes:**
- `scheduled_date` (existing date column) is **kept for one release cycle** so existing reads (jobs page, mobile, webhook in `003_job_webhook.sql`) don't break. New writes populate **both** `scheduled_date` (date portion of `scheduled_start`) and the new timestamp columns. A follow-up migration `009_drop_scheduled_date.sql` removes it after all read sites switch.
- Backfill: **none.** Existing rows keep `scheduled_date` and have `NULL` timestamps; they appear in the Unscheduled tray until edited.
- `location_override` is free text. Display priority on chips: `location_override` if set, else `marina.name`, else nothing.

## Data Flow

### Read

`CalendarPage` mounts → URL params `?view=month&date=2026-04` (sharable URLs) → React Query call to `getJobsInRange(startUtc, endUtc, techFilter?)`:

```ts
supabase
  .from('jobs')
  .select(`
    id, scheduled_start, scheduled_end, status, location_override, notes,
    customer:customers(id, name),
    boat:boats(id, name, make_model),
    marina:marinas(id, name),
    tech:profiles!assigned_to(id, full_name)
  `)
  .gte('scheduled_start', startUtc)
  .lte('scheduled_start', endUtc)
  .order('scheduled_start');
```

Separate `getUnscheduledJobs()` for `WHERE scheduled_start IS NULL` — returns all unscheduled (for admin) or own (for tech, via RLS).

### Realtime

Supabase channel subscription on `jobs` (filter: `eventType in [INSERT, UPDATE, DELETE]`) invalidates the React Query cache so changes from other clients appear within ~1s.

### Write

`useMutation` wrappers around upsert/update job. Optimistic update on the calendar; revert on error. New job from empty-slot click: prefilled `scheduled_start` = clicked slot, `scheduled_end` = +1hr default.

### Tech color resolution

`lib/calendar/colors.ts`:
```ts
const PALETTE = ['#3b6cd6','#a855f7','#ec4899','#f97316','#14b8a6','#84cc16','#f59e0b','#06b6d4'];
export function techColor(techId: string): string {
  let h = 0;
  for (const c of techId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
```

Status colors (left-border stripe on chip):
- `new` → `#4ade80` (green)
- `in_progress` → `#f59e0b` (amber)
- `completed` → `#94a3b8` (slate)

### RLS

Existing policies (verified in `005_fix_rls_infinite_recursion.sql`, `007_tech_edit_delete_jobs.sql`) already restrict techs to their own jobs and grant admins full access. **No new RLS work required.**

## UI / Layout

### Admin month view (approved mockup)

- **Sidebar:** Calendar entry highlighted in gold (`#C9A96E`).
- **Toolbar (top of main):** Month/year title (Cormorant Garamond), `‹ Today ›` nav, tech filter dropdown, Month/Week/Day segmented switcher (gold = active), `+ New job` gold button.
- **Unscheduled tray:** below toolbar, dark card with "Unscheduled (N)" gold label and horizontal chip strip; collapsible.
- **Calendar grid:** dark card, `Sun → Sat` headers, 130px row height.
- **Chip:** 3 lines — `9 AM · J. Smith` / `Sea Ray 32` / `📍 Shilshole` — colored by tech, left border = status. Truncates with `+N more` indicator after 3 chips per cell.
- **"Today" cell:** subtle gold tint background (`rgba(201,169,110,0.08)`).
- **Legend:** below grid — tech colors (right of "Techs:" label) + status stripe colors (right of "Status:" label).

### Time format

- On the hour: `9 AM`, `2 PM`
- With minutes: `10:30 AM`, `2:15 PM`
- Helper: `lib/calendar/format.ts → formatTime(date)`.

### Week + Day views (web)

- Standard `react-big-calendar` time grids, restyled to match dark navy + gold theme via CSS overrides on `.rbc-*` classes.
- Hour range default: `6 AM` – `8 PM`. Configurable in component.
- Same JobChip render in time slots.

### Mobile

- **Tab bar:** add `Calendar` tab with 📅 icon.
- **Month view:** `react-native-calendars` `<Calendar>` with custom `dayComponent` showing colored dots per job (max 3 dots + "+N" indicator).
- **Day list:** below calendar, `FlatList` grouped by hour. Each card: `9 AM · J. Smith` header, boat + location.
- **Day view:** vertical hour rows (`6 AM`–`8 PM`), job cards positioned absolutely. Pinch-to-zoom or `+/−` for density.
- **Bottom sheet popover:** `@gorhom/bottom-sheet`, snap points 25% (summary) and 60% (details + actions).

## Interactions

| Trigger | Result |
|---|---|
| Click chip | Quick popover (web) / bottom sheet (mobile) — summary + "Open job" button |
| Click "Open job" in popover | Navigate to `/dashboard/jobs/[id]` (web) or `/job/[id]` (mobile) |
| Click empty cell | New job modal opens, `scheduled_start` prefilled, `scheduled_end` = +1hr |
| Click +New job (toolbar) | New job modal opens with current date prefilled |
| Click a job in Unscheduled tray | Edit popover opens with focus on time input |
| Switch view (Month/Week/Day) | Updates URL param, refetches range |
| Filter tech | Updates URL param, refilters in-memory + refetches |

## Empty States

- **No jobs in range:** centered illustration + "No jobs scheduled this month" + "+ Schedule a job" CTA.
- **Tech view, no assignments:** "Your calendar is clear — check the Jobs tab for unassigned work."
- **Unscheduled tray with 0:** tray hidden entirely.
- **Filter returns empty:** "No jobs for {tech name} in {month}" + "Show all techs" link.

## Error Handling

- **Query fails:** toast + retry button; calendar stays on last successful data.
- **Mutation fails:** optimistic update reverts; toast with error; popover/modal stays open with error inline.
- **Realtime disconnect:** silent fallback to 30s polling; reconnect when network returns.
- **Invalid time range** (`scheduled_end ≤ scheduled_start`): inline form validation, save button disabled.
- **Backfilled job (null times) clicked:** opens edit modal with focus on time input.

## Loading States

- **Initial load:** skeleton calendar grid (gray cells, no chips).
- **Refetch on view change:** subtle loading bar at top, calendar stays interactive.
- **Mobile:** existing pull-to-refresh on calendar screen.

## Offline Behavior (mobile)

- React Query cache returns last fetched jobs.
- Mutations queue via existing `useOffline` context; sync banner appears (already built).
- Calendar renders normally — stale data marked with subtle indicator if older than 5 min offline.

## Testing

**Unit (`__tests__/`):**
- `colors.ts` — deterministic hash → palette lookup, distribution across 100 random IDs.
- `queries.ts` — date range boundaries (UTC vs local, month edges, DST flips).
- `format.ts` — `9 AM` vs `10:30 AM` vs midnight (`12 AM`) vs noon (`12 PM`).

**Integration (Playwright on web):**
- Open calendar → correct jobs in correct cells.
- Click chip → popover with right data.
- Click empty cell → modal opens with prefilled date.
- Filter by tech → only their chips show.
- Realtime: insert job in DB → appears within 2s without refresh.

**Mobile:** the project has no E2E framework installed today. Add Maestro (lighter, YAML-based, easier to maintain than Detox) for these flows:
- Tab navigation to calendar.
- Day select → jobs list.
- Bottom sheet open/dismiss.

If we'd rather defer mobile E2E entirely, manual smoke pass on TestFlight build will cover initial release.

**Manual smoke pass before merge:**
- Timezone edge cases (PT vs ET created job display).
- DST week (March + November).
- 100+ jobs in one month for perf.
- Tech-only view shows only own jobs.

## Dependencies

Verified against `package.json` and `mobile/package.json` on 2026-04-27 — all of the following are new installs.

**New (web):**
- `react-big-calendar` (~50KB gzipped) — calendar primitive
- `date-fns` — date math + formatting
- `@radix-ui/react-popover`, `@radix-ui/react-dialog` — popover + modal primitives
- `lucide-react` — calendar / chevron icons
- `@tanstack/react-query` — data fetching, cache invalidation, realtime integration

**New (mobile):**
- `react-native-calendars` — month grid primitive
- `@gorhom/bottom-sheet` — popover equivalent
- `react-native-reanimated` (peer of bottom-sheet) — gesture animations
- `react-native-gesture-handler` (peer of bottom-sheet)
- `date-fns` — same as web
- `@tanstack/react-query` — same as web

**No backend dependencies added.**

## Open Questions

None at design-approval time. Implementation may surface:
- Exact placement of "Calendar" in mobile tab order (currently proposed: between PDI and Jobs — confirm at build time).
- Hour range defaults (`6 AM`–`8 PM`) — adjust based on actual job time data once collected.
