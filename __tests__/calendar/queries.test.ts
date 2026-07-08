import { describe, it, expect } from 'vitest';
import { mapJobRowToCalendarJob, getJobsInRange } from '@/lib/calendar/queries';

// Minimal chainable stand-in for the Supabase query builder. Each `.from('jobs')`
// starts a fresh builder that records its select string + filters; awaiting it
// (via `.then`) resolves to the service or paperwork rows depending on whether a
// `kind = 'paperwork'` filter was applied. `captured` collects every builder's
// final state so tests can assert on the filters that were built.
function makeSupabaseMock(
  rows: { service: any[]; paperwork: any[] },
  captured: any[],
) {
  return {
    from() {
      const state: any = { select: '', eqs: [] as [string, any][], ors: [] as string[] };
      const builder: any = {
        select(s: string) { state.select = s; return builder; },
        gte() { return builder; },
        lte() { return builder; },
        order() { return builder; },
        is() { return builder; },
        eq(col: string, val: any) { state.eqs.push([col, val]); return builder; },
        or(clause: string) { state.ors.push(clause); return builder; },
        then(resolve: any, reject: any) {
          captured.push(state);
          const isPaperwork = state.eqs.some(
            ([c, v]: [string, any]) => c === 'kind' && v === 'paperwork',
          );
          return Promise.resolve({
            data: isPaperwork ? rows.paperwork : rows.service,
            error: null,
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

describe('mapJobRowToCalendarJob', () => {
  it('maps a fully-populated row', () => {
    const row = {
      id: 'job-1',
      kind: 'service',
      scheduled_start: '2026-04-27T17:00:00Z',
      scheduled_end: '2026-04-27T18:00:00Z',
      scheduled_end_date: '2026-04-28',
      status: 'new',
      notes: 'oil change',
      location_override: null,
      day_locations: { '2026-04-27': 'Shilshole', '2026-04-28': 'Edmonds' },
      customer: { id: 'c1', name: 'J. Smith' },
      boat: { id: 'b1', name: 'Sea Ray 32', make_model: 'Sea Ray Sundancer' },
      marina: { id: 'm1', name: 'Shilshole Marina' },
      tech: { id: 't1', full_name: 'Mike Rivera' },
    };
    expect(mapJobRowToCalendarJob(row)).toEqual({
      id: 'job-1',
      kind: 'service',
      scheduledStart: '2026-04-27T17:00:00Z',
      scheduledEnd: '2026-04-27T18:00:00Z',
      scheduledEndDate: '2026-04-28',
      status: 'new',
      notes: 'oil change',
      locationOverride: null,
      dayLocations: { '2026-04-27': 'Shilshole', '2026-04-28': 'Edmonds' },
      customer: { id: 'c1', name: 'J. Smith' },
      boat: { id: 'b1', name: 'Sea Ray 32', makeModel: 'Sea Ray Sundancer' },
      marina: { id: 'm1', name: 'Shilshole Marina' },
      tech: { id: 't1', fullName: 'Mike Rivera' },
    });
  });

  it('defaults kind to service and dayLocations to {} when absent (paperwork mapping too)', () => {
    const service = mapJobRowToCalendarJob({ id: 'j', status: 'new' });
    expect(service.kind).toBe('service');
    expect(service.dayLocations).toEqual({});

    const paperwork = mapJobRowToCalendarJob({
      id: 'p',
      kind: 'paperwork',
      status: 'new',
      notes: 'Invoicing',
      customer: null,
      boat: null,
    });
    expect(paperwork.kind).toBe('paperwork');
    expect(paperwork.customer).toBeNull();
    expect(paperwork.notes).toBe('Invoicing');
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

describe('getJobsInRange with an office filter', () => {
  const start = '2026-07-01T00:00:00Z';
  const end = '2026-08-01T00:00:00Z';
  const serviceRow = {
    id: 's1',
    kind: 'service',
    status: 'new',
    scheduled_start: '2026-07-06T10:00:00Z',
    customer: { id: 'c1', name: 'I. Vishnia' },
  };
  const paperworkRow = {
    id: 'p1',
    kind: 'paperwork',
    status: 'new',
    scheduled_start: '2026-07-06T07:00:00Z',
    customer: null,
    notes: 'Month ends',
  };

  it('fetches paperwork separately and merges it so the office filter cannot hide it', async () => {
    const captured: any[] = [];
    const supabase = makeSupabaseMock({ service: [serviceRow], paperwork: [paperworkRow] }, captured);

    const jobs = await getJobsInRange(supabase as any, start, end, undefined, 'seattle-loc-id');
    const ids = jobs.map((j) => j.id);

    // Both the client-scoped service job AND the clientless paperwork block come back.
    expect(ids).toContain('s1');
    expect(ids).toContain('p1');
    // Merged result is ordered by scheduled_start (paperwork 07:00 before service 10:00).
    expect(jobs[0].id).toBe('p1');

    // Two queries ran: one inner-joined on the customer's location, one for paperwork
    // scoped by jobs.location_id (including NULL so office-less paperwork still shows).
    const serviceState = captured.find((s) => s.select.includes('!inner'));
    const paperworkState = captured.find((s) =>
      s.eqs.some(([c, v]: [string, any]) => c === 'kind' && v === 'paperwork'),
    );
    expect(serviceState.eqs).toContainEqual(['customer.location_id', 'seattle-loc-id']);
    expect(paperworkState.ors).toContain('location_id.eq.seattle-loc-id,location_id.is.null');
  });

  it('uses a single plain query (no inner join) when no office filter is set', async () => {
    const captured: any[] = [];
    const supabase = makeSupabaseMock(
      { service: [serviceRow, paperworkRow], paperwork: [] },
      captured,
    );

    const jobs = await getJobsInRange(supabase as any, start, end, undefined, undefined);

    expect(jobs.map((j) => j.id).sort()).toEqual(['p1', 's1']);
    // Only one query, and it must not inner-join (which would drop paperwork).
    expect(captured).toHaveLength(1);
    expect(captured[0].select).not.toContain('!inner');
  });
});
