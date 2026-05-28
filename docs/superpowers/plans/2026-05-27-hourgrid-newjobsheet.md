# HourGrid + NewJobSheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Day view to the mobile Calendar tab so technicians can see their day at hour resolution and tap an empty hour slot to schedule a new job in place. Closes two deferred items from the 2026-04-27 calendar work (HourGrid + NewJobSheet) in a single slice.

**Architecture:** A `Week ⇄ Day` segmented control sits under `MonthCalendar`, switching the bottom panel between the existing `WeeklyJobsPanel` and a new `HourGrid` (hour-bucketed rows, 5 AM – 8 PM, with horizontal lanes for overlapping jobs and an `AllDayStrip` for multi-day spans via `jobs.scheduled_end_date`). Tapping an empty hour opens `NewJobSheet`, a slim `@gorhom/bottom-sheet` form (customer + boat + duration) that calls the existing `createJob` mutation. No schema changes, no new dependencies.

**Tech Stack:** React Native (Expo SDK 54) · TypeScript · `@gorhom/bottom-sheet` · `@react-native-community/datetimepicker` · `react-native-calendars` · `@tanstack/react-query` · `date-fns` · Supabase JS client · Vitest (web-side, tests pure functions mirrored from mobile) · Maestro (mobile e2e).

**Spec:** `docs/superpowers/specs/2026-05-27-hourgrid-newjobsheet-design.md`

---

## File Structure

**Modify:**
- `mobile/lib/calendar/types.ts` — add `scheduledEndDate: string | null` to `CalendarJob`
- `lib/calendar/types.ts` (web mirror) — same addition
- `mobile/lib/calendar/queries.ts` — add `scheduled_end_date` to `SELECT`, populate in `mapJobRowToCalendarJob`; add `getCustomersForLocation` + `getBoatsForCustomer`
- `lib/calendar/queries.ts` (web mirror) — `scheduled_end_date` parity
- `mobile/lib/calendar/format.ts` — add `isMultiDay`, `dayOfN`, `bucketJobsByHour`, `clampHourBucket`
- `lib/calendar/format.ts` (web mirror) — same additions (tests run here)
- `mobile/app/(tabs)/calendar.tsx` — `viewMode` state, render `ViewToggle`, switch panels, wire `NewJobSheet`
- `mobile/.maestro/calendar.yaml` — extend with Day-view + NewJobSheet flow
- `__tests__/calendar/format.test.ts` — extend with `isMultiDay` + `dayOfN` cases

**Create:**
- `mobile/components/calendar/ViewToggle.tsx`
- `mobile/components/calendar/AllDayStrip.tsx`
- `mobile/components/calendar/HourGrid.tsx`
- `mobile/components/calendar/NewJobSheet.tsx`
- `__tests__/calendar/hour-grid.test.ts` — bucketing + clamp tests

**No schema migrations. No new dependencies.**

---

## Task 0: Setup feature branch

**Files:** none

