// Pin the phone's timezone: the bug only exists west of UTC, in the evening.
process.env.TZ = 'America/Los_Angeles';

import { expect, it } from 'vitest';
import { localScheduledDate } from '../../mobile/lib/calendar/queries';

// scheduled_date was scheduledStart.slice(0, 10) — the UTC date. A job picked
// for Mon Sep 28 at 6:00 PM in Seattle (2026-09-29T01:00Z) was stamped
// 2026-09-29, so Job Details and client history showed the next day.
it('stamps an evening job with the LOCAL day it was scheduled for', () => {
  const sixPm = new Date(2026, 8, 28, 18, 0).toISOString();
  expect(sixPm).toBe('2026-09-29T01:00:00.000Z');          // the UTC date is the 29th…
  expect(localScheduledDate(sixPm)).toBe('2026-09-28');    // …but it is a Sep 28 job
});

it('leaves morning jobs and the winter cut-off on the right day', () => {
  expect(localScheduledDate(new Date(2026, 8, 28, 9, 0).toISOString())).toBe('2026-09-28');
  expect(localScheduledDate(new Date(2026, 11, 15, 16, 30).toISOString())).toBe('2026-12-15'); // PST, 00:30Z next day
  expect(localScheduledDate(new Date(2026, 8, 28, 23, 59).toISOString())).toBe('2026-09-28');
});
