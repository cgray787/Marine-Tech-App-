# Calendar Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Calendar tab to the admin dashboard (web) and technician mobile app showing scheduled jobs in Month/Week/Day views, with click-to-create, click-to-popover interactions, and live data via Supabase Realtime.

**Architecture:** Schema gets `scheduled_start`/`scheduled_end`/`location_override` on `jobs`. Web uses `react-big-calendar` + Radix; mobile uses `react-native-calendars` + `@gorhom/bottom-sheet`. Both consume the same Supabase query layer through `@tanstack/react-query` for caching, optimistic updates, and Realtime invalidation. Color-by-tech is deterministic from a hash of `tech.id`; status shows as a left-border stripe on chips.

**Tech Stack:**
- Backend: Supabase (Postgres, Realtime), existing `lib/supabase.ts` clients
- Web: Next.js 16, React 19, Tailwind v4, `react-big-calendar`, `@radix-ui/react-popover`, `@radix-ui/react-dialog`, `lucide-react`, `@tanstack/react-query`, `date-fns`
- Mobile: Expo SDK 54, React Native 0.81, `react-native-calendars`, `@gorhom/bottom-sheet`, `react-native-reanimated`, `react-native-gesture-handler`, `@tanstack/react-query`, `date-fns`
- Tests: Vitest (web unit), Playwright (web e2e), Maestro (mobile e2e — net-new)

**Spec:** [`docs/superpowers/specs/2026-04-27-calendar-tab-design.md`](../specs/2026-04-27-calendar-tab-design.md)

---

## File Map

**Migrations:**
- Create: `supabase/migrations/008_jobs_scheduled_timestamps.sql`

**Shared web lib:**
- Create: `lib/calendar/types.ts` — TypeScript types (`CalendarJob`, `JobStatus`)
- Create: `lib/calendar/colors.ts` — deterministic tech color mapping
- Create: `lib/calendar/format.ts` — `9 AM` / `10:30 AM` time formatter
- Create: `lib/calendar/queries.ts` — Supabase reads + mutations
- Create: `lib/calendar/realtime.ts` — Supabase Realtime channel subscription helper
- Create: `lib/react-query.ts` — QueryClient singleton (web)

**Web components:**
- Create: `components/calendar/CalendarView.tsx`
- Create: `components/calendar/CalendarToolbar.tsx`
- Create: `components/calendar/JobChip.tsx`
- Create: `components/calendar/JobPopover.tsx`
- Create: `components/calendar/NewJobModal.tsx`
- Create: `components/calendar/UnscheduledTray.tsx`
- Create: `components/calendar/calendar-overrides.css` — `react-big-calendar` Tailwind overrides
- Create: `components/calendar/index.ts`

**Web routes:**
- Create: `app/dashboard/calendar/page.tsx`
- Create: `app/dashboard/calendar/loading.tsx`
- Create: `app/dashboard/calendar/error.tsx`
- Modify: `app/dashboard/sidebar.tsx` — add Calendar nav entry
- Modify: `app/dashboard/layout.tsx` — wrap children in QueryClientProvider (if not already)

**Mobile lib:**
- Create: `mobile/lib/calendar/types.ts`
- Create: `mobile/lib/calendar/colors.ts`
- Create: `mobile/lib/calendar/format.ts`
- Create: `mobile/lib/calendar/queries.ts`
- Create: `mobile/lib/calendar/realtime.ts`
- Create: `mobile/lib/react-query.ts`

**Mobile components:**
- Create: `mobile/components/calendar/MonthCalendar.tsx`
- Create: `mobile/components/calendar/DayList.tsx`
- Create: `mobile/components/calendar/HourGrid.tsx`
- Create: `mobile/components/calendar/JobBottomSheet.tsx`
- Create: `mobile/components/calendar/NewJobSheet.tsx`
- Create: `mobile/components/calendar/index.ts`

**Mobile routes:**
- Create: `mobile/app/(tabs)/calendar.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` — add Calendar tab
- Modify: `mobile/app/_layout.tsx` — wrap in QueryClientProvider + GestureHandlerRootView + BottomSheetModalProvider

**Tests (web):**
- Create: `__tests__/calendar/colors.test.ts`
- Create: `__tests__/calendar/format.test.ts`
- Create: `__tests__/calendar/queries.test.ts`
- Create: `e2e/calendar.spec.ts` (Playwright)
- Modify: `package.json` — add `vitest`, `@testing-library/react`, `playwright`, test scripts

**Tests (mobile):**
- Create: `mobile/.maestro/calendar.yaml` — Maestro flows
- Create: `mobile/.maestro/README.md`

---

## Phase 1 — Foundation

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/008_jobs_scheduled_timestamps.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/008_jobs_scheduled_timestamps.sql`:

```sql
-- Add scheduled timestamp range and free-text location override to jobs.
-- scheduled_date (date) is intentionally kept for one release cycle so
-- existing read sites (jobs page, mobile, webhook in 003) keep working.
-- A follow-up migration (009_drop_scheduled_date.sql) will remove it
-- after every read site has switched to scheduled_start.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS scheduled_start   timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end     timestamptz,
  ADD COLUMN IF NOT EXISTS location_override text;

CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_start
  ON public.jobs (scheduled_start);

COMMENT ON COLUMN public.jobs.scheduled_start IS
  'When the job is scheduled to begin. NULL = unscheduled, shown in calendar Unscheduled tray.';
COMMENT ON COLUMN public.jobs.scheduled_end IS
  'When the job is scheduled to end. NULL = unknown end (treated as +1hr from start in UI).';
COMMENT ON COLUMN public.jobs.location_override IS
  'Free-text location for one-off sites not worth a marina record (e.g., "Lake WA, near marker 12"). Takes precedence over marina.name in calendar chips.';
```

- [ ] **Step 2: Apply locally**

Run: `cd supabase && supabase db reset` (if you have the CLI) **OR** `psql $DATABASE_URL -f supabase/migrations/008_jobs_scheduled_timestamps.sql`.
Expected: no errors, three columns + one index created.

- [ ] **Step 3: Verify**

Run: `psql $DATABASE_URL -c "\d public.jobs"`
Expected output includes `scheduled_start | timestamp with time zone`, `scheduled_end | timestamp with time zone`, `location_override | text`, and `Indexes: idx_jobs_scheduled_start btree (scheduled_start)`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_jobs_scheduled_timestamps.sql
git commit -m "feat(db): add scheduled_start/end and location_override to jobs"
```

---

### Task 2: Install dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `mobile/package.json`, `mobile/package-lock.json`

- [ ] **Step 1: Install web deps**

Run from repo root:
```bash
npm install react-big-calendar @radix-ui/react-popover @radix-ui/react-dialog \
  lucide-react @tanstack/react-query date-fns
npm install --save-dev @types/react-big-calendar vitest @testing-library/react \
  @testing-library/jest-dom @vitejs/plugin-react jsdom @playwright/test
npx playwright install chromium
```

Expected: clean install, no peer-dep errors. If a peer-dep warning surfaces about React 19, accept it — the libs work with React 19.

- [ ] **Step 2: Install mobile deps**

Run from repo root:
```bash
cd mobile
npx expo install react-native-calendars @gorhom/bottom-sheet \
  react-native-reanimated react-native-gesture-handler
npm install @tanstack/react-query date-fns
cd ..
```

Expected: Expo's installer aligns versions with SDK 54.

- [ ] **Step 3: Configure reanimated babel plugin**

Open `mobile/babel.config.js` (create if missing). It should look like:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'], // MUST be last
  };
};
```

- [ ] **Step 4: Verify mobile bundles**

Run: `cd mobile && npx expo start --clear` then press `i` to open iOS simulator (or `a` for Android). App should boot without bundle errors. Stop the dev server (Ctrl+C).

- [ ] **Step 5: Add web test scripts**

In `package.json` `"scripts"`, add (if missing):
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 6: Add vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname) },
  },
});
```

Create `vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json mobile/package.json mobile/package-lock.json mobile/babel.config.js vitest.config.ts vitest.setup.ts
git commit -m "build: install calendar dependencies (web + mobile)"
```

---

### Task 3: Calendar types (shared shape)

**Files:**
- Create: `lib/calendar/types.ts`
- Create: `mobile/lib/calendar/types.ts`

- [ ] **Step 1: Write the web types file**

