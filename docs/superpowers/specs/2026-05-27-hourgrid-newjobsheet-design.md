# HourGrid + NewJobSheet — Mobile Calendar Day View

**Status:** Approved 2026-05-27
**Project:** Marine Tech App (`mobile/`)
**Related:** Follow-up to `2026-04-27-calendar-tab-design.md` (HourGrid + NewJobSheet were listed as deferred items in that spec)

## Summary

Add a Day view to the mobile Calendar tab so technicians can see their full schedule for a selected date at hour resolution, and tap an empty hour slot to schedule a new job in place. Closes two of the deferred items from the original calendar work in one slice.

The Week view (`WeeklyJobsPanel`, already shipped) and the Month view (`MonthCalendar`, already shipped) stay unchanged. A new `Week ⇄ Day` segmented control under the month grid switches the bottom panel between the two.

## Goals

- A tech opening the Calendar tab can switch to a Day mode and see every job scheduled for the selected day, laid out by hour from 5 AM through 8 PM (16 labeled hour rows; last row spans 8–9 PM).
- Multi-day jobs (boats in the shop for 2+ days, using `jobs.scheduled_end_date` from migration 014) appear pinned at the top of the day with a Day-of-N badge.
- Tapping an empty hour slot opens a `NewJobSheet` bottom sheet pre-filled with the tapped time; the tech picks customer + boat + duration and hits Schedule.
- All other interactions (tap chip → details, long-press → reschedule, Realtime updates, offline queueing) match the existing Week view's behavior, so the Day view feels like the same tab.

## Non-Goals

