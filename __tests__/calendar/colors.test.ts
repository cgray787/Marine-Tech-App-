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
