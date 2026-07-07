import { describe, it, expect } from 'vitest';
import {
  techColor,
  clientColor,
  statusStripeColor,
  TECH_PALETTE,
  CLIENT_PALETTE,
} from '@/lib/calendar/colors';

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

describe('clientColor', () => {
  it('returns a hex from the client palette for a real id', () => {
    expect(CLIENT_PALETTE).toContain(clientColor('client-abc-123'));
  });

  it('is deterministic for the same client id', () => {
    expect(clientColor('client-abc')).toBe(clientColor('client-abc'));
  });

  it('spreads a set of ids across most of the 5-color palette', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `client-${i}-${Math.random()}`);
    const colors = new Set(ids.map((id) => clientColor(id)));
    // Deterministic hash over 50 ids should touch nearly all 5 buckets.
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });

  it('falls back to a neutral color (outside the palette) when there is no client', () => {
    const fallback = clientColor(null);
    expect(clientColor(undefined)).toBe(fallback);
    expect(clientColor('')).toBe(fallback);
    expect(CLIENT_PALETTE).not.toContain(fallback);
    expect(fallback).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('statusStripeColor', () => {
  it('maps each status to its hex', () => {
    expect(statusStripeColor('new')).toBe('#4ade80');
    expect(statusStripeColor('in_progress')).toBe('#f59e0b');
    expect(statusStripeColor('completed')).toBe('#94a3b8');
  });
});
