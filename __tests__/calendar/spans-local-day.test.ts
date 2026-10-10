// Pin the browser's timezone: the bug only exists west of UTC, in the evening.
process.env.TZ = 'America/Los_Angeles';

import { expect, it } from 'vitest';
import { format } from 'date-fns';
import { jobDays, jobsForDay } from '@/lib/calendar/spans';

// The calendar page selects days with format(selectedDay, 'yyyy-MM-dd') — the
// LOCAL day — but jobDays took scheduledStart.slice(0, 10), the UTC day. A job
// at 5:30 PM on Oct 10 (2026-10-11T00:30Z) vanished from Oct 10's panel.
const evening = new Date(2026, 9, 10, 17, 30).toISOString();
const job = { id: 'j1', scheduledStart: evening, scheduledEndDate: null } as any;

it('puts an evening job on the local day the operator clicks', () => {
  expect(evening).toBe('2026-10-11T00:30:00.000Z');
  const clicked = format(new Date(2026, 9, 10), 'yyyy-MM-dd');
  expect(jobDays(job)).toEqual(['2026-10-10']);
  expect(jobsForDay([job], clicked)).toHaveLength(1);
});

it('spans a multi-day evening start through its end date', () => {
  expect(jobDays({ ...job, scheduledEndDate: '2026-10-12' })).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
});