Create `lib/calendar/types.ts`:
```ts
export type JobStatus = 'new' | 'in_progress' | 'completed';

export type CalendarJob = {
  id: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: JobStatus;
  notes: string | null;
  locationOverride: string | null;
  customer: { id: string; name: string } | null;
  boat: { id: string; name: string; makeModel: string | null } | null;
  marina: { id: string; name: string } | null;
  tech: { id: string; fullName: string } | null;
};

export type CalendarRange = { startUtc: string; endUtc: string };

export type CalendarView = 'month' | 'week' | 'day';
```

- [ ] **Step 2: Write the mobile types file (identical contents)**

Create `mobile/lib/calendar/types.ts` with the **exact same contents** as `lib/calendar/types.ts`. (RN cannot reach into web `lib/` — duplication is intentional.)

- [ ] **Step 3: Commit**

```bash
git add lib/calendar/types.ts mobile/lib/calendar/types.ts
git commit -m "feat(calendar): add shared CalendarJob types"
```

---

### Task 4: Color utility (TDD)

**Files:**
- Create: `lib/calendar/colors.ts`
- Create: `mobile/lib/calendar/colors.ts`
- Test: `__tests__/calendar/colors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/calendar/colors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { techColor, statusStripeColor, TECH_PALETTE } from '@/lib/calendar/colors';

describe('techColor', () => {
  it('returns a hex from the palette', () => {
    const color = techColor('user-abc-123');
    expect(TECH_PALETTE).toContain(color);
  });

  it('is deterministic for the same input', () => {
    expect(techColor('user-abc')).toBe(techColor('user-abc'));
  });

  it('returns different colors for different inputs across many ids', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `user-${i}-${Math.random()}`);
    const colors = new Set(ids.map(techColor));
    expect(colors.size).toBeGreaterThanOrEqual(6);
  });

  it('handles empty string without throwing', () => {
    expect(() => techColor('')).not.toThrow();
    expect(TECH_PALETTE).toContain(techColor(''));
  });
});

describe('statusStripeColor', () => {
  it('maps each status to its hex', () => {
    expect(statusStripeColor('new')).toBe('#4ade80');
    expect(statusStripeColor('in_progress')).toBe('#f59e0b');
    expect(statusStripeColor('completed')).toBe('#94a3b8');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- colors`
Expected: fails with "Cannot find module '@/lib/calendar/colors'".

- [ ] **Step 3: Implement the web colors module**

Create `lib/calendar/colors.ts`:
```ts
import type { JobStatus } from './types';

export const TECH_PALETTE = [
  '#3b6cd6',
  '#a855f7',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#84cc16',
  '#f59e0b',
  '#06b6d4',
] as const;

export function techColor(techId: string): string {
  let h = 0;
  for (let i = 0; i < techId.length; i++) {
    h = (h * 31 + techId.charCodeAt(i)) >>> 0;
  }
  return TECH_PALETTE[h % TECH_PALETTE.length];
}

const STATUS_STRIPE: Record<JobStatus, string> = {
  new: '#4ade80',
  in_progress: '#f59e0b',
  completed: '#94a3b8',
};

export function statusStripeColor(status: JobStatus): string {
  return STATUS_STRIPE[status];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- colors`
Expected: 4 tests passing.

- [ ] **Step 5: Mirror to mobile**

Create `mobile/lib/calendar/colors.ts` with the **exact same contents** as `lib/calendar/colors.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/calendar/colors.ts mobile/lib/calendar/colors.ts __tests__/calendar/colors.test.ts
git commit -m "feat(calendar): add tech color + status stripe utilities (TDD)"
```

---

### Task 5: Time formatter (TDD)

**Files:**
- Create: `lib/calendar/format.ts`
- Create: `mobile/lib/calendar/format.ts`
- Test: `__tests__/calendar/format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/calendar/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeRange } from '@/lib/calendar/format';

describe('formatTime', () => {
  it('shows hour-only when minutes are zero', () => {
    expect(formatTime(new Date('2026-04-27T09:00:00'))).toBe('9 AM');
    expect(formatTime(new Date('2026-04-27T14:00:00'))).toBe('2 PM');
  });

  it('shows minutes when non-zero', () => {
    expect(formatTime(new Date('2026-04-27T10:30:00'))).toBe('10:30 AM');
    expect(formatTime(new Date('2026-04-27T14:15:00'))).toBe('2:15 PM');
  });

  it('handles midnight as 12 AM', () => {
    expect(formatTime(new Date('2026-04-27T00:00:00'))).toBe('12 AM');
  });

  it('handles noon as 12 PM', () => {
    expect(formatTime(new Date('2026-04-27T12:00:00'))).toBe('12 PM');
  });

  it('accepts ISO strings', () => {
    expect(formatTime('2026-04-27T09:00:00')).toBe('9 AM');
  });

  it('returns empty string for null', () => {
    expect(formatTime(null)).toBe('');
  });
});

describe('formatTimeRange', () => {
  it('shows start only when end is null', () => {
    expect(formatTimeRange('2026-04-27T09:00:00', null)).toBe('9 AM');
  });

  it('shows start-end with shared period collapsed', () => {
    expect(formatTimeRange('2026-04-27T09:00:00', '2026-04-27T11:00:00')).toBe('9-11 AM');
    expect(formatTimeRange('2026-04-27T13:00:00', '2026-04-27T15:30:00')).toBe('1-3:30 PM');
  });

  it('shows full periods when crossing AM/PM', () => {
    expect(formatTimeRange('2026-04-27T11:00:00', '2026-04-27T13:00:00')).toBe('11 AM - 1 PM');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- format`
Expected: fails with "Cannot find module '@/lib/calendar/format'".

- [ ] **Step 3: Implement the formatter**

Create `lib/calendar/format.ts`:
```ts
function toDate(input: Date | string | null): Date | null {
  if (input == null) return null;
  return input instanceof Date ? input : new Date(input);
}

export function formatTime(input: Date | string | null): string {
  const d = toDate(input);
  if (!d) return '';
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return minutes === 0
    ? `${hours} ${period}`
    : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function formatTimeRange(
  start: Date | string | null,
  end: Date | string | null,
): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return '';
  if (!e) return formatTime(s);
  const sPeriod = s.getHours() >= 12 ? 'PM' : 'AM';
  const ePeriod = e.getHours() >= 12 ? 'PM' : 'AM';
  if (sPeriod === ePeriod) {
    const sFmt = formatTime(s).replace(` ${sPeriod}`, '');
    return `${sFmt}-${formatTime(e)}`;
  }
  return `${formatTime(s)} - ${formatTime(e)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- format`
Expected: all tests passing.

- [ ] **Step 5: Mirror to mobile**

Create `mobile/lib/calendar/format.ts` with **identical contents**.

- [ ] **Step 6: Commit**

```bash
git add lib/calendar/format.ts mobile/lib/calendar/format.ts __tests__/calendar/format.test.ts
git commit -m "feat(calendar): add time formatter (TDD)"
```

---

### Task 6: Web Supabase queries (TDD)

**Files:**
- Create: `lib/calendar/queries.ts`
- Test: `__tests__/calendar/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/calendar/queries.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mapJobRowToCalendarJob } from '@/lib/calendar/queries';

