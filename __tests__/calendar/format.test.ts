import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeRange } from '@/lib/calendar/format';
import { isMultiDay } from '@/lib/calendar/format';
import type { CalendarJob } from '@/lib/calendar/types';

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

  it('handles noon-PM same-period range', () => {
    expect(formatTimeRange('2026-04-27T12:00:00', '2026-04-27T13:00:00')).toBe('12-1 PM');
  });

  it('handles midnight-AM same-period range', () => {
    expect(formatTimeRange('2026-04-27T00:00:00', '2026-04-27T01:00:00')).toBe('12-1 AM');
  });

  it('handles cross-midnight (PM to AM)', () => {
    expect(formatTimeRange('2026-04-27T23:00:00', '2026-04-28T01:00:00')).toBe('11 PM - 1 AM');
  });
});

const makeJob = (overrides: Partial<CalendarJob> = {}): CalendarJob => ({
  id: 'j1',
  scheduledStart: '2026-03-04T10:00:00Z',
  scheduledEnd: '2026-03-04T11:00:00Z',
  scheduledEndDate: null,
  status: 'new',
  notes: null,
  locationOverride: null,
  customer: null,
  boat: null,
  marina: null,
  tech: null,
  ...overrides,
});

describe('isMultiDay', () => {
  it('returns false when scheduledEndDate is null', () => {
    expect(isMultiDay(makeJob({ scheduledEndDate: null }))).toBe(false);
  });

  it('returns false when scheduledStart is null', () => {
    expect(isMultiDay(makeJob({ scheduledStart: null, scheduledEndDate: '2026-03-05' }))).toBe(false);
  });

  it('returns false when end date equals start date', () => {
    expect(
      isMultiDay(makeJob({ scheduledStart: '2026-03-04T10:00:00Z', scheduledEndDate: '2026-03-04' })),
    ).toBe(false);
  });

  it('returns true when end date is after start date', () => {
    expect(
      isMultiDay(makeJob({ scheduledStart: '2026-03-04T10:00:00Z', scheduledEndDate: '2026-03-06' })),
    ).toBe(true);
  });
});