- **Pinch-to-zoom or +/- density** — hour rows are a fixed 60 px tall. May revisit if users complain about chip cramping.
- **Drag-to-reschedule inside the grid** — long-press already opens `ScheduleSheet`; gesture drag is more work than it's worth for v1.
- **Multi-day creation from `NewJobSheet`** — sheet enforces same-day end. Multi-day jobs are still created/edited via the web admin or by editing an existing single-day job.
- **Realtime polling fallback** — kept as a separately-deferred follow-up from the original calendar spec. Out of scope here.
- **Tech filter on mobile** — mobile is single-tech per RLS (`shop`-tier users see only their location's jobs assigned to them via the `assigned_to` link). No filter needed.
- **Web HourGrid/NewJobSheet** — `react-big-calendar` already covers the web Day view.

## Architecture

**Today:**

```
mobile/app/(tabs)/calendar.tsx
├── MonthCalendar         (top)
├── WeeklyJobsPanel       (bottom)
├── JobBottomSheet        (tap modal)
└── ScheduleSheet         (long-press modal)
```

**After:**

```
mobile/app/(tabs)/calendar.tsx
├── MonthCalendar         (top, unchanged)
├── ViewToggle            (NEW: Week ⇄ Day)
├── WeeklyJobsPanel       (bottom, viewMode === 'week')
├── HourGrid              (NEW: bottom, viewMode === 'day')
│   ├── AllDayStrip       (NEW: top of HourGrid, multi-day jobs)
│   └── 16 hour rows      (5 AM through 8 PM; last row spans 8–9 PM)
├── JobBottomSheet        (tap modal, unchanged)
├── ScheduleSheet         (long-press modal, unchanged)
└── NewJobSheet           (NEW: tap-empty-slot modal)
```

`viewMode` and `selectedDate` are owned by `calendar.tsx`. Both panels read the same `jobsQuery` (range = current month, already fetched). HourGrid filters in-memory by `selectedDate` and `scheduled_end_date` span; no new network calls beyond the existing month-range query.

## Files

**Modify:**

- `mobile/app/(tabs)/calendar.tsx` — add `viewMode` state, render `ViewToggle`, conditionally render `WeeklyJobsPanel` or `HourGrid`, wire `newJobSheetRef`
- `mobile/lib/calendar/queries.ts` — add `getCustomersForLocation(supabase)` and `getBoatsForCustomer(supabase, customerId)` helpers used by `NewJobSheet`
- `mobile/lib/calendar/format.ts` — add `isMultiDay(job)` and `dayOfN(selectedDate, startIso, endDate)`
- `mobile/.maestro/calendar.yaml` — extend with Day-view + NewJobSheet flows

**Create:**

- `mobile/components/calendar/ViewToggle.tsx`
- `mobile/components/calendar/HourGrid.tsx`
- `mobile/components/calendar/AllDayStrip.tsx`
- `mobile/components/calendar/NewJobSheet.tsx`

**No new tests directories**, no new dependencies, no schema changes.

## Data Model & Multi-Day Detection

No new migrations. Uses columns already shipped:

| Column | Migration | NULL means |
|---|---|---|
| `jobs.scheduled_start` (timestamptz) | 008 | Unscheduled → tray (not in HourGrid) |
| `jobs.scheduled_end` (timestamptz) | 008 | Treat as `start + 1 hr` for rendering only; never written back |
| `jobs.scheduled_end_date` (date) | 014 | NULL or `= scheduled_start::date` ⇒ single-day |
| `jobs.location_override` (text) | 008 | Use marina name |

**Multi-day classification** (added to `format.ts`):

```ts
export function isMultiDay(job: CalendarJob): boolean {
  if (!job.scheduledStart || !job.scheduledEndDate) return false;
  return job.scheduledEndDate > job.scheduledStart.slice(0, 10);
}

export function dayOfN(
  selectedDate: string,         // 'yyyy-MM-dd'
  startIso: string,
  endDate: string,
): { day: number; total: number } {
  const startDate = startIso.slice(0, 10);
  const total = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1;
  const day   = differenceInDays(parseISO(selectedDate), parseISO(startDate)) + 1;
  return { day, total };
}
```

A multi-day job is rendered in the `AllDayStrip` on every day from `scheduled_start::date` through `scheduled_end_date` inclusive — and **not** also as an hour-row chip.

**Single-day jobs are bucketed into the hour row at `getHours(parseISO(scheduledStart)) - 5`,** clamped to `[0, 15]`. A job starting at 4 AM clamps to the 5 AM row with a small `↑` glyph prepending the chip; a job starting at 10 PM clamps to the 8 PM row (the last visible row) with `↓`. These are rare but must not disappear.

## Components

### `ViewToggle.tsx` (~40 lines)

Two-button segmented control. Props: `{ value: 'week' | 'day'; onChange: (v) => void }`. 36 px tall, full-width, sits below `MonthCalendar`. Active button: `color: #C9A96E` + 2 px gold underline; inactive: `color: #8892A5`. Pressed flash `rgba(201,169,110,0.08)`.

### `HourGrid.tsx` (~180 lines)

Props: `{ jobs: CalendarJob[]; selectedDate: string; onSelectJob: (job) => void; onScheduleJob: (job) => void; onTapEmptySlot: (isoTimestamp) => void }`.

Internal:

1. `singleDayJobs = jobs.filter(j => j.scheduledStart?.slice(0, 10) === selectedDate && !isMultiDay(j))`
2. `multiDayJobs = jobs.filter(j => isMultiDay(j) && selectedDate >= j.scheduledStart!.slice(0, 10) && selectedDate <= j.scheduledEndDate!)`
3. `byHour = groupBy(singleDayJobs, j => clamp(getHours(parseISO(j.scheduledStart!)) - 5, 0, 15))`
4. Render `<AllDayStrip jobs={multiDayJobs} selectedDate={selectedDate} ... />` if non-empty
5. Render a `ScrollView` with 16 `<HourRow>`s, each receiving `byHour[i] ?? []`
6. If `selectedDate === today`, render `<NowLine>` absolutely positioned at `(currentHour - 5 + currentMin / 60) * HOUR_HEIGHT`; re-compute every minute via a `setInterval` cleared on unmount
7. On mount: today → `scrollTo(nowLineY - 100)`; otherwise `scrollTo((8 - 5) * 60)` so 8 AM is near top. Also on `selectedDate` change (not just mount).

Constants: `HOUR_HEIGHT = 60`, `LANE_HEIGHT = 28`.

`<HourRow>` (internal sub-component): a flex row with a 44-px hour label on the left and either an `<EmptySlotPressable>` (calls `onTapEmptySlot(selectedDate + Thh + :00:00)`) or vertically stacked `<JobLane>`s on the right. Row height = `Math.max(HOUR_HEIGHT, jobs.length * LANE_HEIGHT + 8)`.

`<JobLane>` (internal sub-component): full-width 24-px band. `backgroundColor = job.tech ? techColor(job.tech.id) : '#3b6cd6'`, `borderLeftWidth: 3`, `borderLeftColor: statusStripeColor(job.status)`, `borderRadius: 4`, `padding: '4px 6px'`. Text `"{formatTime(scheduledStart)}–{formatTime(scheduledEnd ?? +1h)} · {customer.name} · {boat.name}"`, single line, ellipsis. Press → `onSelectJob`. Long-press (500 ms) → `onScheduleJob`.

Empty-state: when `singleDayJobs.length === 0 && multiDayJobs.length === 0`, an absolutely-positioned `<View>` centered over the grid with text `"No jobs scheduled"` (16 px, `#8892A5`) and `"Tap any hour to schedule"` (12 px). Hour rows stay interactive behind it.

### `AllDayStrip.tsx` (~50 lines)

Props: `{ jobs: CalendarJob[]; selectedDate: string; onSelectJob: (job) => void; onScheduleJob: (job) => void }`. Container: `backgroundColor: #0d1320`, `borderBottomWidth: 1`, `borderBottomColor: #1a2236`, `padding: 6`, `gap: 4`. Each chip:

```
┌─────────────────────────────────────────┐
│ 🛠 B. White · Searay 290     DAY 2/3   │
└─────────────────────────────────────────┘
```

Same tech background + status left-border. Left text: `🛠 {customer.name} · {boat.name}`, single line. Right badge: `dayOfN(...)` rendered as `"DAY {day}/{total}"`, `fontSize: 9`, `opacity: 0.75`. Press → `onSelectJob`; long-press → `onScheduleJob`.

### `NewJobSheet.tsx` (~220 lines)

`@gorhom/bottom-sheet` mirroring `JobBottomSheet`'s ref pattern. Handle: `present(initialStart: string)`, `dismiss()`. Snap points: `['50%', '90%']`. Internal `KeyboardAvoidingView` so the picker doesn't hide behind the keyboard.

Form layout, top-to-bottom in a single scrollable sheet:

1. **Schedule row** — date pre-filled from `initialStart`, read-only display (`"Mon, Mar 4"`); start time editable via tap (`react-native-modal-datetime-picker` already installed for `ScheduleSheet`); duration chip set `[30m] [1h] [2h] [3h] [4h]`, default `1h`. If `start + duration > end-of-day`, that chip disables with tooltip `"Use the admin to schedule multi-day jobs"`.
2. **Customer picker** — pressable row that opens a secondary bottom sheet listing customers from `getCustomersForLocation(supabase)`. Searchable. Cached as `['customers']`.
3. **Boat picker** — disabled until customer chosen. On open, lists `getBoatsForCustomer(supabase, customerId)`. Cached as `['boats', customerId]`. Auto-selects if the customer has exactly one boat.
4. **Service types** (optional, behind a "+ Add details" expander) — chip set: Service, PDI, Warranty, Repair, Inspection. Multi-select.
5. **Location override** (optional, under expander) — single-line text input.
6. **Notes** (optional, under expander) — multi-line text input.
7. **Sticky footer** — `[Cancel]` (text button left) and `[Schedule]` (gold-filled right, `48px`, `#C9A96E`, `color: #060a12`, `font-weight: 700`). Schedule disabled until `customerId && boatId`.

On `Schedule`:

```ts
const { profile } = useAuth();   // existing AuthProvider in mobile/lib/auth-context.tsx
await createJob(supabase, {
  customerId, boatId,
  scheduledStart: initialStart,                  // ISO from tapped slot, possibly edited
  scheduledEnd: addHours(parseISO(initialStart), durationHours).toISOString(),
  assignedTo: profile.id,                        // current tech; admins keep default-to-self for v1
  serviceTypes, locationOverride, notes,
})
queryClient.invalidateQueries({ queryKey: ['calendar-mobile'] })
queryClient.invalidateQueries({ queryKey: ['calendar-mobile-unscheduled'] })
sheetRef.current?.dismiss()
// success feedback: match ScheduleSheet's existing success path (verify during
// implementation — if ScheduleSheet uses a toast lib, reuse it; if it just
// dismisses silently, do the same here and rely on the chip appearing in
// HourGrid via the invalidated query for confirmation)
```

`createJob` already exists in `lib/calendar/queries.ts` — no new mutation code. The job's `location_id` is **not** set on `jobs` directly; RLS (`shop_read_jobs`, migration 017) derives location scope by following the parent `customer.location_id`, which was set when the customer was created. As long as the customer picker is RLS-filtered (which it is — `getCustomersForLocation` returns only customers in the current tech's location), the new job is automatically in the tech's location.