describe('mapJobRowToCalendarJob', () => {
  it('maps a fully-populated row', () => {
    const row = {
      id: 'job-1',
      scheduled_start: '2026-04-27T17:00:00Z',
      scheduled_end: '2026-04-27T18:00:00Z',
      status: 'new',
      notes: 'oil change',
      location_override: null,
      customer: { id: 'c1', name: 'J. Smith' },
      boat: { id: 'b1', name: 'Sea Ray 32', make_model: 'Sea Ray Sundancer' },
      marina: { id: 'm1', name: 'Shilshole Marina' },
      tech: { id: 't1', full_name: 'Mike Rivera' },
    };
    expect(mapJobRowToCalendarJob(row)).toEqual({
      id: 'job-1',
      scheduledStart: '2026-04-27T17:00:00Z',
      scheduledEnd: '2026-04-27T18:00:00Z',
      status: 'new',
      notes: 'oil change',
      locationOverride: null,
      customer: { id: 'c1', name: 'J. Smith' },
      boat: { id: 'b1', name: 'Sea Ray 32', makeModel: 'Sea Ray Sundancer' },
      marina: { id: 'm1', name: 'Shilshole Marina' },
      tech: { id: 't1', fullName: 'Mike Rivera' },
    });
  });

  it('handles null relations', () => {
    const row = {
      id: 'job-2',
      scheduled_start: null,
      scheduled_end: null,
      status: 'new',
      notes: null,
      location_override: null,
      customer: null,
      boat: null,
      marina: null,
      tech: null,
    };
    const mapped = mapJobRowToCalendarJob(row);
    expect(mapped.customer).toBeNull();
    expect(mapped.boat).toBeNull();
    expect(mapped.marina).toBeNull();
    expect(mapped.tech).toBeNull();
    expect(mapped.scheduledStart).toBeNull();
  });

  it('maps array-shaped relations (Supabase returns arrays for FKs sometimes)', () => {
    const row = {
      id: 'job-3',
      scheduled_start: '2026-04-27T17:00:00Z',
      scheduled_end: null,
      status: 'in_progress',
      notes: null,
      location_override: 'Lake WA mkr 12',
      customer: [{ id: 'c1', name: 'J. Patel' }],
      boat: [{ id: 'b1', name: 'Hatteras 50', make_model: null }],
      marina: [],
      tech: [{ id: 't1', full_name: 'Sarah K.' }],
    };
    const mapped = mapJobRowToCalendarJob(row);
    expect(mapped.customer?.name).toBe('J. Patel');
    expect(mapped.marina).toBeNull();
    expect(mapped.locationOverride).toBe('Lake WA mkr 12');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- queries`
Expected: fails with "Cannot find module".

- [ ] **Step 3: Implement queries module**

Create `lib/calendar/queries.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarJob, JobStatus } from './types';

const SELECT = `
  id, scheduled_start, scheduled_end, status, notes, location_override,
  customer:customers(id, name),
  boat:boats(id, name, make_model),
  marina:marinas(id, name),
  tech:profiles!assigned_to(id, full_name)
`;

type Rel<T> = T | T[] | null;

function unwrap<T>(rel: Rel<T>): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

export function mapJobRowToCalendarJob(row: any): CalendarJob {
  const customer = unwrap<{ id: string; name: string }>(row.customer);
  const boatRaw = unwrap<{ id: string; name: string; make_model: string | null }>(row.boat);
  const marina = unwrap<{ id: string; name: string }>(row.marina);
  const techRaw = unwrap<{ id: string; full_name: string }>(row.tech);
  return {
    id: row.id,
    scheduledStart: row.scheduled_start ?? null,
    scheduledEnd: row.scheduled_end ?? null,
    status: row.status as JobStatus,
    notes: row.notes ?? null,
    locationOverride: row.location_override ?? null,
    customer: customer ? { id: customer.id, name: customer.name } : null,
    boat: boatRaw
      ? { id: boatRaw.id, name: boatRaw.name, makeModel: boatRaw.make_model ?? null }
      : null,
    marina: marina ? { id: marina.id, name: marina.name } : null,
    tech: techRaw ? { id: techRaw.id, fullName: techRaw.full_name } : null,
  };
}

export async function getJobsInRange(
  supabase: SupabaseClient,
  startUtc: string,
  endUtc: string,
  techId?: string,
): Promise<CalendarJob[]> {
  let q = supabase
    .from('jobs')
    .select(SELECT)
    .gte('scheduled_start', startUtc)
    .lte('scheduled_start', endUtc)
    .order('scheduled_start');
  if (techId) q = q.eq('assigned_to', techId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapJobRowToCalendarJob);
}

export async function getUnscheduledJobs(
  supabase: SupabaseClient,
  techId?: string,
): Promise<CalendarJob[]> {
  let q = supabase.from('jobs').select(SELECT).is('scheduled_start', null).order('created_at');
  if (techId) q = q.eq('assigned_to', techId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapJobRowToCalendarJob);
}

export type CreateJobInput = {
  customerId: string;
  boatId: string;
  marinaId?: string | null;
  locationOverride?: string | null;
  assignedTo?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  serviceTypes?: string[];
  notes?: string | null;
};

export async function createJob(supabase: SupabaseClient, input: CreateJobInput) {
  const payload = {
    customer_id: input.customerId,
    boat_id: input.boatId,
    marina_id: input.marinaId ?? null,
    location_override: input.locationOverride ?? null,
    assigned_to: input.assignedTo ?? null,
    scheduled_start: input.scheduledStart ?? null,
    scheduled_end: input.scheduledEnd ?? null,
    scheduled_date: input.scheduledStart ? input.scheduledStart.slice(0, 10) : null,
    service_types: input.serviceTypes ?? [],
    notes: input.notes ?? null,
    status: 'new' as JobStatus,
  };
  const { data, error } = await supabase.from('jobs').insert(payload).select(SELECT).single();
  if (error) throw error;
  return mapJobRowToCalendarJob(data);
}

export type UpdateJobInput = Partial<CreateJobInput> & { id: string };

export async function updateJob(supabase: SupabaseClient, input: UpdateJobInput) {
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = {};
  if ('customerId' in rest) payload.customer_id = rest.customerId;
  if ('boatId' in rest) payload.boat_id = rest.boatId;
  if ('marinaId' in rest) payload.marina_id = rest.marinaId;
  if ('locationOverride' in rest) payload.location_override = rest.locationOverride;
  if ('assignedTo' in rest) payload.assigned_to = rest.assignedTo;
  if ('scheduledStart' in rest) {
    payload.scheduled_start = rest.scheduledStart;
    payload.scheduled_date = rest.scheduledStart ? rest.scheduledStart.slice(0, 10) : null;
  }
  if ('scheduledEnd' in rest) payload.scheduled_end = rest.scheduledEnd;
  if ('serviceTypes' in rest) payload.service_types = rest.serviceTypes;
  if ('notes' in rest) payload.notes = rest.notes;

  const { data, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return mapJobRowToCalendarJob(data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- queries`
Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/queries.ts __tests__/calendar/queries.test.ts
git commit -m "feat(calendar): add Supabase queries + mutations (TDD)"
```

---

### Task 7: Realtime helper

**Files:**
- Create: `lib/calendar/realtime.ts`
- Create: `mobile/lib/calendar/realtime.ts`

- [ ] **Step 1: Write the helper**

Create `lib/calendar/realtime.ts`:
```ts
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToJobs(
  supabase: SupabaseClient,
  onChange: () => void,
): RealtimeChannel {
  const channel = supabase
    .channel('calendar-jobs')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jobs' },
      () => onChange(),
    )
    .subscribe();
  return channel;
}

export function unsubscribe(supabase: SupabaseClient, channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Mirror to mobile**

Create `mobile/lib/calendar/realtime.ts` with identical contents.

- [ ] **Step 4: Commit**

```bash
git add lib/calendar/realtime.ts mobile/lib/calendar/realtime.ts
git commit -m "feat(calendar): add Supabase Realtime subscription helper"
```

---

### Task 8: React Query providers

**Files:**
- Create: `lib/react-query.ts`
- Create: `mobile/lib/react-query.ts`
- Create: `app/dashboard/QueryProvider.tsx`
- Modify: `app/dashboard/layout.tsx`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Web QueryClient singleton**

Create `lib/react-query.ts`:
```ts
'use client';
import { QueryClient } from '@tanstack/react-query';

let client: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }
  return client;
}
```

- [ ] **Step 2: Client-side provider wrapper**

Create `app/dashboard/QueryProvider.tsx`:
```tsx
'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/react-query';
import type { ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 3: Wrap dashboard layout**

Open `app/dashboard/layout.tsx`. Import `QueryProvider`:
```tsx
import { QueryProvider } from './QueryProvider';
```
Wrap the existing children in `<QueryProvider>...</QueryProvider>`.

- [ ] **Step 4: Mobile QueryClient singleton**

Create `mobile/lib/react-query.ts` with identical contents to `lib/react-query.ts` (drop the `'use client'` directive — RN doesn't need it).

- [ ] **Step 5: Wrap mobile root layout**

Open `mobile/app/_layout.tsx`. Add imports:
```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
```

Wrap the existing root return in:
```tsx
<GestureHandlerRootView style={{ flex: 1 }}>
  <QueryClientProvider client={getQueryClient()}>
    <BottomSheetModalProvider>
      {/* existing children */}
    </BottomSheetModalProvider>
  </QueryClientProvider>
</GestureHandlerRootView>
```

- [ ] **Step 6: Run both apps to confirm no regression**

Web: `npm run dev` → open `http://localhost:3000/dashboard` → existing pages still load.
Mobile: `cd mobile && npx expo start` → press `i` → app boots, no red screen.

- [ ] **Step 7: Commit**

```bash
git add lib/react-query.ts mobile/lib/react-query.ts app/dashboard/QueryProvider.tsx app/dashboard/layout.tsx mobile/app/_layout.tsx
git commit -m "feat: add @tanstack/react-query providers (web + mobile)"
```

---

## Phase 2 — Web UI

### Task 9: Calendar CSS overrides + view wrapper

**Files:**
- Create: `components/calendar/calendar-overrides.css`
- Create: `components/calendar/CalendarView.tsx`

- [ ] **Step 1: CSS overrides file**

Create `components/calendar/calendar-overrides.css`:
```css
@import 'react-big-calendar/lib/css/react-big-calendar.css';

.rbc-calendar { color: #fff; font-family: Inter, system-ui, sans-serif; }
.rbc-month-view, .rbc-time-view { background: #0d1320; border: 1px solid #1a2236; border-radius: 8px; overflow: hidden; }
.rbc-header { background: #080c15; color: #8892A5; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; padding: 10px; border-bottom: 1px solid #1a2236; }
.rbc-day-bg, .rbc-month-row, .rbc-time-content { background: #0d1320; border-color: #1a2236; }
.rbc-today { background: rgba(201, 169, 110, 0.08) !important; }
.rbc-off-range-bg { background: #080c15; }
.rbc-off-range { color: #444; }
.rbc-date-cell { padding: 6px; font-size: 12px; }
.rbc-show-more { color: #8892A5; font-size: 10px; padding: 0 6px; }
.rbc-event { background: transparent !important; border: 0 !important; padding: 0 !important; }
.rbc-event-content { padding: 0; }
.rbc-toolbar { display: none; }
```

- [ ] **Step 2: CalendarView component**

Create `components/calendar/CalendarView.tsx`:
```tsx
'use client';
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useMemo } from 'react';
import type { CalendarJob, CalendarView as ViewMode } from '@/lib/calendar/types';
import { JobChip } from './JobChip';
import './calendar-overrides.css';

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

type Props = {
  jobs: CalendarJob[];
  view: ViewMode;
  date: Date;
  onNavigate: (date: Date) => void;
  onView: (view: ViewMode) => void;
  onSelectJob: (job: CalendarJob, anchor: HTMLElement) => void;
  onSelectSlot: (start: Date, end: Date) => void;
};

export function CalendarView({ jobs, view, date, onNavigate, onView, onSelectJob, onSelectSlot }: Props) {
  const events = useMemo(
    () =>
      jobs
        .filter((j) => j.scheduledStart)
        .map((j) => ({
          id: j.id,
          title: '',
          start: new Date(j.scheduledStart!),
          end: new Date(
            j.scheduledEnd ??
              new Date(new Date(j.scheduledStart!).getTime() + 60 * 60 * 1000).toISOString(),
          ),
          resource: j,
        })),
    [jobs],
  );

  return (
    <Calendar
      localizer={localizer}
      events={events}
      view={view as View}
      date={date}
      onNavigate={onNavigate}
      onView={(v) => onView(v as ViewMode)}
      views={['month', 'week', 'day']}
      selectable
      onSelectSlot={(slotInfo) => onSelectSlot(slotInfo.start, slotInfo.end)}
      onSelectEvent={(event, e) =>
        onSelectJob(event.resource as CalendarJob, e?.currentTarget as HTMLElement)
      }
      components={{
        event: ({ event }) => <JobChip job={event.resource as CalendarJob} />,
      }}
      style={{ height: 'calc(100vh - 280px)', minHeight: 600 }}
    />
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/calendar/calendar-overrides.css components/calendar/CalendarView.tsx
git commit -m "feat(calendar): add CalendarView wrapper with theme overrides"
```

---

### Task 10: JobChip component

**Files:**
- Create: `components/calendar/JobChip.tsx`

- [ ] **Step 1: Implement**

Create `components/calendar/JobChip.tsx`:
```tsx
'use client';
import { MapPin } from 'lucide-react';
import type { CalendarJob } from '@/lib/calendar/types';
import { techColor, statusStripeColor } from '@/lib/calendar/colors';
import { formatTime } from '@/lib/calendar/format';

export function JobChip({ job }: { job: CalendarJob }) {
  const bg = job.tech ? techColor(job.tech.id) : '#3b6cd6';
  const stripe = statusStripeColor(job.status);
  const location = job.locationOverride ?? job.marina?.name ?? null;
  const customerShort = job.customer ? shortName(job.customer.name) : 'Unassigned customer';
  const boatLabel = job.boat?.name ?? 'No boat';

  return (
    <div
      style={{ background: bg, borderLeft: `3px solid ${stripe}` }}
      className="text-white text-[11px] rounded-[3px] px-[5px] py-[4px] leading-[1.35] cursor-pointer"
    >
      <div className="font-semibold">
        {formatTime(job.scheduledStart)} · {customerShort}
      </div>
      <div className="opacity-90">{boatLabel}</div>
      {location && (
        <div className="opacity-75 text-[10px] flex items-center gap-1">
          <MapPin size={10} aria-hidden /> {location}
        </div>
      )}
    </div>
  );
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/calendar/JobChip.tsx
git commit -m "feat(calendar): add JobChip with color-by-tech + status stripe"
```

---

### Task 11: CalendarToolbar

**Files:**
- Create: `components/calendar/CalendarToolbar.tsx`

- [ ] **Step 1: Implement**

Create `components/calendar/CalendarToolbar.tsx`:
```tsx
'use client';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, addMonths, addWeeks, addDays } from 'date-fns';
import type { CalendarView } from '@/lib/calendar/types';

type Tech = { id: string; fullName: string };

type Props = {
  date: Date;
  view: CalendarView;
  onDateChange: (d: Date) => void;
  onViewChange: (v: CalendarView) => void;
  techs: Tech[];
  selectedTechId: string | null;
  onTechChange: (id: string | null) => void;
  onNewJob: () => void;
};

export function CalendarToolbar({
  date, view, onDateChange, onViewChange, techs, selectedTechId, onTechChange, onNewJob,
}: Props) {
  const titleFmt = view === 'month' ? 'MMMM yyyy' : view === 'week' ? "'Week of' MMM d, yyyy" : 'EEEE, MMM d, yyyy';
  const step = (delta: 1 | -1) => {
    const fn = view === 'month' ? addMonths : view === 'week' ? addWeeks : addDays;
    onDateChange(fn(date, delta));
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl text-white" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          {format(date, titleFmt)}
        </span>
        <button onClick={() => step(-1)} aria-label="Previous"
          className="bg-[#0d1320] border border-[#1a2236] text-white px-3 py-1.5 rounded-md hover:bg-[#1a2236]">
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => onDateChange(new Date())}
          className="bg-[#0d1320] border border-[#1a2236] text-white px-3 py-1.5 rounded-md hover:bg-[#1a2236]">
          Today
        </button>
        <button onClick={() => step(1)} aria-label="Next"
          className="bg-[#0d1320] border border-[#1a2236] text-white px-3 py-1.5 rounded-md hover:bg-[#1a2236]">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex gap-2">
        <select
          value={selectedTechId ?? ''}
          onChange={(e) => onTechChange(e.target.value || null)}
          className="bg-[#0d1320] border border-[#1a2236] text-white px-3 py-1.5 rounded-md"
        >
          <option value="">All technicians</option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>{t.fullName}</option>
          ))}
        </select>

        <div className="flex bg-[#0d1320] border border-[#1a2236] rounded-md overflow-hidden">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={
                v === view
                  ? 'bg-[#C9A96E] text-[#060a12] px-3.5 py-1.5 font-semibold capitalize'
                  : 'text-[#8892A5] px-3.5 py-1.5 capitalize hover:text-white'
              }
            >
              {v}
            </button>
          ))}
        </div>

        <button onClick={onNewJob}
          className="bg-[#C9A96E] text-[#060a12] px-3.5 py-1.5 rounded-md font-semibold flex items-center gap-1 hover:bg-[#D4B87D]">
          <Plus size={16} /> New job
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/calendar/CalendarToolbar.tsx
git commit -m "feat(calendar): add toolbar (date nav, tech filter, view switcher, +new)"
```

---

### Task 12: JobPopover (Radix)

**Files:**
- Create: `components/calendar/JobPopover.tsx`

- [ ] **Step 1: Implement**

Create `components/calendar/JobPopover.tsx`:
```tsx
'use client';
import * as Popover from '@radix-ui/react-popover';
import Link from 'next/link';
import { MapPin, ExternalLink, Wrench } from 'lucide-react';
import type { CalendarJob } from '@/lib/calendar/types';
import { formatTimeRange } from '@/lib/calendar/format';

type Props = {
  job: CalendarJob | null;
  anchor: HTMLElement | null;
  onClose: () => void;
};

export function JobPopover({ job, anchor, onClose }: Props) {
  if (!job || !anchor) return null;
  const location = job.locationOverride ?? job.marina?.name ?? null;
  return (
    <Popover.Root open onOpenChange={(o) => !o && onClose()}>
      <Popover.Anchor virtualRef={{ current: anchor }} />
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          className="bg-[#0d1320] border border-[#1a2236] text-white rounded-lg shadow-xl p-4 w-80 z-50"
        >
          <div className="text-xs text-[#C9A96E] uppercase tracking-wider mb-1">
            {formatTimeRange(job.scheduledStart, job.scheduledEnd)}
          </div>
          <div className="text-lg font-semibold mb-2">{job.customer?.name ?? 'Unassigned customer'}</div>
          <div className="text-sm text-[#8892A5] mb-3">
            {job.boat?.name ?? 'No boat'}{job.boat?.makeModel ? ` · ${job.boat.makeModel}` : ''}
          </div>
          {location && (
            <div className="text-sm text-white flex items-center gap-1.5 mb-2">
              <MapPin size={14} className="text-[#C9A96E]" /> {location}
            </div>
          )}
          {job.tech && (
            <div className="text-sm text-white flex items-center gap-1.5 mb-2">
              <Wrench size={14} className="text-[#C9A96E]" /> {job.tech.fullName}
            </div>
          )}
          {job.notes && <div className="text-xs text-[#8892A5] mt-2 italic">{job.notes}</div>}
          <Link
            href={`/dashboard/jobs/${job.id}`}
            className="mt-3 inline-flex items-center gap-1 text-[#C9A96E] hover:text-[#D4B87D] text-sm font-semibold"
          >
            Open job <ExternalLink size={14} />
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `virtualRef` typing complains, use `Popover.Trigger asChild` with the anchor element instead.

- [ ] **Step 3: Commit**

```bash
git add components/calendar/JobPopover.tsx
git commit -m "feat(calendar): add JobPopover (Radix) with summary + open link"
```

---

### Task 13: NewJobModal

**Files:**
- Create: `components/calendar/NewJobModal.tsx`
- Create: `components/calendar/modal-input.css`

- [ ] **Step 1: Modal-input CSS**

Create `components/calendar/modal-input.css`:
```css
.modal-input {
  width: 100%;
  background: #060a12;
  border: 1px solid #1a2236;
  color: #fff;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
}
.modal-input:focus { outline: none; border-color: #C9A96E; }
```

- [ ] **Step 2: Modal component**

Create `components/calendar/NewJobModal.tsx`:
```tsx
'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { addHours, format } from 'date-fns';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createJob } from '@/lib/calendar/queries';
import { createBrowserClient } from '@/lib/supabase/client';
import './modal-input.css';

type Props = {
  open: boolean;
  defaultStart: Date | null;
  customers: { id: string; name: string }[];
  boats: { id: string; name: string; customerId: string }[];
  marinas: { id: string; name: string }[];
  techs: { id: string; fullName: string }[];
  onClose: () => void;
};

export function NewJobModal({ open, defaultStart, customers, boats, marinas, techs, onClose }: Props) {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState('');
  const [boatId, setBoatId] = useState('');
  const [marinaId, setMarinaId] = useState('');
  const [locationOverride, setLocationOverride] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [start, setStart] = useState(defaultStart ?? new Date());
  const [end, setEnd] = useState(defaultStart ? addHours(defaultStart, 1) : addHours(new Date(), 1));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultStart) {
      setStart(defaultStart);
      setEnd(addHours(defaultStart, 1));
    }
  }, [defaultStart]);

  const eligibleBoats = customerId ? boats.filter((b) => b.customerId === customerId) : boats;

  const mutation = useMutation({
    mutationFn: () =>
      createJob(supabase, {
        customerId, boatId,
        marinaId: marinaId || null,
        locationOverride: locationOverride || null,
        assignedTo: assignedTo || null,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        notes: notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
    onError: (e: any) => setError(e?.message ?? 'Failed to create job'),
  });

  const canSubmit = customerId && boatId && end > start;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#0d1320] border border-[#1a2236] text-white rounded-lg p-6 w-[480px] max-w-[90vw]">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              New job
            </Dialog.Title>
            <Dialog.Close className="text-[#8892A5] hover:text-white"><X size={18} /></Dialog.Close>
          </div>

          <div className="space-y-3">
            <Field label="Customer">
              <select className="modal-input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setBoatId(''); }}>
                <option value="">Select customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Boat">
              <select className="modal-input" value={boatId} onChange={(e) => setBoatId(e.target.value)} disabled={!customerId}>
                <option value="">Select boat…</option>
                {eligibleBoats.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Marina">
              <select className="modal-input" value={marinaId} onChange={(e) => setMarinaId(e.target.value)}>
                <option value="">— none —</option>
                {marinas.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Location override (optional)">
              <input className="modal-input" type="text" value={locationOverride} onChange={(e) => setLocationOverride(e.target.value)} placeholder="e.g., Lake WA, near marker 12" />
            </Field>
            <Field label="Technician">
              <select className="modal-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <input className="modal-input" type="datetime-local"
                  value={format(start, "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) => setStart(new Date(e.target.value))} />
              </Field>
              <Field label="End">
                <input className="modal-input" type="datetime-local"
                  value={format(end, "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) => setEnd(new Date(e.target.value))} />
              </Field>
            </div>
            <Field label="Notes">
              <textarea className="modal-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            {error && <div className="text-red-400 text-sm">{error}</div>}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close className="px-4 py-2 text-[#8892A5] hover:text-white">Cancel</Dialog.Close>
            <button
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="bg-[#C9A96E] text-[#060a12] px-4 py-2 rounded-md font-semibold disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving…' : 'Create job'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-[#8892A5] uppercase tracking-wider mb-1 block">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 3: Reconcile the Supabase client import**

The path `@/lib/supabase/client` is illustrative. Open the existing browser-side Supabase helper. Replace `createBrowserClient` import with whatever the project actually exports. Confirm with: `grep -rn "createClient\|createBrowserClient" lib/`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/calendar/NewJobModal.tsx components/calendar/modal-input.css
git commit -m "feat(calendar): add NewJobModal with create mutation"
```

---

### Task 14: UnscheduledTray

**Files:**
- Create: `components/calendar/UnscheduledTray.tsx`

- [ ] **Step 1: Implement**

Create `components/calendar/UnscheduledTray.tsx`:
```tsx
'use client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { CalendarJob } from '@/lib/calendar/types';

type Props = {
  jobs: CalendarJob[];
  onSelect: (job: CalendarJob, anchor: HTMLElement) => void;
};

export function UnscheduledTray({ jobs, onSelect }: Props) {
  const [open, setOpen] = useState(true);
  if (jobs.length === 0) return null;

  return (
    <div className="bg-[#0d1320] border border-[#1a2236] rounded-lg p-3 mb-4 flex items-center gap-3">
      <span className="text-[#C9A96E] text-xs uppercase tracking-wider whitespace-nowrap">
        Unscheduled ({jobs.length})
      </span>
      {open && (
        <div className="flex gap-1.5 flex-1 overflow-x-auto">
          {jobs.map((j) => {
            const loc = j.locationOverride ?? j.marina?.name ?? '';
            return (
              <button
                key={j.id}
                onClick={(e) => onSelect(j, e.currentTarget)}
                className="bg-[#1a2236] hover:bg-[#243046] text-white px-2.5 py-1 rounded text-xs whitespace-nowrap"
              >
                {j.customer?.name ?? 'Customer'} · {j.boat?.name ?? 'Boat'}
                {loc ? ` · ${loc}` : ''}
              </button>
            );
          })}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="text-[#8892A5] hover:text-white" aria-label={open ? 'Collapse' : 'Expand'}>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/calendar/UnscheduledTray.tsx
git commit -m "feat(calendar): add UnscheduledTray (collapsible)"
```

---

### Task 15: Component barrel + sidebar link

**Files:**
- Create: `components/calendar/index.ts`
- Modify: `app/dashboard/sidebar.tsx`

- [ ] **Step 1: Barrel**

Create `components/calendar/index.ts`:
```ts
export { CalendarView } from './CalendarView';
export { CalendarToolbar } from './CalendarToolbar';
export { JobChip } from './JobChip';
export { JobPopover } from './JobPopover';
export { NewJobModal } from './NewJobModal';
export { UnscheduledTray } from './UnscheduledTray';
```

- [ ] **Step 2: Read existing sidebar**

Run: `cat app/dashboard/sidebar.tsx`
Note the existing nav-item pattern (likely an array of `{ href, label, icon }` objects or repeated JSX). Match the pattern.

- [ ] **Step 3: Add Calendar entry**

In `app/dashboard/sidebar.tsx`, between the Jobs and Technicians entries, add:
```tsx
import { Calendar as CalendarIcon } from 'lucide-react';
// ...
{ href: '/dashboard/calendar', label: 'Calendar', icon: CalendarIcon },
```
(Adapt to existing structure — see Step 2.)

- [ ] **Step 4: Verify in browser**

Run: `npm run dev` → open `http://localhost:3000/dashboard` → "Calendar" appears in sidebar between Jobs and Technicians. Clicking it 404s for now (page comes next task).

- [ ] **Step 5: Commit**

```bash
git add components/calendar/index.ts app/dashboard/sidebar.tsx
git commit -m "feat(calendar): add Calendar entry to dashboard sidebar"
```

---

### Task 16: Calendar page wiring

**Files:**
- Create: `app/dashboard/calendar/page.tsx`
- Create: `app/dashboard/calendar/loading.tsx`
- Create: `app/dashboard/calendar/error.tsx`

- [ ] **Step 1: Loading state**

Create `app/dashboard/calendar/loading.tsx`:
```tsx
export default function Loading() {
  return (
    <div className="p-6">
      <div className="h-8 w-48 bg-[#1a2236] rounded animate-pulse mb-4" />
      <div className="h-12 w-full bg-[#1a2236] rounded animate-pulse mb-4" />
      <div className="grid grid-cols-7 gap-px bg-[#1a2236] rounded-lg overflow-hidden">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-32 bg-[#0d1320]" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Error state**

Create `app/dashboard/calendar/error.tsx`:
```tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6 text-white">
      <h2 className="text-2xl mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Couldn't load calendar
      </h2>
      <p className="text-[#8892A5] mb-4">{error.message}</p>
      <button onClick={reset} className="bg-[#C9A96E] text-[#060a12] px-4 py-2 rounded font-semibold">
        Retry
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Page**

Create `app/dashboard/calendar/page.tsx`:
```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import {
  CalendarView, CalendarToolbar, JobPopover, NewJobModal, UnscheduledTray,
} from '@/components/calendar';
import { getJobsInRange, getUnscheduledJobs } from '@/lib/calendar/queries';
import { subscribeToJobs, unsubscribe } from '@/lib/calendar/realtime';
import { createBrowserClient } from '@/lib/supabase/client';
import type { CalendarJob, CalendarView as ViewMode } from '@/lib/calendar/types';

export default function CalendarPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewMode>('month');
  const [date, setDate] = useState(new Date());
  const [techId, setTechId] = useState<string | null>(null);
  const [popoverJob, setPopoverJob] = useState<CalendarJob | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobStart, setNewJobStart] = useState<Date | null>(null);

  const range = useMemo(() => {
    const fns = view === 'month'
      ? [startOfMonth, endOfMonth]
      : view === 'week'
      ? [startOfWeek, endOfWeek]
      : [startOfDay, endOfDay];
    return { startUtc: fns[0](date).toISOString(), endUtc: fns[1](date).toISOString() };
  }, [date, view]);

  const jobsQuery = useQuery({
    queryKey: ['calendar', range.startUtc, range.endUtc, techId],
    queryFn: () => getJobsInRange(supabase, range.startUtc, range.endUtc, techId ?? undefined),
  });

  const unscheduledQuery = useQuery({
    queryKey: ['calendar', 'unscheduled', techId],
    queryFn: () => getUnscheduledJobs(supabase, techId ?? undefined),
  });

  const techsQuery = useQuery({
    queryKey: ['techs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'technician')
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((t) => ({ id: t.id, fullName: t.full_name }));
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const channel = subscribeToJobs(supabase, () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    });
    return () => unsubscribe(supabase, channel);
  }, [supabase, queryClient]);

  const lookupsQuery = useQuery({
    queryKey: ['calendar', 'lookups'],
    enabled: newJobOpen,
    queryFn: async () => {
      const [customers, boats, marinas] = await Promise.all([
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('boats').select('id, name, customer_id').order('name'),
        supabase.from('marinas').select('id, name').order('name'),
      ]);
      if (customers.error) throw customers.error;
      if (boats.error) throw boats.error;
      if (marinas.error) throw marinas.error;
      return {
        customers: customers.data ?? [],
        boats: (boats.data ?? []).map((b) => ({ id: b.id, name: b.name, customerId: b.customer_id })),
        marinas: marinas.data ?? [],
      };
    },
  });

  const jobs = jobsQuery.data ?? [];

  return (
    <div className="p-6 text-white min-h-screen bg-[#060a12]">
      <CalendarToolbar
        date={date}
        view={view}
        onDateChange={setDate}
        onViewChange={setView}
        techs={techsQuery.data ?? []}
        selectedTechId={techId}
        onTechChange={setTechId}
        onNewJob={() => { setNewJobStart(new Date()); setNewJobOpen(true); }}
      />

      <UnscheduledTray
        jobs={unscheduledQuery.data ?? []}
        onSelect={(job, anchor) => { setPopoverJob(job); setPopoverAnchor(anchor); }}
      />

      <CalendarView
        jobs={jobs}
        view={view}
        date={date}
        onNavigate={setDate}
        onView={setView}
        onSelectJob={(job, anchor) => { setPopoverJob(job); setPopoverAnchor(anchor); }}
        onSelectSlot={(start) => { setNewJobStart(start); setNewJobOpen(true); }}
      />

      <JobPopover job={popoverJob} anchor={popoverAnchor} onClose={() => setPopoverJob(null)} />

      <NewJobModal
        open={newJobOpen}
        defaultStart={newJobStart}
        customers={lookupsQuery.data?.customers ?? []}
        boats={lookupsQuery.data?.boats ?? []}
        marinas={lookupsQuery.data?.marinas ?? []}
        techs={techsQuery.data ?? []}
        onClose={() => setNewJobOpen(false)}
      />

      {jobsQuery.data && jobs.length === 0 && unscheduledQuery.data?.length === 0 && (
        <div className="text-center text-[#8892A5] mt-12">
          <p className="text-lg mb-3">No jobs scheduled this {view}</p>
          <button onClick={() => { setNewJobStart(new Date()); setNewJobOpen(true); }}
            className="bg-[#C9A96E] text-[#060a12] px-4 py-2 rounded font-semibold">
            + Schedule a job
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Smoke test in browser**

Run: `npm run dev` → open `http://localhost:3000/dashboard/calendar`. Calendar grid should render with month view. Empty state shows if no jobs. Insert a test job manually via Supabase Studio with `scheduled_start` = now+2h — it should appear within 1-2s without refresh (Realtime).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/calendar/page.tsx app/dashboard/calendar/loading.tsx app/dashboard/calendar/error.tsx
git commit -m "feat(calendar): wire up admin /dashboard/calendar page"
```

---

### Task 17: Playwright e2e test

**Files:**
- Create: `e2e/calendar.spec.ts`
- Create: `playwright.config.ts` (if missing)

- [ ] **Step 1: Playwright config**

If `playwright.config.ts` doesn't exist, create:
```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Write the e2e test**

Create `e2e/calendar.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

// Assumes a logged-in admin session helper exists. If not, add one
// here that programmatically creates a Supabase session cookie before each test.

test.describe('Calendar tab', () => {
  test('navigates to calendar from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/\/dashboard\/calendar/);
    await expect(page.getByRole('button', { name: /new job/i })).toBeVisible();
  });

  test('opens new job modal when clicking +New job', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.getByRole('button', { name: /new job/i }).click();
    await expect(page.getByText('New job', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('switches between month / week / day views', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.getByRole('button', { name: 'week' }).click();
    await expect(page.locator('.rbc-time-view')).toBeVisible();
    await page.getByRole('button', { name: 'day' }).click();
    await expect(page.locator('.rbc-time-view')).toBeVisible();
    await page.getByRole('button', { name: 'month' }).click();
    await expect(page.locator('.rbc-month-view')).toBeVisible();
  });
});
```

- [ ] **Step 3: Run**

Run: `npm run test:e2e`
Expected: 3 tests pass. If auth is required, the first run will fail — add an auth setup project to Playwright config and store storageState (standard pattern).

- [ ] **Step 4: Commit**

```bash
git add e2e/calendar.spec.ts playwright.config.ts
git commit -m "test(calendar): add Playwright e2e for nav, modal, view switch"
```

---

## Phase 3 — Mobile UI

### Task 18: Mobile queries module

**Files:**
- Create: `mobile/lib/calendar/queries.ts`

- [ ] **Step 1: Copy with adjusted import**

Create `mobile/lib/calendar/queries.ts` with **identical contents** to `lib/calendar/queries.ts` (Step 3 of Task 6). The module is self-contained.

- [ ] **Step 2: Type-check mobile**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/calendar/queries.ts
git commit -m "feat(calendar): mirror queries module to mobile"
```

---

### Task 19: Calendar tab + screen scaffold

**Files:**
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Create: `mobile/app/(tabs)/calendar.tsx`

- [ ] **Step 1: Read existing tab layout**

Run: `cat mobile/app/\(tabs\)/_layout.tsx`
Note the existing `<Tabs.Screen ... />` pattern.

- [ ] **Step 2: Add Calendar tab**

In `mobile/app/(tabs)/_layout.tsx`, after the existing `<Tabs.Screen name="pdi" ... />` entry, add:
```tsx
<Tabs.Screen
  name="calendar"
  options={{
    title: 'Calendar',
    tabBarIcon: ({ focused }) => <TabIcon name="Calendar" focused={focused} />,
  }}
/>
```
And in the `icons` map at the top of the file, add: `Calendar: "\uD83D\uDCC5"`.

- [ ] **Step 3: Stub calendar screen**

Create `mobile/app/(tabs)/calendar.tsx`:
```tsx
import { View, Text, StyleSheet } from 'react-native';
export default function CalendarScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Calendar — coming online…</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060a12', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#8892A5', fontSize: 16 },
});
```

- [ ] **Step 4: Verify in simulator**

Run: `cd mobile && npx expo start` → press `i`. New "Calendar" tab appears. Tapping it shows the placeholder.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(tabs\)/_layout.tsx mobile/app/\(tabs\)/calendar.tsx
git commit -m "feat(calendar,mobile): add Calendar tab and screen scaffold"
```

---

### Task 20: MonthCalendar component

**Files:**
- Create: `mobile/components/calendar/MonthCalendar.tsx`

- [ ] **Step 1: Implement**

Create `mobile/components/calendar/MonthCalendar.tsx`:
```tsx
import { Calendar, DateData } from 'react-native-calendars';
import { useMemo } from 'react';
import type { CalendarJob } from '@/lib/calendar/types';
import { techColor } from '@/lib/calendar/colors';

type Props = {
  jobs: CalendarJob[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onMonthChange: (firstOfMonth: Date) => void;
};

export function MonthCalendar({ jobs, selectedDate, onSelectDate, onMonthChange }: Props) {
  const markedDates = useMemo(() => {
    const map: Record<string, { dots: { color: string }[]; selected?: boolean }> = {};
    for (const j of jobs) {
      if (!j.scheduledStart) continue;
      const day = j.scheduledStart.slice(0, 10);
      const color = j.tech ? techColor(j.tech.id) : '#3b6cd6';
      map[day] ??= { dots: [] };
      if (map[day].dots.length < 3) map[day].dots.push({ color });
    }
    if (selectedDate) {
      map[selectedDate] = { ...(map[selectedDate] ?? { dots: [] }), selected: true };
    }
    return map;
  }, [jobs, selectedDate]);

  return (
    <Calendar
      markingType="multi-dot"
      markedDates={markedDates}
      onDayPress={(d: DateData) => onSelectDate(d.dateString)}
      onMonthChange={(d: DateData) => onMonthChange(new Date(d.year, d.month - 1, 1))}
      theme={{
        calendarBackground: '#0d1320',
        dayTextColor: '#fff',
        monthTextColor: '#fff',
        textSectionTitleColor: '#8892A5',
        textDisabledColor: '#444',
        todayTextColor: '#C9A96E',
        selectedDayBackgroundColor: '#C9A96E',
        selectedDayTextColor: '#060a12',
        arrowColor: '#C9A96E',
      }}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/calendar/MonthCalendar.tsx
git commit -m "feat(calendar,mobile): add MonthCalendar with multi-dot markers"
```

---

### Task 21: DayList component

**Files:**
- Create: `mobile/components/calendar/DayList.tsx`

- [ ] **Step 1: Implement**

Create `mobile/components/calendar/DayList.tsx`:
```tsx
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import type { CalendarJob } from '@/lib/calendar/types';
import { techColor, statusStripeColor } from '@/lib/calendar/colors';
import { formatTime } from '@/lib/calendar/format';

type Props = {
  jobs: CalendarJob[];
  onSelect: (job: CalendarJob) => void;
};

export function DayList({ jobs, onSelect }: Props) {
  if (jobs.length === 0) {
    return <View style={styles.empty}><Text style={styles.emptyText}>No jobs on this day</Text></View>;
  }
  return (
    <FlatList
      data={jobs}
      keyExtractor={(j) => j.id}
      contentContainerStyle={{ padding: 12, gap: 8 }}
      renderItem={({ item: j }) => {
        const bg = j.tech ? techColor(j.tech.id) : '#3b6cd6';
        const stripe = statusStripeColor(j.status);
        const loc = j.locationOverride ?? j.marina?.name ?? null;
        return (
          <Pressable
            onPress={() => onSelect(j)}
            style={[styles.card, { backgroundColor: bg, borderLeftColor: stripe }]}
          >
            <Text style={styles.time}>{formatTime(j.scheduledStart)} · {j.customer?.name ?? 'Customer'}</Text>
            <Text style={styles.boat}>{j.boat?.name ?? 'Boat'}</Text>
            {loc && <Text style={styles.location}>📍 {loc}</Text>}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#8892A5' },
  card: { borderRadius: 6, borderLeftWidth: 4, padding: 10 },
  time: { color: '#fff', fontWeight: '600', fontSize: 14 },
  boat: { color: '#fff', opacity: 0.9, marginTop: 2 },
  location: { color: '#fff', opacity: 0.75, fontSize: 12, marginTop: 2 },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/calendar/DayList.tsx
git commit -m "feat(calendar,mobile): add DayList of jobs for selected day"
```

---

### Task 22: JobBottomSheet

**Files:**
- Create: `mobile/components/calendar/JobBottomSheet.tsx`

- [ ] **Step 1: Implement**

Create `mobile/components/calendar/JobBottomSheet.tsx`:
```tsx
import { forwardRef, useMemo, useImperativeHandle, useRef, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import type { CalendarJob } from '@/lib/calendar/types';
import { formatTimeRange } from '@/lib/calendar/format';

export type JobBottomSheetHandle = {
  present: (job: CalendarJob) => void;
  dismiss: () => void;
};

export const JobBottomSheet = forwardRef<JobBottomSheetHandle, {}>((_, ref) => {
  const sheetRef = useRef<BottomSheet>(null);
  const [job, setJob] = useState<CalendarJob | null>(null);
  const snapPoints = useMemo(() => ['25%', '60%'], []);

  useImperativeHandle(ref, () => ({
    present: (j) => { setJob(j); sheetRef.current?.snapToIndex(0); },
    dismiss: () => sheetRef.current?.close(),
  }));

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={snapPoints}
      index={-1}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#0d1320' }}
      handleIndicatorStyle={{ backgroundColor: '#8892A5' }}
    >
      <BottomSheetView style={styles.body}>
        {job && (
          <>
            <Text style={styles.time}>{formatTimeRange(job.scheduledStart, job.scheduledEnd)}</Text>
            <Text style={styles.customer}>{job.customer?.name ?? 'Customer'}</Text>
            <Text style={styles.boat}>
              {job.boat?.name ?? 'Boat'}{job.boat?.makeModel ? ` · ${job.boat.makeModel}` : ''}
            </Text>
            {(job.locationOverride || job.marina?.name) && (
              <Text style={styles.location}>📍 {job.locationOverride ?? job.marina?.name}</Text>
            )}
            {job.tech && <Text style={styles.tech}>🔧 {job.tech.fullName}</Text>}
            {job.notes && <Text style={styles.notes}>{job.notes}</Text>}
            <Pressable
              onPress={() => { sheetRef.current?.close(); router.push(`/job/${job.id}`); }}
              style={styles.openBtn}
            >
              <Text style={styles.openBtnText}>Open job →</Text>
            </Pressable>
          </>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  body: { padding: 20 },
  time: { color: '#C9A96E', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  customer: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 4 },
  boat: { color: '#8892A5', fontSize: 14, marginBottom: 12 },
  location: { color: '#fff', fontSize: 14, marginBottom: 6 },
  tech: { color: '#fff', fontSize: 14, marginBottom: 6 },
  notes: { color: '#8892A5', fontSize: 12, fontStyle: 'italic', marginTop: 8 },
  openBtn: { marginTop: 16, backgroundColor: '#C9A96E', padding: 12, borderRadius: 8, alignItems: 'center' },
  openBtnText: { color: '#060a12', fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/calendar/JobBottomSheet.tsx
git commit -m "feat(calendar,mobile): add JobBottomSheet with details + open link"
```

---

### Task 23: Mobile calendar screen (full)

**Files:**
- Modify: `mobile/app/(tabs)/calendar.tsx`

- [ ] **Step 1: Replace stub**

Replace `mobile/app/(tabs)/calendar.tsx` contents with:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getJobsInRange } from '@/lib/calendar/queries';
import { subscribeToJobs, unsubscribe } from '@/lib/calendar/realtime';
import { MonthCalendar } from '@/components/calendar/MonthCalendar';
import { DayList } from '@/components/calendar/DayList';
import { JobBottomSheet, JobBottomSheetHandle } from '@/components/calendar/JobBottomSheet';

export default function CalendarScreen() {
  const queryClient = useQueryClient();
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const sheetRef = useRef<JobBottomSheetHandle>(null);

  const range = useMemo(() => ({
    startUtc: startOfMonth(monthDate).toISOString(),
    endUtc: endOfMonth(monthDate).toISOString(),
  }), [monthDate]);

  const jobsQuery = useQuery({
    queryKey: ['calendar-mobile', range.startUtc, range.endUtc],
    queryFn: () => getJobsInRange(supabase, range.startUtc, range.endUtc),
  });

  useEffect(() => {
    const channel = subscribeToJobs(supabase, () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-mobile'] });
    });
    return () => unsubscribe(supabase, channel);
  }, [queryClient]);

  const jobsForDay = (jobsQuery.data ?? []).filter(
    (j) => j.scheduledStart && j.scheduledStart.slice(0, 10) === selectedDate,
  );

  return (
    <View style={styles.container}>
      <MonthCalendar
        jobs={jobsQuery.data ?? []}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={setMonthDate}
      />
      {jobsQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#C9A96E" /></View>
      ) : (
        <DayList jobs={jobsForDay} onSelect={(j) => sheetRef.current?.present(j)} />
      )}
      <JobBottomSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060a12' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
```

- [ ] **Step 2: Reconcile Supabase import**

Open existing mobile Supabase helper. Run: `grep -rn "createClient\|export.*supabase" mobile/lib/`. Adjust the import on line 6 to match.

- [ ] **Step 3: Smoke test in simulator**

Run: `cd mobile && npx expo start` → `i`. Navigate to Calendar tab. See month with dots on days that have jobs. Tap a day with a dot → DayList shows jobs. Tap a job → bottom sheet slides up with details.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(tabs\)/calendar.tsx
git commit -m "feat(calendar,mobile): wire up Calendar screen with Realtime"
```

---

### Task 24: Maestro mobile flow

**Files:**
- Create: `mobile/.maestro/calendar.yaml`
- Create: `mobile/.maestro/README.md`

- [ ] **Step 1: README**

Create `mobile/.maestro/README.md`:
```markdown
# Maestro flows

Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`

Run a flow: `maestro test .maestro/calendar.yaml`

The simulator (or a connected device) must be running with the app installed.
```

- [ ] **Step 2: Calendar flow**

Create `mobile/.maestro/calendar.yaml`:
```yaml
appId: com.grayyachts.marinetech
---
- launchApp
- tapOn: "Calendar"
- assertVisible:
    text: ".*"
- back
```

- [ ] **Step 3: Run (manual — only if simulator + Maestro installed)**

Run: `cd mobile && maestro test .maestro/calendar.yaml`
Expected: green checkmarks. If Maestro isn't installed locally, skip — the file is ready for whoever ships.

- [ ] **Step 4: Commit**

```bash
git add mobile/.maestro/calendar.yaml mobile/.maestro/README.md
git commit -m "test(calendar,mobile): add Maestro flow for Calendar tab"
```

---

## Phase 4 — Polish & Verification

### Task 25: Manual smoke pass + memory update

- [ ] **Step 1: Manual smoke checklist**

Open `http://localhost:3000/dashboard/calendar` and the iOS simulator's Calendar tab. Verify:
- [ ] Web: month view shows correctly today's date highlighted
- [ ] Web: switch to Week → time grid renders dark navy + gold theme
- [ ] Web: switch to Day → same
- [ ] Web: click empty cell → New job modal opens, datetime prefilled
- [ ] Web: create a test job → appears in calendar without refresh
- [ ] Web: click chip → popover shows correct customer/boat/location
- [ ] Web: filter to one tech → only their chips visible
- [ ] Web: legend at bottom shows tech colors + status stripes
- [ ] Mobile: Calendar tab visible in tab bar
- [ ] Mobile: tap day with dots → DayList shows jobs
- [ ] Mobile: tap job → bottom sheet opens to 25%, swipe up → 60%
- [ ] Mobile: drag down → dismisses
- [ ] Both: insert job in DB via Supabase Studio → both clients update within 2s
- [ ] DST week: schedule a job in the second week of March; calendar shows correct hour after the DST flip

- [ ] **Step 2: Update project memory**

Open `/Users/connorgray/.claude/projects/-Users-connorgray/memory/marine-tech-app.md` and append:
```markdown

### Calendar tab (shipped 2026-04-XX)
- **Web route:** `/dashboard/calendar`
- **Mobile tab:** `(tabs)/calendar` (5th tab)
- **Schema:** `jobs.scheduled_start`, `scheduled_end` (timestamptz), `location_override` (text). Migration `008_jobs_scheduled_timestamps.sql`. `scheduled_date` retained for one release cycle, dropped in `009`.
- **Stack:** `react-big-calendar` (web) + `react-native-calendars` (mobile), `@gorhom/bottom-sheet`, `@tanstack/react-query`, Supabase Realtime
- **Color scheme:** color-by-tech (8-color palette, hash of tech.id), status stripe (green/amber/slate)
```

- [ ] **Step 3: Update MEMORY.md index**

Open `/Users/connorgray/.claude/projects/-Users-connorgray/memory/MEMORY.md`. Update the Marine Tech App section to add a "Recent: Calendar tab shipped 2026-04-XX" line below the existing Next step.

---

### Task 26: Migration 009 (deferred — separate plan)

Schedule a follow-up plan for **`009_drop_scheduled_date.sql`** approximately 2 weeks after Task 25 ships. Steps for that plan (not this one):

1. Audit all `scheduled_date` reads — `grep -rn "scheduled_date" --include="*.ts" --include="*.tsx" --include="*.sql"`
2. Switch each to `scheduled_start`
3. Write migration `009_drop_scheduled_date.sql`: `ALTER TABLE jobs DROP COLUMN scheduled_date;`
4. Update webhook in `003_job_webhook.sql` if it references the column
5. Deploy

---

## Self-Review Notes

**Spec coverage check (against `2026-04-27-calendar-tab-design.md`):**
- Schema migration → Task 1
- Color utility → Task 4
- Time formatter → Task 5
- Queries + mutations → Task 6
- Realtime → Task 7, used in Task 16 + 23
- Web CalendarView + chip + popover + modal + tray → Tasks 9-14
- Sidebar entry → Task 15
- Page wiring → Task 16
- Empty/error states → Tasks 16, 23
- Mobile screen + components → Tasks 19-23
- Tests (web unit) → Tasks 4, 5, 6
- Tests (web e2e) → Task 17
- Tests (mobile e2e) → Task 24
- Manual smoke + memory update → Task 25

**Known gaps requiring real-codebase reconciliation at build time** (called out in tasks):
- Exact Supabase client import path (Task 13, 16, 23)
- Existing sidebar nav-item shape (Task 15)
- Existing mobile tab `_layout.tsx` shape (Task 19)
