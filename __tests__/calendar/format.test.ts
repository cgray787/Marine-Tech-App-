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