## Interactions

| Trigger | Result |
|---|---|
| Tap **Week** in `ViewToggle` | `viewMode='week'`; `WeeklyJobsPanel` renders |
| Tap **Day** in `ViewToggle` | `viewMode='day'`; `HourGrid` renders for current `selectedDate`; today → auto-scroll to now-line minus ~100 px; else → 8 AM near top |
| Tap a date in `MonthCalendar` | Updates `selectedDate`; `HourGrid` re-filters; auto-scrolls to 8 AM (only auto-scrolls to now on first entering Day mode while on today) |
| Swipe `MonthCalendar` to a new month | Refetches `jobsQuery`; `HourGrid` re-renders if `selectedDate` is in the new month |
| Tap a job chip (single or all-day) | Existing `JobBottomSheet` opens with that job |
| Long-press a job chip | Existing `ScheduleSheet` opens to reschedule |
| Tap an empty hour slot | `NewJobSheet` opens with `scheduledStart = selectedDate + tapped hour + :00:00` (local TZ → ISO) |
| `NewJobSheet`: pick customer | Boat picker enables; auto-selects boat if customer has exactly one |
| `NewJobSheet`: pick duration crossing midnight | That chip greys with tooltip; user picks shorter or uses web |
| `NewJobSheet`: hit `Schedule` | Mutation → invalidate `['calendar-mobile', ...]` + `['calendar-mobile-unscheduled']` → dismiss → success feedback matches `ScheduleSheet`'s existing pattern (verify which toast/notification system, if any, is in use during implementation) |
| `NewJobSheet`: `Cancel` or pan-down | Dismiss; no toast |
| Realtime: external job change | Existing `subscribeToJobs` invalidates queries → `HourGrid` re-renders |
| Pull-to-refresh on `HourGrid` | Manual re-run of `jobsQuery` via `RefreshControl` on the `ScrollView` |

