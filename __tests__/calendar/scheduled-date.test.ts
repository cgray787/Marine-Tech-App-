// Pin the browser's timezone: the bug only exists west of UTC, in the evening.
process.env.TZ = 'America/Los_Angeles';

import { expect, it, vi } from 'vitest';
import { createJob, updateJob } from '@/lib/calendar/queries';

// scheduled_date was scheduledStart.slice(0, 10) — the UTC date. A job set for
// Mon Sep 28 at 6:00 PM in Seattle (2026-09-29T01:00Z) was stamped 2026-09-29.
function fakeSupabase() {
  const sent: Record<string, unknown>[] = [];
  const chain = { select: () => chain, eq: () => chain, single: async () => ({ data: { id: 'j1', status: 'new' }, error: null }) };
  return {
    sent,
    client: { from: () => ({
      insert: (p: Record<string, unknown>) => { sent.push(p); return chain; },
      update: (p: Record<string, unknown>) => { sent.push(p); return chain; },
    }) } as any,
  };
}

const sixPm = new Date(2026, 8, 28, 18, 0).toISOString();

it('stamps an evening job with the LOCAL day on create and on reschedule', async () => {
  expect(sixPm).toBe('2026-09-29T01:00:00.000Z'); // UTC date is the 29th…
  const { sent, client } = fakeSupabase();
  await createJob(client, { customerId: 'c1', boatId: null, scheduledStart: sixPm });
  await updateJob(client, { id: 'j1', scheduledStart: sixPm });
  expect(sent.map((p) => p.scheduled_date)).toEqual(['2026-09-28', '2026-09-28']); // …but it's a Sep 28 job
});

it('still clears scheduled_date when a job is unscheduled', async () => {
  const { sent, client } = fakeSupabase();
  await updateJob(client, { id: 'j1', scheduledStart: null });
  expect(sent[0].scheduled_date).toBeNull();
});

vi.restoreAllMocks();