- [ ] **Step 1: Verify clean working tree**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && git status`
Expected: `nothing to commit, working tree clean` on `main`.

- [ ] **Step 2: Pull latest main**

Run: `git pull origin main`
Expected: `Already up to date.` or fast-forward to latest.

- [ ] **Step 3: Create feature branch**

Run: `git checkout -b feat/calendar-hourgrid-newjobsheet`
Expected: `Switched to a new branch 'feat/calendar-hourgrid-newjobsheet'`.

- [ ] **Step 4: Push branch to origin**

Run: `git push -u origin feat/calendar-hourgrid-newjobsheet`
Expected: `Branch 'feat/calendar-hourgrid-newjobsheet' set up to track 'origin/feat/calendar-hourgrid-newjobsheet'.`

---

## Task 1: Extend `CalendarJob` with `scheduledEndDate`

The current type lacks the `scheduled_end_date` field that migration 014 added. `AllDayStrip` and the multi-day detection logic need it.

**Files:**
- Modify: `mobile/lib/calendar/types.ts`
- Modify: `lib/calendar/types.ts` (web mirror)
- Modify: `mobile/lib/calendar/queries.ts`
- Modify: `lib/calendar/queries.ts` (web mirror)

- [ ] **Step 1: Add `scheduledEndDate` to mobile type**

In `mobile/lib/calendar/types.ts`, add after the `scheduledEnd` line:

```ts
export type CalendarJob = {
  id: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledEndDate: string | null;   // ← add this line
  status: JobStatus;
  notes: string | null;
  locationOverride: string | null;
  customer: { id: string; name: string } | null;
  boat: { id: string; name: string; makeModel: string | null } | null;
  marina: { id: string; name: string } | null;
  tech: { id: string; fullName: string } | null;
};
```

- [ ] **Step 2: Mirror to web type**

Apply the identical addition to `lib/calendar/types.ts`.

- [ ] **Step 3: Extend mobile SELECT + mapper**

In `mobile/lib/calendar/queries.ts`, update the `SELECT` constant to include `scheduled_end_date`:

```ts
const SELECT = `
  id, scheduled_start, scheduled_end, scheduled_end_date, status, notes, location_override,
  customer:customers(id, name),
  boat:boats(id, name, make_model),
  marina:marinas(id, name),
  tech:profiles!assigned_to(id, full_name)
`;
```

And in `mapJobRowToCalendarJob`, add the field to the returned object (alphabetized near `scheduledEnd`):

```ts
return {
  id: row.id,
  scheduledStart: row.scheduled_start ?? null,
  scheduledEnd: row.scheduled_end ?? null,
  scheduledEndDate: row.scheduled_end_date ?? null,   // ← add this line
  status: row.status as JobStatus,
  // ... rest unchanged
```

- [ ] **Step 4: Mirror to web queries**

Apply the identical `SELECT` extension and mapper addition to `lib/calendar/queries.ts`.

- [ ] **Step 5: Type-check**

Run from repo root: `npx tsc --noEmit`
Expected: 0 errors. (The new field is `| null` so existing call sites that destructure `CalendarJob` keep working.)

Run from `mobile/`: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Run existing tests**

Run from repo root: `npm test -- --run`
Expected: all 20 existing unit tests pass (`__tests__/calendar/*.test.ts`).

- [ ] **Step 7: Commit + push**

```bash
git add mobile/lib/calendar/types.ts mobile/lib/calendar/queries.ts \
        lib/calendar/types.ts lib/calendar/queries.ts
git commit -m "feat(calendar): expose scheduled_end_date on CalendarJob

Migration 014 added jobs.scheduled_end_date for multi-day jobs but the
CalendarJob type and SELECT did not surface it. HourGrid needs this to
classify multi-day jobs and render the all-day strip."
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 2: Add `isMultiDay` to `format.ts` (TDD)

**Files:**
- Modify: `__tests__/calendar/format.test.ts`
- Modify: `lib/calendar/format.ts` (web)
- Modify: `mobile/lib/calendar/format.ts` (mirror)

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/calendar/format.test.ts`:

```ts
import { isMultiDay } from "@/lib/calendar/format";
import type { CalendarJob } from "@/lib/calendar/types";

const makeJob = (overrides: Partial<CalendarJob> = {}): CalendarJob => ({
  id: "j1",
  scheduledStart: "2026-03-04T10:00:00Z",
  scheduledEnd: "2026-03-04T11:00:00Z",
  scheduledEndDate: null,
  status: "new",
  notes: null,
  locationOverride: null,
  customer: null,
  boat: null,
  marina: null,
  tech: null,
  ...overrides,
});

describe("isMultiDay", () => {
  it("returns false when scheduledEndDate is null", () => {
    expect(isMultiDay(makeJob({ scheduledEndDate: null }))).toBe(false);
  });

  it("returns false when scheduledStart is null", () => {
    expect(isMultiDay(makeJob({ scheduledStart: null, scheduledEndDate: "2026-03-05" }))).toBe(false);
  });

  it("returns false when end date equals start date", () => {
    expect(
      isMultiDay(makeJob({ scheduledStart: "2026-03-04T10:00:00Z", scheduledEndDate: "2026-03-04" })),
    ).toBe(false);
  });

  it("returns true when end date is after start date", () => {
    expect(
      isMultiDay(makeJob({ scheduledStart: "2026-03-04T10:00:00Z", scheduledEndDate: "2026-03-06" })),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npm test -- --run __tests__/calendar/format.test.ts`
Expected: 4 new tests fail with `isMultiDay is not exported from @/lib/calendar/format`.

- [ ] **Step 3: Implement `isMultiDay` in web `format.ts`**

Append to `lib/calendar/format.ts`:

```ts
import type { CalendarJob } from "./types";

export function isMultiDay(job: CalendarJob): boolean {
  if (!job.scheduledStart || !job.scheduledEndDate) return false;
  const startDate = job.scheduledStart.slice(0, 10);
  return job.scheduledEndDate > startDate;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run __tests__/calendar/format.test.ts`
Expected: all `isMultiDay` tests pass; all existing tests still pass.

- [ ] **Step 5: Mirror to mobile**

Append the identical export (with its own `import type { CalendarJob } from "./types";` at top of file) to `mobile/lib/calendar/format.ts`.

- [ ] **Step 6: Type-check mobile**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit + push**

```bash
git add __tests__/calendar/format.test.ts lib/calendar/format.ts mobile/lib/calendar/format.ts
git commit -m "feat(calendar): add isMultiDay() helper to format.ts"
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 3: Add `dayOfN` to `format.ts` (TDD)

**Files:**
- Modify: `__tests__/calendar/format.test.ts`
- Modify: `lib/calendar/format.ts`
- Modify: `mobile/lib/calendar/format.ts`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/calendar/format.test.ts`:

```ts
import { dayOfN } from "@/lib/calendar/format";

describe("dayOfN", () => {
  it("returns 1/1 for a single-day job (defensive)", () => {
    expect(dayOfN("2026-03-04", "2026-03-04T10:00:00Z", "2026-03-04")).toEqual({ day: 1, total: 1 });
  });

  it("returns 1/3 on the start day of a three-day span", () => {
    expect(dayOfN("2026-03-04", "2026-03-04T10:00:00Z", "2026-03-06")).toEqual({ day: 1, total: 3 });
  });

  it("returns 2/3 on the middle day", () => {
    expect(dayOfN("2026-03-05", "2026-03-04T10:00:00Z", "2026-03-06")).toEqual({ day: 2, total: 3 });
  });

  it("returns 3/3 on the last day", () => {
    expect(dayOfN("2026-03-06", "2026-03-04T10:00:00Z", "2026-03-06")).toEqual({ day: 3, total: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run __tests__/calendar/format.test.ts`
Expected: 4 new tests fail with `dayOfN is not exported`.

- [ ] **Step 3: Implement in web `format.ts`**

Append:

```ts
import { differenceInCalendarDays, parseISO } from "date-fns";

export function dayOfN(
  selectedDate: string,         // 'yyyy-MM-dd' in local TZ
  startIso: string,             // full ISO from scheduled_start
  endDate: string,              // 'yyyy-MM-dd' from scheduled_end_date
): { day: number; total: number } {
  const startDate = startIso.slice(0, 10);
  const total = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
  const day   = differenceInCalendarDays(parseISO(selectedDate), parseISO(startDate)) + 1;
  return { day, total };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run __tests__/calendar/format.test.ts`
Expected: all pass.

- [ ] **Step 5: Mirror to mobile `format.ts`**

Append the identical export to `mobile/lib/calendar/format.ts` (date-fns is already in `mobile/package.json`).

- [ ] **Step 6: Type-check mobile**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit + push**

```bash
git add __tests__/calendar/format.test.ts lib/calendar/format.ts mobile/lib/calendar/format.ts
git commit -m "feat(calendar): add dayOfN() helper for multi-day Day-of-N badge"
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 4: Add `bucketJobsByHour` + `clampHourBucket` (TDD)

`bucketJobsByHour` groups single-day jobs into one of 16 buckets keyed by `(hour - 5)`, clamping out-of-range jobs to the nearest visible edge.

**Files:**
- Create: `__tests__/calendar/hour-grid.test.ts`
- Modify: `lib/calendar/format.ts`
- Modify: `mobile/lib/calendar/format.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/calendar/hour-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bucketJobsByHour, clampHourBucket } from "@/lib/calendar/format";
import type { CalendarJob } from "@/lib/calendar/types";

const baseJob: CalendarJob = {
  id: "j",
  scheduledStart: null,
  scheduledEnd: null,
  scheduledEndDate: null,
  status: "new",
  notes: null,
  locationOverride: null,
  customer: null,
  boat: null,
  marina: null,
  tech: null,
};

const withStart = (id: string, iso: string): CalendarJob => ({
  ...baseJob,
  id,
  scheduledStart: iso,
});

describe("clampHourBucket", () => {
  it("returns hour-5 for 9 AM", () => {
    expect(clampHourBucket(9)).toEqual({ bucket: 4, overflow: null });
  });
  it("returns 0 with under overflow for 4 AM", () => {
    expect(clampHourBucket(4)).toEqual({ bucket: 0, overflow: "before" });
  });
  it("returns 0 with under overflow for midnight", () => {
    expect(clampHourBucket(0)).toEqual({ bucket: 0, overflow: "before" });
  });
  it("returns 15 with after overflow for 9 PM", () => {
    expect(clampHourBucket(21)).toEqual({ bucket: 15, overflow: "after" });
  });
  it("returns 15 with after overflow for 11 PM", () => {
    expect(clampHourBucket(23)).toEqual({ bucket: 15, overflow: "after" });
  });
  it("returns 15 (no overflow) for 8 PM", () => {
    expect(clampHourBucket(20)).toEqual({ bucket: 15, overflow: null });
  });
});

describe("bucketJobsByHour", () => {
  it("returns 16 empty buckets when given no jobs", () => {
    const buckets = bucketJobsByHour([]);
    expect(buckets).toHaveLength(16);
    expect(buckets.every((b) => b.length === 0)).toBe(true);
  });

  it("groups jobs by start hour", () => {
    const a = withStart("a", "2026-05-27T09:00:00");
    const b = withStart("b", "2026-05-27T09:30:00");
    const c = withStart("c", "2026-05-27T15:00:00");
    const buckets = bucketJobsByHour([a, b, c]);
    expect(buckets[4]).toEqual([a, b]);   // 9 AM = bucket 4
    expect(buckets[10]).toEqual([c]);     // 3 PM = bucket 10
  });

  it("clamps a 4 AM job into bucket 0", () => {
    const j = withStart("j", "2026-05-27T04:00:00");
    const buckets = bucketJobsByHour([j]);
    expect(buckets[0]).toEqual([j]);
  });

  it("clamps a 10 PM job into bucket 15", () => {
    const j = withStart("j", "2026-05-27T22:00:00");
    const buckets = bucketJobsByHour([j]);
    expect(buckets[15]).toEqual([j]);
  });

  it("skips jobs without scheduledStart", () => {
    const j = { ...baseJob, id: "j" };
    expect(bucketJobsByHour([j])).toEqual(Array.from({ length: 16 }, () => []));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run __tests__/calendar/hour-grid.test.ts`
Expected: all 11 tests fail with `bucketJobsByHour is not exported` / `clampHourBucket is not exported`.

- [ ] **Step 3: Implement in web `format.ts`**

Append:

```ts
export type HourOverflow = "before" | "after" | null;

const HOUR_START = 5;   // 5 AM = bucket 0
const HOUR_END   = 20;  // 8 PM = bucket 15
const BUCKETS    = 16;  // (HOUR_END - HOUR_START + 1)

export function clampHourBucket(hour: number): { bucket: number; overflow: HourOverflow } {
  if (hour < HOUR_START) return { bucket: 0, overflow: "before" };
  if (hour > HOUR_END)   return { bucket: BUCKETS - 1, overflow: "after" };
  return { bucket: hour - HOUR_START, overflow: null };
}

export function bucketJobsByHour(jobs: CalendarJob[]): CalendarJob[][] {
  const buckets: CalendarJob[][] = Array.from({ length: BUCKETS }, () => []);
  for (const j of jobs) {
    if (!j.scheduledStart) continue;
    const hour = parseISO(j.scheduledStart).getHours();
    const { bucket } = clampHourBucket(hour);
    buckets[bucket].push(j);
  }
  return buckets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run __tests__/calendar/hour-grid.test.ts`
Expected: all 11 pass.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test -- --run`
Expected: all 31+ tests pass (original 20 + 4 isMultiDay + 4 dayOfN + 11 hour-grid).

- [ ] **Step 6: Mirror to mobile `format.ts`**

Append the identical exports plus the `import { parseISO } from "date-fns"` line (if not already present from Task 3) to `mobile/lib/calendar/format.ts`.

- [ ] **Step 7: Type-check mobile**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit + push**

```bash
git add __tests__/calendar/hour-grid.test.ts lib/calendar/format.ts mobile/lib/calendar/format.ts
git commit -m "feat(calendar): add bucketJobsByHour + clampHourBucket helpers

Pure functions that drive HourGrid's row-grouping. Jobs outside 5 AM-8 PM
clamp to the nearest visible edge with an overflow flag so the UI can
render a directional indicator."
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 5: Add customer + boat picker queries

These return location-scoped lists for `NewJobSheet`'s pickers. RLS already filters by `profiles.location_id` (migration 017), so no extra `.eq()` is needed.

**Files:**
- Modify: `mobile/lib/calendar/queries.ts`

- [ ] **Step 1: Add the helpers**

Append to `mobile/lib/calendar/queries.ts`:

```ts
// Customer + boat pickers for NewJobSheet. RLS filters customers to the
// caller's location (shop_read_customers, migration 017); we don't need
// to add .eq("location_id", ...) ourselves.

export type PickerCustomer = { id: string; name: string };
export type PickerBoat     = { id: string; name: string; makeModel: string | null };

export async function getCustomersForLocation(
  supabase: SupabaseClient,
): Promise<PickerCustomer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

export async function getBoatsForCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<PickerBoat[]> {
  const { data, error } = await supabase
    .from("boats")
    .select("id, name, make_model")
    .eq("customer_id", customerId)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    makeModel: b.make_model ?? null,
  }));
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit + push**

```bash
git add mobile/lib/calendar/queries.ts
git commit -m "feat(calendar): add picker queries for NewJobSheet

getCustomersForLocation returns RLS-scoped customers; getBoatsForCustomer
returns boats for a specific customer. Both used by the new-job creation
sheet."
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 6: Build `ViewToggle.tsx`

**Files:**
- Create: `mobile/components/calendar/ViewToggle.tsx`

- [ ] **Step 1: Write the component**

Create `mobile/components/calendar/ViewToggle.tsx`:

```tsx
import { View, Pressable, Text, StyleSheet } from "react-native";

export type CalendarPanelMode = "week" | "day";

type Props = {
  value: CalendarPanelMode;
  onChange: (mode: CalendarPanelMode) => void;
};

export function ViewToggle({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <ToggleButton
        label="Week"
        active={value === "week"}
        onPress={() => onChange("week")}
        testID="view-toggle-week"
      />
      <ToggleButton
        label="Day"
        active={value === "day"}
        onPress={() => onChange("day")}
        testID="view-toggle-day"
      />
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={[styles.label, active ? styles.active : styles.inactive]}>{label}</Text>
      {active && <View style={styles.underline} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    height: 36,
    backgroundColor: "#0d1320",
    borderBottomWidth: 1,
    borderBottomColor: "#1a2236",
  },
  button: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  pressed: { backgroundColor: "rgba(201,169,110,0.08)" },
  label: { fontSize: 13, fontWeight: "600" },
  active: { color: "#C9A96E" },
  inactive: { color: "#8892A5" },
  underline: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 2,
    backgroundColor: "#C9A96E",
  },
});
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit + push**

```bash
git add mobile/components/calendar/ViewToggle.tsx
git commit -m "feat(calendar): add ViewToggle for Week/Day switch"
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 7: Build `AllDayStrip.tsx`

**Files:**
- Create: `mobile/components/calendar/AllDayStrip.tsx`

- [ ] **Step 1: Write the component**

Create `mobile/components/calendar/AllDayStrip.tsx`:

```tsx
import { View, Text, StyleSheet, Pressable } from "react-native";
import type { CalendarJob } from "@/lib/calendar/types";
import { techColor, statusStripeColor } from "@/lib/calendar/colors";
import { dayOfN } from "@/lib/calendar/format";

type Props = {
  jobs: CalendarJob[];
  selectedDate: string;
  onSelectJob: (job: CalendarJob) => void;
  onScheduleJob: (job: CalendarJob) => void;
};

export function AllDayStrip({ jobs, selectedDate, onSelectJob, onScheduleJob }: Props) {
  if (jobs.length === 0) return null;
  return (
    <View style={styles.container} testID="all-day-strip">
      {jobs.map((j) => {
        const bg = j.tech ? techColor(j.tech.id) : "#3b6cd6";
        const stripe = statusStripeColor(j.status);
        const { day, total } = dayOfN(
          selectedDate,
          j.scheduledStart!,
          j.scheduledEndDate!,
        );
        const subtitle = j.boat?.name ?? "Boat";
        return (
          <Pressable
            key={j.id}
            onPress={() => onSelectJob(j)}
            onLongPress={() => onScheduleJob(j)}
            delayLongPress={500}
            style={[styles.chip, { backgroundColor: bg, borderLeftColor: stripe }]}
            testID={`all-day-chip-${j.id}`}
          >
            <Text style={styles.title} numberOfLines={1}>
              🛠 {j.customer?.name ?? "Customer"} · {subtitle}
            </Text>
            <Text style={styles.badge}>DAY {day}/{total}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0d1320",
    borderBottomWidth: 1,
    borderBottomColor: "#1a2236",
    padding: 6,
    gap: 4,
  },
  chip: {
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#fff", fontSize: 11, flex: 1, marginRight: 8 },
  badge: { color: "#fff", fontSize: 9, opacity: 0.75 },
});
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit + push**

```bash
git add mobile/components/calendar/AllDayStrip.tsx
git commit -m "feat(calendar): add AllDayStrip for multi-day jobs"
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 8: Build `HourGrid.tsx` (rows + lanes + empty state)

This task delivers the grid without the now-line or auto-scroll. Those are added in Task 9 so the diff stays reviewable.

**Files:**
- Create: `mobile/components/calendar/HourGrid.tsx`

- [ ] **Step 1: Write the component**

Create `mobile/components/calendar/HourGrid.tsx`:

```tsx
import { useMemo } from "react";
import { ScrollView, View, Text, StyleSheet, Pressable } from "react-native";
import type { CalendarJob } from "@/lib/calendar/types";
import { techColor, statusStripeColor } from "@/lib/calendar/colors";
import {
  isMultiDay,
  bucketJobsByHour,
  formatTime,
  formatTimeRange,
} from "@/lib/calendar/format";
import { AllDayStrip } from "./AllDayStrip";

const HOUR_START = 5;       // 5 AM
const HOUR_END   = 20;      // 8 PM (16 rows: 5..20)
const HOUR_HEIGHT = 60;
const LANE_HEIGHT = 28;

type Props = {
  jobs: CalendarJob[];
  selectedDate: string;     // 'yyyy-MM-dd'
  onSelectJob: (job: CalendarJob) => void;
  onScheduleJob: (job: CalendarJob) => void;
  onTapEmptySlot: (isoTimestamp: string) => void;
};

export function HourGrid({
  jobs,
  selectedDate,
  onSelectJob,
  onScheduleJob,
  onTapEmptySlot,
}: Props) {
  const { singleDayJobs, multiDayJobs } = useMemo(() => {
    const single: CalendarJob[] = [];
    const multi: CalendarJob[]  = [];
    for (const j of jobs) {
      if (!j.scheduledStart) continue;
      if (isMultiDay(j)) {
        // include only if selectedDate is within the span
        const startDate = j.scheduledStart.slice(0, 10);
        if (selectedDate >= startDate && selectedDate <= j.scheduledEndDate!) {
          multi.push(j);
        }
        continue;
      }
      if (j.scheduledStart.slice(0, 10) === selectedDate) single.push(j);
    }
    return { singleDayJobs: single, multiDayJobs: multi };
  }, [jobs, selectedDate]);

  const buckets = useMemo(() => bucketJobsByHour(singleDayJobs), [singleDayJobs]);
  const hasAnyJobs = singleDayJobs.length > 0 || multiDayJobs.length > 0;

  return (
    <View style={styles.container} testID="hour-grid">
      <AllDayStrip
        jobs={multiDayJobs}
        selectedDate={selectedDate}
        onSelectJob={onSelectJob}
        onScheduleJob={onScheduleJob}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {buckets.map((rowJobs, idx) => {
          const hour = HOUR_START + idx;
          const rowHeight = Math.max(HOUR_HEIGHT, rowJobs.length * LANE_HEIGHT + 8);
          return (
            <View key={hour} style={[styles.row, { minHeight: rowHeight }]}>
              <View style={styles.labelCell}>
                <Text style={styles.label}>{formatHourLabel(hour)}</Text>
              </View>
              <View style={styles.slot}>
                {rowJobs.length === 0 ? (
                  <Pressable
                    style={styles.emptySlot}
                    onPress={() =>
                      onTapEmptySlot(buildIsoSlot(selectedDate, hour))
                    }
                    testID={`empty-slot-${hour}`}
                  />
                ) : (
                  rowJobs.map((j) => (
                    <JobLane
                      key={j.id}
                      job={j}
                      onPress={() => onSelectJob(j)}
                      onLongPress={() => onScheduleJob(j)}
                    />
                  ))
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      {!hasAnyJobs && (
        <View pointerEvents="none" style={styles.emptyOverlay}>
          <Text style={styles.emptyTitle}>No jobs scheduled</Text>
          <Text style={styles.emptyHint}>Tap any hour to schedule</Text>
        </View>
      )}
    </View>
  );
}

function JobLane({
  job,
  onPress,
  onLongPress,
}: {
  job: CalendarJob;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const bg     = job.tech ? techColor(job.tech.id) : "#3b6cd6";
  const stripe = statusStripeColor(job.status);
  const range  = formatTimeRange(job.scheduledStart, job.scheduledEnd);
  const cust   = job.customer?.name ?? "Customer";
  const boat   = job.boat?.name ?? "Boat";
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      style={[styles.lane, { backgroundColor: bg, borderLeftColor: stripe }]}
      testID={`hour-grid-chip-${job.id}`}
    >
      <Text style={styles.laneText} numberOfLines={1}>
        {range} · {cust} · {boat}
      </Text>
    </Pressable>
  );
}

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h} ${period}`;
}

function buildIsoSlot(selectedDate: string, hour: number): string {
  // local-time slot at the hour boundary; downstream code interprets in device TZ
  const hh = hour.toString().padStart(2, "0");
  return `${selectedDate}T${hh}:00:00`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a12" },
  scroll: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#1a2236",
  },
  labelCell: {
    width: 44,
    paddingTop: 4,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: "#1a2236",
  },
  label: { color: "#8892A5", fontSize: 11, textAlign: "right" },
  slot: { flex: 1, padding: 4, gap: 4 },
  emptySlot: { flex: 1, minHeight: 50 },
  lane: {
    height: 24,
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: "center",
  },
  laneText: { color: "#fff", fontSize: 11, fontWeight: "500" },
  emptyOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: { color: "#8892A5", fontSize: 16, fontWeight: "500" },
  emptyHint: { color: "#8892A5", fontSize: 12, opacity: 0.8, marginTop: 4 },
});
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit + push**

```bash
git add mobile/components/calendar/HourGrid.tsx
git commit -m "feat(calendar): add HourGrid base — rows, lanes, empty state

5 AM through 8 PM (16 rows). Jobs bucketed by start hour; overlap renders
as horizontal lanes that grow the row height. Multi-day jobs pin in
AllDayStrip via isMultiDay(). Tap empty slot fires onTapEmptySlot with an
ISO timestamp at the hour boundary."
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 9: Add now-line + auto-scroll to `HourGrid`

**Files:**
- Modify: `mobile/components/calendar/HourGrid.tsx`

- [ ] **Step 1: Add now-line state + refs at top of component**

After the `useMemo` calls in `HourGrid`, add:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";

// ... inside HourGrid, after existing useMemo blocks:

const scrollRef = useRef<ScrollView>(null);
const [nowMinutes, setNowMinutes] = useState(() => minutesSinceStart(new Date()));
const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
const isToday = selectedDate === today;

// Tick the now-line every minute while mounted
useEffect(() => {
  if (!isToday) return;
  const id = setInterval(() => setNowMinutes(minutesSinceStart(new Date())), 60_000);
  return () => clearInterval(id);
}, [isToday]);

// Auto-scroll on first mount + on selectedDate change
useEffect(() => {
  const targetY = isToday
    ? Math.max(0, (nowMinutes / 60) * HOUR_HEIGHT - 100)
    : (8 - HOUR_START) * HOUR_HEIGHT;      // 8 AM near top on other days
  // RN ScrollView measures after layout; defer to next tick
  requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: targetY, animated: false }));
  // Intentionally NOT depending on nowMinutes — auto-scroll only on date change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedDate]);
```

Also add the helper function (outside the component, near `formatHourLabel`):

```ts
function minutesSinceStart(now: Date): number {
  // Minutes since HOUR_START (5 AM) — negative if before 5 AM.
  return (now.getHours() - HOUR_START) * 60 + now.getMinutes();
}
```

- [ ] **Step 2: Attach the ref to the ScrollView**

Change:

```tsx
<ScrollView contentContainerStyle={styles.scroll}>
```

to:

```tsx
<ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
```

- [ ] **Step 3: Render the now-line absolutely positioned inside the ScrollView**

After the `{buckets.map(...)}` block but still inside the `<ScrollView>`, add:

```tsx
{isToday && nowMinutes >= 0 && nowMinutes <= (HOUR_END - HOUR_START + 1) * 60 && (
  <View
    pointerEvents="none"
    style={[
      styles.nowLine,
      { top: (nowMinutes / 60) * HOUR_HEIGHT },
    ]}
  >
    <View style={styles.nowDot} />
  </View>
)}
```

- [ ] **Step 4: Add the now-line styles**

Append to the `StyleSheet.create` block:

```ts
nowLine: {
  position: "absolute",
  left: 44,
  right: 0,
  height: 1,
  backgroundColor: "#ef4444",
  zIndex: 5,
},
nowDot: {
  position: "absolute",
  left: -4,
  top: -3,
  width: 7,
  height: 7,
  borderRadius: 3.5,
  backgroundColor: "#ef4444",
},
```

- [ ] **Step 5: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit + push**

```bash
git add mobile/components/calendar/HourGrid.tsx
git commit -m "feat(calendar): add now-line and auto-scroll to HourGrid

Today gets a red current-time line that ticks every minute; other days
auto-scroll to 8 AM. Switching days re-anchors scroll position."
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 10: Scaffold `NewJobSheet.tsx` (sheet plumbing + schedule row)

This task delivers the sheet structure, ref handle, date/time/duration row, and a disabled Schedule button. Pickers and mutation come in Tasks 11–12.

**Files:**
- Create: `mobile/components/calendar/NewJobSheet.tsx`

- [ ] **Step 1: Write the scaffold**

Create `mobile/components/calendar/NewJobSheet.tsx`:

```tsx
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { addHours, parseISO, format as fmtDate } from "date-fns";
import { formatTime } from "@/lib/calendar/format";

const DURATIONS_HOURS: { label: string; hours: number }[] = [
  { label: "30m", hours: 0.5 },
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "3h", hours: 3 },
  { label: "4h", hours: 4 },
];

export type NewJobSheetHandle = {
  present: (initialStartIso: string) => void;
  dismiss: () => void;
};

type Props = {
  onCreated?: () => void;
};

export const NewJobSheet = forwardRef<NewJobSheetHandle, Props>(
  function NewJobSheet({ onCreated: _ }, ref) {
    const sheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ["50%", "90%"], []);

    const [startIso, setStartIso] = useState<string | null>(null);
    const [durationHours, setDurationHours] = useState<number>(1);
    const [showTimePicker, setShowTimePicker] = useState(false);

    useImperativeHandle(ref, () => ({
      present: (initial) => {
        setStartIso(initial);
        setDurationHours(1);
        sheetRef.current?.snapToIndex(0);
      },
      dismiss: () => sheetRef.current?.close(),
    }));

    const startDate  = startIso ? parseISO(startIso) : null;
    const endDate    = startDate ? addHours(startDate, durationHours) : null;
    const crossesMidnight = (h: number): boolean => {
      if (!startDate) return false;
      const tentativeEnd = addHours(startDate, h);
      return tentativeEnd.getDate() !== startDate.getDate();
    };

    return (
      <BottomSheet
        ref={sheetRef}
        snapPoints={snapPoints}
        index={-1}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#0d1320" }}
        handleIndicatorStyle={{ backgroundColor: "#8892A5" }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.body}>
          <Text style={styles.heading}>Schedule a job</Text>

          {/* Schedule row */}
          <Text style={styles.label}>WHEN</Text>
          <View style={styles.scheduleRow}>
            <Text style={styles.dateText}>
              {startDate ? fmtDate(startDate, "EEE, MMM d") : "—"}
            </Text>
            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={styles.timeButton}
              testID="new-job-time"
            >
              <Text style={styles.timeText}>
                {startDate ? formatTime(startDate) : "—"}
              </Text>
            </Pressable>
          </View>

          {/* Duration chips */}
          <Text style={styles.label}>DURATION</Text>
          <View style={styles.chipRow}>
            {DURATIONS_HOURS.map((d) => {
              const disabled = crossesMidnight(d.hours);
              const selected = durationHours === d.hours;
              return (
                <Pressable
                  key={d.label}
                  disabled={disabled}
                  onPress={() => setDurationHours(d.hours)}
                  style={[
                    styles.chip,
                    selected && styles.chipSelected,
                    disabled && styles.chipDisabled,
                  ]}
                  testID={`new-job-duration-${d.label}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {endDate && (
            <Text style={styles.subhint}>
              Ends at {formatTime(endDate)}
            </Text>
          )}

          {/* Customer + boat pickers (added in Task 11) */}
          {/* Sticky footer (added in Task 12) */}
        </BottomSheetScrollView>

        {showTimePicker && startDate && (
          <DateTimePicker
            value={startDate}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_event, selected) => {
              setShowTimePicker(Platform.OS === "ios");
              if (selected) {
                setStartIso(selected.toISOString());
              }
            }}
          />
        )}
      </BottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 80 },
  heading: { color: "#f1f5f9", fontSize: 18, fontWeight: "600", marginBottom: 16 },
  label: {
    color: "#8892A5",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1a2236",
    paddingBottom: 8,
  },
  dateText: { color: "#f1f5f9", fontSize: 15 },
  timeButton: { padding: 4 },
  timeText: { color: "#C9A96E", fontSize: 15, fontWeight: "600" },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  chip: {
    height: 36,
    minWidth: 56,
    backgroundColor: "#1a2236",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  chipSelected: { backgroundColor: "#C9A96E" },
  chipDisabled: { opacity: 0.3 },
  chipText: { color: "#f1f5f9", fontSize: 13, fontWeight: "500" },
  chipTextSelected: { color: "#060a12", fontWeight: "700" },
  subhint: { color: "#8892A5", fontSize: 11, marginTop: 6 },
});
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit + push**

```bash
git add mobile/components/calendar/NewJobSheet.tsx
git commit -m "feat(calendar): NewJobSheet scaffold with schedule row + duration"
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 11: Add customer + boat pickers to `NewJobSheet`

**Files:**
- Modify: `mobile/components/calendar/NewJobSheet.tsx`

- [ ] **Step 1: Wire React Query + state**

Add imports at the top of `NewJobSheet.tsx`:

```tsx
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator } from "react-native";
import { supabase } from "@/lib/supabase";
import {
  getCustomersForLocation,
  getBoatsForCustomer,
  type PickerCustomer,
  type PickerBoat,
} from "@/lib/calendar/queries";
```

Inside the component body, add state below `durationHours`:

```tsx
const [customerId, setCustomerId] = useState<string | null>(null);
const [boatId, setBoatId] = useState<string | null>(null);
const [showCustomerPicker, setShowCustomerPicker] = useState(false);
const [showBoatPicker, setShowBoatPicker] = useState(false);

const customersQuery = useQuery({
  queryKey: ["picker-customers"],
  queryFn: () => getCustomersForLocation(supabase),
  staleTime: 60_000,
});

const boatsQuery = useQuery({
  queryKey: ["picker-boats", customerId],
  queryFn: () => getBoatsForCustomer(supabase, customerId!),
  enabled: customerId != null,
  staleTime: 60_000,
});

const selectedCustomer = customersQuery.data?.find((c) => c.id === customerId) ?? null;
const selectedBoat     = boatsQuery.data?.find((b) => b.id === boatId) ?? null;

// Reset boat when customer changes; auto-select the only boat if just one
useEffect(() => {
  setBoatId(null);
}, [customerId]);

useEffect(() => {
  if (boatsQuery.data && boatsQuery.data.length === 1) {
    setBoatId(boatsQuery.data[0].id);
  }
}, [boatsQuery.data]);
```

Inside `present` (in `useImperativeHandle`), reset the picker state so a re-open is clean:

```tsx
present: (initial) => {
  setStartIso(initial);
  setDurationHours(1);
  setCustomerId(null);
  setBoatId(null);
  setShowCustomerPicker(false);
  setShowBoatPicker(false);
  sheetRef.current?.snapToIndex(0);
},
```

- [ ] **Step 2: Render the picker rows**

After the `Ends at {formatTime(endDate)}` line in the JSX, add:

```tsx
{/* Customer picker */}
<Text style={styles.label}>CUSTOMER</Text>
<Pressable
  onPress={() => setShowCustomerPicker((v) => !v)}
  style={styles.pickerRow}
  testID="new-job-customer"
>
  <Text style={styles.pickerValue}>
    {selectedCustomer ? selectedCustomer.name : "Tap to choose"}
  </Text>
  <Text style={styles.pickerChevron}>{showCustomerPicker ? "▴" : "▾"}</Text>
</Pressable>
{showCustomerPicker && (
  <View style={styles.pickerList}>
    {customersQuery.isLoading && (
      <ActivityIndicator color="#C9A96E" style={{ padding: 12 }} />
    )}
    {customersQuery.data?.map((c) => (
      <Pressable
        key={c.id}
        onPress={() => {
          setCustomerId(c.id);
          setShowCustomerPicker(false);
        }}
        style={styles.pickerItem}
        testID={`customer-${c.id}`}
      >
        <Text style={styles.pickerItemText}>{c.name}</Text>
      </Pressable>
    ))}
    {customersQuery.data?.length === 0 && (
      <Text style={styles.pickerEmpty}>No customers in your location yet</Text>
    )}
  </View>
)}

{/* Boat picker */}
<Text style={styles.label}>BOAT</Text>
<Pressable
  onPress={() => customerId && setShowBoatPicker((v) => !v)}
  style={[styles.pickerRow, !customerId && styles.pickerRowDisabled]}
  testID="new-job-boat"
>
  <Text style={styles.pickerValue}>
    {selectedBoat
      ? `${selectedBoat.name}${selectedBoat.makeModel ? ` · ${selectedBoat.makeModel}` : ""}`
      : customerId
        ? "Tap to choose"
        : "Pick a customer first"}
  </Text>
  <Text style={styles.pickerChevron}>{showBoatPicker ? "▴" : "▾"}</Text>
</Pressable>
{showBoatPicker && customerId && (
  <View style={styles.pickerList}>
    {boatsQuery.isLoading && (
      <ActivityIndicator color="#C9A96E" style={{ padding: 12 }} />
    )}
    {boatsQuery.data?.map((b) => (
      <Pressable
        key={b.id}
        onPress={() => {
          setBoatId(b.id);
          setShowBoatPicker(false);
        }}
        style={styles.pickerItem}
        testID={`boat-${b.id}`}
      >
        <Text style={styles.pickerItemText}>
          {b.name}{b.makeModel ? ` · ${b.makeModel}` : ""}
        </Text>
      </Pressable>
    ))}
    {boatsQuery.data?.length === 0 && (
      <Text style={styles.pickerEmpty}>No boats on this customer</Text>
    )}
  </View>
)}
```

- [ ] **Step 3: Add picker styles to the `StyleSheet.create` block**

Append:

```ts
pickerRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottomWidth: 1,
  borderBottomColor: "#1a2236",
  paddingVertical: 10,
},
pickerRowDisabled: { opacity: 0.5 },
pickerValue: { color: "#f1f5f9", fontSize: 15, flex: 1, marginRight: 8 },
pickerChevron: { color: "#8892A5", fontSize: 12 },
pickerList: {
  marginTop: 4,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: "#1a2236",
  borderRadius: 6,
  maxHeight: 200,
  backgroundColor: "#060a12",
},
pickerItem: {
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderBottomWidth: 1,
  borderBottomColor: "#1a2236",
},
pickerItemText: { color: "#f1f5f9", fontSize: 14 },
pickerEmpty: { color: "#8892A5", fontSize: 12, padding: 12, fontStyle: "italic" },
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit + push**

```bash
git add mobile/components/calendar/NewJobSheet.tsx
git commit -m "feat(calendar): NewJobSheet customer + boat pickers

Cached via React Query; boat picker disabled until customer chosen.
Auto-selects boat when customer has exactly one."
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 12: Wire `createJob` mutation + sticky footer in `NewJobSheet`

**Files:**
- Modify: `mobile/components/calendar/NewJobSheet.tsx`

- [ ] **Step 1: Add imports for the mutation**

At the top of the file, extend imports:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { createJob } from "@/lib/calendar/queries";
```

> **Note:** verify `useAuth` exists at `@/lib/auth-context` (it should per CLAUDE.md). If the actual hook name differs, use whatever the project exposes (`useAuthContext`, etc.) — read `mobile/lib/auth-context.tsx` to confirm.

- [ ] **Step 2: Add mutation + canSubmit derivation**

Inside the component, below the existing queries:

```tsx
const queryClient = useQueryClient();
const { profile } = useAuth();

const createMutation = useMutation({
  mutationFn: async () => {
    if (!startIso || !customerId || !boatId) {
      throw new Error("Missing required fields");
    }
    const start = parseISO(startIso);
    const end   = addHours(start, durationHours);
    return createJob(supabase, {
      customerId,
      boatId,
      assignedTo: profile?.id ?? null,
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
    });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["calendar-mobile"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-mobile-unscheduled"] });
    sheetRef.current?.close();
  },
  onError: (err: Error) => {
    Alert.alert("Couldn't schedule", err.message);
  },
});

const canSubmit = !!(startIso && customerId && boatId) && !createMutation.isPending;
```

- [ ] **Step 3: Render the sticky footer**

After the `BottomSheetScrollView` closing tag (but still inside the `<BottomSheet>`), add:

```tsx
<View style={styles.footer}>
  <Pressable
    onPress={() => sheetRef.current?.close()}
    style={styles.cancelBtn}
    testID="new-job-cancel"
  >
    <Text style={styles.cancelText}>Cancel</Text>
  </Pressable>
  <Pressable
    disabled={!canSubmit}
    onPress={() => createMutation.mutate()}
    style={[styles.scheduleBtn, !canSubmit && styles.scheduleBtnDisabled]}
    testID="new-job-schedule"
  >
    {createMutation.isPending ? (
      <ActivityIndicator color="#060a12" />
    ) : (
      <Text style={styles.scheduleText}>Schedule</Text>
    )}
  </Pressable>
</View>
```

- [ ] **Step 4: Add footer styles**

Append to the `StyleSheet.create` block:

```ts
footer: {
  flexDirection: "row",
  gap: 12,
  paddingHorizontal: 20,
  paddingVertical: 12,
  borderTopWidth: 1,
  borderTopColor: "#1a2236",
  backgroundColor: "#0d1320",
},
cancelBtn: { paddingHorizontal: 18, justifyContent: "center" },
cancelText: { color: "#8892A5", fontSize: 14, fontWeight: "500" },
scheduleBtn: {
  flex: 1,
  height: 48,
  backgroundColor: "#C9A96E",
  borderRadius: 8,
  justifyContent: "center",
  alignItems: "center",
},
scheduleBtnDisabled: { opacity: 0.4 },
scheduleText: { color: "#060a12", fontSize: 15, fontWeight: "700" },
```

- [ ] **Step 5: Notify parent on success**

Inside the `onSuccess` handler, also call the optional `onCreated` prop. Replace the existing `onSuccess`:

```tsx
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["calendar-mobile"] });
  queryClient.invalidateQueries({ queryKey: ["calendar-mobile-unscheduled"] });
  sheetRef.current?.close();
  // call optional parent hook
  // (rename the destructured `_` in the props signature back to `onCreated`)
},
```

Update the function signature `function NewJobSheet({ onCreated: _ }, ref)` to `function NewJobSheet({ onCreated }, ref)` and replace the placeholder call:

```tsx
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["calendar-mobile"] });
  queryClient.invalidateQueries({ queryKey: ["calendar-mobile-unscheduled"] });
  sheetRef.current?.close();
  onCreated?.();
},
```

- [ ] **Step 6: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit + push**

```bash
git add mobile/components/calendar/NewJobSheet.tsx
git commit -m "feat(calendar): wire createJob mutation + sticky footer in NewJobSheet