## Visual Polish

All colors come from `constants/Colors.ts` and `lib/calendar/colors.ts`. No new tokens.

| Element | Style |
|---|---|
| Hour row top border | `1 px solid #1a2236` |
| Hour label | 44 px wide, `font-size: 11`, `color: #8892A5`, right-aligned, `padding: 4px 6px`, right border `1 px #1a2236` |
| Hour row height | `Math.max(60, jobs.length * 28 + 8)` |
| Job lane (chip) | 24 px tall, `bg: techColor(tech.id)`, `borderLeft: 3px solid statusStripeColor(status)`, `borderRadius: 4`, `padding: 4px 6px`, white `font-size: 11 / weight: 500`, single line ellipsis |
| All-day strip | `bg: #0d1320`, bottom border `1 px #1a2236`, `padding: 6`, `gap: 4` |
| All-day chip | 28 px tall, same colors as lane; left text + right `"DAY n/N"` (`font-size: 9, opacity: 0.75`) |
| Now-line | 1 px `#ef4444` horizontal line + 7×7 dot at left margin; updates every minute |
| `ViewToggle` | 36 px tall, `bg: #0d1320`, bottom border `1 px #1a2236`; active = `color: #C9A96E` + 2 px gold underline; inactive = `color: #8892A5` |
| `NewJobSheet` | `bg: #0d1320`, handle `#8892A5`; field labels 11 px uppercase `#8892A5`; values 15 px `#f1f5f9`; field underline `1 px #1a2236`; duration chips 36 px, `bg: #1a2236`, selected = `#C9A96E` + text `#060a12`, disabled = `opacity 0.3`; `Schedule` button gold full-width 48 px |
| Empty state | Centered `"No jobs scheduled"` 16 px `#8892A5` over `"Tap any hour to schedule"` 12 px `#8892A5` `opacity 0.8` |

