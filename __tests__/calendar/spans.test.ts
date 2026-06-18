import { describe, it, expect } from 'vitest';
import { jobDays, jobsForDay, jobsForWeek } from '@/lib/calendar/spans';
import type { CalendarJob } from '@/lib/calendar/types';

function job(overrides: Partial<CalendarJob>): CalendarJob {
  return {
    id: 'job',
    scheduledStart: null,
    scheduledEnd: null,
    scheduledEndDate: null,
    status: 'new',
    notes: null,
    locationOverride: null,
    customer: null,
    boat: null,
    marina: null,
    tech: null,
    ...overrides,
  };
}

describe('jobDays', () => {
  it('single-day job → just the start day', () => {
    expect(jobDays({ scheduledStart: '2026-06-18T17:00:00Z', scheduledEndDate: null })).toEqual([
      '2026-06-18',
    ]);
  });

  it('multi-day job → every day inclusive, start → scheduled_end_date', () => {
    expect(
      jobDays({ scheduledStart: '2026-06-18T17:00:00Z', scheduledEndDate: '2026-06-21' }),
    ).toEqual(['2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21']);
  });

  it('null end date → single day', () => {
    expect(jobDays({ scheduledStart: '2026-06-18T08:00:00Z', scheduledEndDate: null })).toEqual([
      '2026-06-18',
    ]);
  });

  it('end date == start day → single day', () => {
    expect(
      jobDays({ scheduledStart: '2026-06-18T08:00:00Z', scheduledEndDate: '2026-06-18' }),
    ).toEqual(['2026-06-18']);
  });

  it('end date < start day → single day (ignores the bad end)', () => {
    expect(
      jobDays({ scheduledStart: '2026-06-18T08:00:00Z', scheduledEndDate: '2026-06-15' }),
    ).toEqual(['2026-06-18']);
  });

  it('unscheduled (no start) → []', () => {
    expect(jobDays({ scheduledStart: null, scheduledEndDate: null })).toEqual([]);
    expect(jobDays({ scheduledStart: null, scheduledEndDate: '2026-06-21' })).toEqual([]);
  });

  it('spans across a month boundary', () => {
    expect(
      jobDays({ scheduledStart: '2026-06-29T12:00:00Z', scheduledEndDate: '2026-07-02' }),
    ).toEqual(['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02']);
  });
});

describe('jobsForDay', () => {
  const single = job({ id: 'a', scheduledStart: '2026-06-18T17:00:00Z' });
  const multi = job({
    id: 'b',
    scheduledStart: '2026-06-17T09:00:00Z',
    scheduledEndDate: '2026-06-19',
  });
  const elsewhere = job({ id: 'c', scheduledStart: '2026-06-25T09:00:00Z' });

  it('includes single-day jobs on their day, with dayIndex/dayCount 1/1', () => {
    const result = jobsForDay([single, elsewhere], '2026-06-18');
    expect(result.map((j) => j.id)).toEqual(['a']);
    expect(result[0].dayIndex).toBe(1);
    expect(result[0].dayCount).toBe(1);
  });

  it('includes a multi-day job on every spanned day with correct Day N of M', () => {
    expect(jobsForDay([multi], '2026-06-17')[0]).toMatchObject({ dayIndex: 1, dayCount: 3 });
    expect(jobsForDay([multi], '2026-06-18')[0]).toMatchObject({ dayIndex: 2, dayCount: 3 });
    expect(jobsForDay([multi], '2026-06-19')[0]).toMatchObject({ dayIndex: 3, dayCount: 3 });
    expect(jobsForDay([multi], '2026-06-20')).toEqual([]);
  });

  it('sorts by start time', () => {
    const late = job({ id: 'late', scheduledStart: '2026-06-18T19:00:00Z' });
    const early = job({ id: 'early', scheduledStart: '2026-06-18T07:00:00Z' });
    expect(jobsForDay([late, early], '2026-06-18').map((j) => j.id)).toEqual(['early', 'late']);
  });

  it('excludes unscheduled jobs', () => {
    const un = job({ id: 'un', scheduledStart: null });
    expect(jobsForDay([un], '2026-06-18')).toEqual([]);
  });
});

describe('jobsForWeek', () => {
  // Week: 2026-06-14 (Sun) → 2026-06-20 (Sat)
  const start = '2026-06-14';
  const end = '2026-06-20';

  it('includes jobs whose span intersects the week', () => {
    const inside = job({ id: 'in', scheduledStart: '2026-06-16T09:00:00Z' });
    const before = job({ id: 'before', scheduledStart: '2026-06-10T09:00:00Z' });
    const after = job({ id: 'after', scheduledStart: '2026-06-25T09:00:00Z' });
    // multi-day job that starts before the week but spans into it
    const spanning = job({
      id: 'span',
      scheduledStart: '2026-06-12T09:00:00Z',
      scheduledEndDate: '2026-06-15',
    });
    const result = jobsForWeek([inside, before, after, spanning], start, end);
    expect(result.map((j) => j.id).sort()).toEqual(['in', 'span']);
  });

  it('returns each job once (no duplicates for multi-day spans within the week)', () => {
    const multi = job({
      id: 'm',
      scheduledStart: '2026-06-15T09:00:00Z',
      scheduledEndDate: '2026-06-18',
    });
    const result = jobsForWeek([multi], start, end);
    expect(result.filter((j) => j.id === 'm')).toHaveLength(1);
  });

  it('excludes unscheduled jobs', () => {
    const un = job({ id: 'un', scheduledStart: null });
    expect(jobsForWeek([un], start, end)).toEqual([]);
  });

  it('sorts by start time', () => {
    const late = job({ id: 'late', scheduledStart: '2026-06-19T09:00:00Z' });
    const early = job({ id: 'early', scheduledStart: '2026-06-15T09:00:00Z' });
    expect(jobsForWeek([late, early], start, end).map((j) => j.id)).toEqual(['early', 'late']);
  });
});