Matches ScheduleSheet's pattern: Alert on error, callback on success,
parent invalidates queries. Disabled until customer + boat chosen."
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 13: Integrate into `calendar.tsx`

**Files:**
- Modify: `mobile/app/(tabs)/calendar.tsx`

- [ ] **Step 1: Add imports**

At the top of `calendar.tsx`, add:

```tsx
import { ViewToggle, type CalendarPanelMode } from "@/components/calendar/ViewToggle";
import { HourGrid } from "@/components/calendar/HourGrid";
import { NewJobSheet, NewJobSheetHandle } from "@/components/calendar/NewJobSheet";
```

- [ ] **Step 2: Add the view-mode state + ref**

Inside `CalendarScreen`, alongside the existing `useState`s, add:

```tsx
const [viewMode, setViewMode] = useState<CalendarPanelMode>("week");
const newJobSheetRef = useRef<NewJobSheetHandle>(null);
```

- [ ] **Step 3: Render `ViewToggle` between MonthCalendar and the loading/panel block**

Between `<MonthCalendar ... />` and the loading conditional, insert:

```tsx
<ViewToggle value={viewMode} onChange={setViewMode} />
```

- [ ] **Step 4: Branch panel rendering on `viewMode`**

Replace the existing post-loading block:

```tsx
{jobsQuery.isLoading ? (
  <View style={styles.center}>
    <ActivityIndicator color={colors.gold} />
  </View>
) : (
  <WeeklyJobsPanel
    scheduledJobs={jobsQuery.data ?? []}
    unscheduledJobs={unscheduledQuery.data ?? []}
    weekOf={parseISO(selectedDate)}
    onSelectJob={(j) => sheetRef.current?.present(j)}
    onScheduleJob={(j) =>
      scheduleSheetRef.current?.present({
        id: j.id,
        customerName: j.customer?.name ?? "Unassigned",
        boatName: j.boat?.name ?? null,
        currentScheduledStart: j.scheduledStart,
        currentLocation: j.locationOverride ?? j.marina?.name ?? null,
      })
    }
  />
)}
```