## Error Handling

| Failure | Behavior |
|---|---|
| `jobsQuery` fetch fails | Existing toast-and-retry; `HourGrid` shows last cached jobs |
| `createJob` mutation fails | `NewJobSheet` stays open; inline red banner under footer with `error.message`; Schedule re-enables; no auto-dismiss |
| Customer or boat picker query fails | Picker shows `"Couldn't load — pull to retry"` empty state |
| Empty-slot tap outside the rendered range (5 AM–9 PM) | Cannot happen — those rows don't exist in the DOM |
| Duration would cross midnight | UI prevents (chip disabled); no runtime path |
| Realtime channel drops | Existing reconnect logic; polling fallback remains separately deferred |

## Offline Behavior

`HourGrid` renders from React Query's cached `jobsQuery` data. `NewJobSheet`'s Schedule mutation goes through the same `supabase.from('jobs').insert(...)` path as `service.tsx` and inherits the existing `useOffline` queue automatically. If offline, the success feedback (whatever pattern `ScheduleSheet` uses) should indicate queued state rather than confirmed — phrasing settled during implementation. Existing global `"Last synced X ago"` indicator covers staleness.

## Loading States

- Initial month load: existing `<ActivityIndicator color={colors.gold} />` from `calendar.tsx`
- Day-view first paint: hour rows render immediately (empty state if no jobs yet)
- Customer/boat picker open: brief 100 ms spinner row at top of picker; cached on next open

## Testing

**Unit tests** (`__tests__/calendar/` on the web side — `mobile/lib/calendar/` mirrors web; the pure functions tested are imported from the shared source):

- `format.test.ts` — extend with `isMultiDay()` cases: single-day, two-day, three-day, NULL `scheduledEndDate`, NULL `scheduledStart`
- `format.test.ts` — `dayOfN()` cases: day 1/3, 2/3, 3/3, 1/1; selecting a date outside the span (defensive)
- `HourGrid.bucket.test.ts` (new) — pure function `bucketJobsByHour(jobs, selectedDate)` returns `Record<number, CalendarJob[]>` correctly: jobs at exact-hour boundary; jobs across DST forward (March) and back (November); 4 AM job clamps to bucket 0 with overflow flag; 10 PM job clamps to bucket 15 with overflow flag

**Maestro flow** (extend `mobile/.maestro/calendar.yaml`):

1. Open Calendar → tap Day toggle → assert HourGrid visible → tap empty 10 AM slot → assert NewJobSheet visible → tap customer (Demo Customer) → tap boat (Sea Trial) → tap Schedule → assert sheet dismissed → assert a chip exists in the 10 AM row
2. Open Calendar → tap Day toggle → tap an existing chip → assert JobBottomSheet opens (regression: tap behavior identical between panels)

**Manual smoke (pre-merge, in plan):**

- Day with zero jobs (empty state)
- Day with one job mid-morning (auto-scroll behavior)
- Day with 6+ overlapping jobs at 10 AM (row grows; chips legible)
- Multi-day job rendering on start / middle / end days
- Today's now-line position; tomorrow has no now-line
- DST forward + back (March + November) at a known date — hour rows align
- Offline mid-session: schedule a job, verify it queues
- iPhone SE (small screen): chips not cramped at default density

## Out of Scope (Deferred)

These were considered and deliberately left out of this slice:

- Pinch-to-zoom / +/- hour density controls
- Drag-to-reschedule inside the grid
- Creating multi-day jobs from `NewJobSheet`
- Realtime polling fallback on disconnect
- Tech filter dropdown (moot on mobile per RLS)
- Web HourGrid / NewJobSheet (web already has Day view via `react-big-calendar`)
- Updating the existing dashed `scheduled_date` legacy column (separate migration cleanup)
