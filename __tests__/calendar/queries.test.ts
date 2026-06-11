import { describe, it, expect } from 'vitest';
import { mapJobRowToCalendarJob } from '@/lib/calendar/queries';

describe('mapJobRowToCalendarJob', () => {
  it('maps a fully-populated row', () => {
    const row = {
      id: 'job-1',
      scheduled_start: '2026-04-27T17:00:00Z',
      scheduled_end: '2026-04-27T18:00:00Z',
      scheduled_end_date: '2026-04-28',
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
      scheduledEndDate: '2026-04-28',
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