with:

```tsx
{jobsQuery.isLoading ? (
  <View style={styles.center}>
    <ActivityIndicator color={colors.gold} />
  </View>
) : viewMode === "week" ? (
  <WeeklyJobsPanel
    scheduledJobs={jobsQuery.data ?? []}
    unscheduledJobs={unscheduledQuery.data ?? []}
    weekOf={parseISO(selectedDate)}
    onSelectJob={(j) => sheetRef.current?.present(j)}
    onScheduleJob={(j) =>
      scheduleSheetRef.current?.present({
        id: j.id,
        customerName: j.customer?.name ?? "Unassigned",
        boatName: j.boat?.name ?? null,
        currentScheduledStart: j.scheduledStart,
        currentLocation: j.locationOverride ?? j.marina?.name ?? null,
      })
    }
  />
) : (
  <HourGrid
    jobs={jobsQuery.data ?? []}
    selectedDate={selectedDate}
    onSelectJob={(j) => sheetRef.current?.present(j)}
    onScheduleJob={(j) =>
      scheduleSheetRef.current?.present({
        id: j.id,
        customerName: j.customer?.name ?? "Unassigned",
        boatName: j.boat?.name ?? null,
        currentScheduledStart: j.scheduledStart,
        currentLocation: j.locationOverride ?? j.marina?.name ?? null,
      })
    }
    onTapEmptySlot={(iso) => newJobSheetRef.current?.present(iso)}
  />
)}
```

- [ ] **Step 5: Mount the `NewJobSheet` ref next to `ScheduleSheet`**

After `<ScheduleSheet ... />`, add:

```tsx
<NewJobSheet
  ref={newJobSheetRef}
  onCreated={() => {
    queryClient.invalidateQueries({ queryKey: ["calendar-mobile"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-mobile-unscheduled"] });
  }}
/>
```

- [ ] **Step 6: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Visual smoke in simulator**

Run from `mobile/`: `npm run ios`
Open the app, log in as `appreview@grayyachts.com` / `ReviewMarine2026!` (reviewer demo account), tap the Calendar tab.

Expected:
- ViewToggle visible between MonthCalendar and the bottom panel
- Default `Week` mode shows `WeeklyJobsPanel` unchanged
- Tap `Day` → HourGrid renders with hour rows 5 AM – 8 PM
- Tap an empty hour → NewJobSheet opens with that hour pre-filled
- Tap `Week` again → back to WeeklyJobsPanel; no errors

If anything looks off, fix inline before committing.

- [ ] **Step 8: Commit + push**

```bash
git add mobile/app/\(tabs\)/calendar.tsx
git commit -m "feat(calendar): wire ViewToggle, HourGrid, NewJobSheet into Calendar tab

Default mode = Week (unchanged behavior). Day mode renders HourGrid for
the selected date with tap-empty-slot to open NewJobSheet."
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 14: Extend Maestro flow

**Files:**
- Modify: `mobile/.maestro/calendar.yaml`

- [ ] **Step 1: Replace the existing flow with the extended version**

Overwrite `mobile/.maestro/calendar.yaml` with:

```yaml
appId: com.grayyachts.marinetech
---
- launchApp
- tapOn: "Calendar"
- assertVisible: "Calendar"
- assertVisible:
    id: "calendar-screen"
    optional: true

# Day view + HourGrid
- tapOn:
    id: "view-toggle-day"
- assertVisible:
    id: "hour-grid"

# Empty-slot tap opens NewJobSheet
- tapOn:
    id: "empty-slot-9"
- assertVisible:
    id: "new-job-customer"
- assertVisible:
    id: "new-job-schedule"

# Dismiss without saving
- tapOn:
    id: "new-job-cancel"
- assertNotVisible:
    id: "new-job-customer"

# Back to Week
- tapOn:
    id: "view-toggle-week"

- back
```

> **Note:** the `empty-slot-9` testID corresponds to the 9 AM row (hour `9`, not bucket index). If the simulator has any job scheduled at 9 AM, switch to a slot that's reliably empty (e.g. `empty-slot-13` for 1 PM) and update this comment.

- [ ] **Step 2: Run Maestro (manual — requires the simulator to be running)**

Run from repo root (Maestro installed per CLAUDE.md):

```
maestro test mobile/.maestro/calendar.yaml
```

Expected: PASS. If the empty-slot assertion fails because the chosen hour has jobs, swap to a known-empty hour.

- [ ] **Step 3: Commit + push**

```bash
git add mobile/.maestro/calendar.yaml
git commit -m "test(mobile): extend Maestro flow for Day view + NewJobSheet"
git push origin feat/calendar-hourgrid-newjobsheet
```

---

## Task 15: Manual smoke pass

**Files:** none (verification only)

Run from `mobile/`: `npm run ios` and sign in as the reviewer demo account.

- [ ] **Step 1: Empty day**

Pick a date in the future with no jobs → tap Day. Expected: empty-state text "No jobs scheduled / Tap any hour to schedule" centered; hour rows still tappable.

- [ ] **Step 2: Single-job mid-morning**

Schedule a single job at 10 AM via NewJobSheet → confirm it appears in the 10 AM row with the correct customer, boat, status stripe, and tech color. Auto-scroll should land near 8 AM when re-entering Day on a non-today date; when on today, near the now-line.

- [ ] **Step 3: Overlap stress**

Schedule 6 jobs at 10 AM same day (use the web admin if mobile is too slow to script). Expected: the 10 AM row grows to ~180 px (6 × 28 + 8 padding). Each lane legible.

- [ ] **Step 4: Multi-day**

Via the web admin, create a job from Mon → Wed (set `scheduled_end_date = Wed`). Open Day view for each of Mon, Tue, Wed. Expected: all three days show the same chip in the AllDayStrip; badges read `DAY 1/3`, `DAY 2/3`, `DAY 3/3`. Hour grid below stays clean.

- [ ] **Step 5: Now-line**

Open Day view on today during normal work hours. Expected: a thin red line + dot at the current hour. Wait 60+ seconds → line position updates. Switch to a different day → line disappears.

- [ ] **Step 6: DST**

Set the device clock to March 8, 2026 (spring forward) and again to November 1, 2026 (fall back). Verify hour rows still align — `5 AM` row really starts at 5 AM local time on both sides of DST, and the now-line position computed off `getHours/getMinutes` is correct.

- [ ] **Step 7: Offline**

Toggle Airplane Mode → schedule a job from NewJobSheet. Expected: mutation queues via existing `useOffline`, sheet dismisses, chip appears in HourGrid (from optimistic cache or the next sync). Existing global "Last synced X ago" indicator should appear.

- [ ] **Step 8: iPhone SE**

In Xcode simulator picker → iPhone SE (3rd gen). Verify chips still render readably; no horizontal overflow; picker rows fit.

- [ ] **Step 9: Open PR**

After all smoke checks pass:

```bash
gh pr create \
  --base main \
  --head feat/calendar-hourgrid-newjobsheet \
  --title "feat(calendar): mobile Day view (HourGrid) + NewJobSheet" \
  --body "Implements docs/superpowers/specs/2026-05-27-hourgrid-newjobsheet-design.md and docs/superpowers/plans/2026-05-27-hourgrid-newjobsheet.md.

## What
- Week ⇄ Day segmented control under MonthCalendar
- HourGrid (5 AM – 8 PM, 16 rows, hour-bucketed lanes that grow with overlap)
- AllDayStrip with DAY-of-N badges for multi-day jobs (uses jobs.scheduled_end_date from migration 014)
- NewJobSheet bottom sheet: customer + boat + duration → createJob
- Realtime + offline behavior inherited from existing patterns

## Tests
- 4 isMultiDay cases + 4 dayOfN cases + 11 hour-grid bucketing cases (Vitest, all green)
- Maestro flow extended: Day toggle → empty-slot tap → NewJobSheet present/dismiss → back to Week

## Smoke pass
Empty day · single-job mid-morning · 6-job overlap · multi-day (3 days) · now-line ticks · DST forward + back · offline queueing · iPhone SE layout — all manually verified.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR URL printed.

---

## Self-Review

**Spec coverage check:**

- ✅ ViewToggle Week/Day → Task 6 + 13
- ✅ HourGrid 5 AM – 8 PM, 16 rows → Task 8
- ✅ Hour-bucketed lanes growing rows → Task 8
- ✅ AllDayStrip with DAY-of-N → Task 7 + 13
- ✅ Multi-day classification (`isMultiDay`, `dayOfN`) → Tasks 2 + 3
- ✅ `bucketJobsByHour` + clamp → Task 4
- ✅ NewJobSheet scaffold → Task 10
- ✅ Customer + boat pickers → Task 11
- ✅ createJob mutation + Alert error + onCreated callback → Task 12
- ✅ `scheduled_end_date` exposed on type + SELECT → Task 1
- ✅ Now-line + auto-scroll → Task 9
- ✅ calendar.tsx integration → Task 13
- ✅ Maestro flow extension → Task 14
- ✅ Unit tests for pure functions → Tasks 2–4
- ✅ Manual smoke pass per spec list → Task 15

**Spec items intentionally NOT in plan** (matches spec "Out of Scope"):
- Pinch-to-zoom — explicitly deferred
- Drag-to-reschedule — explicitly deferred
- Multi-day from NewJobSheet — `chipDisabled` prevents it; documented
- Realtime polling fallback — out of scope per spec
- Tech filter — moot on mobile
- Web HourGrid/NewJobSheet — out of scope (web has it via react-big-calendar)
- Optional fields expander (service types / location override / notes) — the spec lists these as optional under a "+ Add details" expander; this plan ships without that expander to keep the PR focused. Adding it later is a self-contained follow-up that doesn't touch the data flow. **Documented as a follow-up below.**

**Type consistency check:**
- `CalendarPanelMode` defined in Task 6, imported in Task 13 — ✅
- `NewJobSheetHandle.present(initialStartIso: string)` defined in Task 10, called in Task 13 — ✅
- `dayOfN(selectedDate, startIso, endDate)` signature consistent between Task 3 and Task 7 — ✅
- `HourGrid` props consistent between Task 8 declaration and Task 13 call site — ✅
- `createJob` payload uses `scheduledStart`/`scheduledEnd` (camelCase) — matches existing helper signature in `lib/calendar/queries.ts` — ✅

**Placeholder scan:** none of the red-flag phrases present.

---

## Follow-Ups (Out of Scope, but Worth Tracking)

1. **NewJobSheet optional fields expander** — `+ Add details` toggle that reveals service types chips, location-override input, and notes textarea. Calls the same `createJob` mutation with additional fields.
2. **Pinch-to-zoom hour density** — gesture handler that scales `HOUR_HEIGHT` between 40 and 100 px.
3. **Drag-to-reschedule inside HourGrid** — long-press + pan to relocate a chip to a new hour, fires `updateJob`.
4. **Realtime polling fallback** — when the Supabase Realtime channel disconnects, poll every 30 s.
5. **Migration to drop legacy `scheduled_date`** — once every read site is verified to use `scheduled_start`, remove the column in a dedicated migration.
6. **Web HourGrid parity (optional)** — `react-big-calendar` already covers Day view; only worth porting our hour-bucketed style if the team prefers consistency over the standard time-positioned look.
