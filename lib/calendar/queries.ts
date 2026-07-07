import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarJob, JobKind, JobStatus } from './types';

const SELECT = `
  id, kind, scheduled_start, scheduled_end, scheduled_end_date, status, notes, location_override, day_locations,
  customer:customers(id, name),
  boat:boats(id, name, make_model),
  marina:marinas(id, name),
  tech:profiles!assigned_to(id, full_name)
`;

/**
 * Jobs follow their customer's office, so the office filter needs an inner
 * join on the embedded customer (a plain embed would only null the customer
 * out instead of dropping the row). Exported for tests.
 */
export function calendarSelect(locationScoped: boolean): string {
  return locationScoped
    ? SELECT.replace(
        'customer:customers(id, name)',
        'customer:customers!inner(id, name, location_id)'
      )
    : SELECT;
}

type Rel<T> = T | T[] | null;

function unwrap<T>(rel: Rel<T>): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

export function mapJobRowToCalendarJob(row: any): CalendarJob {
  const customer = unwrap<{ id: string; name: string }>(row.customer);
  const boatRaw = unwrap<{ id: string; name: string; make_model: string | null }>(row.boat);
  const marina = unwrap<{ id: string; name: string }>(row.marina);
  const techRaw = unwrap<{ id: string; full_name: string }>(row.tech);
  return {
    id: row.id,
    kind: (row.kind ?? 'service') as JobKind,
    scheduledStart: row.scheduled_start ?? null,
    scheduledEnd: row.scheduled_end ?? null,
    scheduledEndDate: row.scheduled_end_date ?? null,
    status: row.status as JobStatus,
    notes: row.notes ?? null,
    locationOverride: row.location_override ?? null,
    dayLocations:
      row.day_locations && typeof row.day_locations === 'object' ? row.day_locations : {},
    customer: customer ? { id: customer.id, name: customer.name } : null,
    boat: boatRaw
      ? { id: boatRaw.id, name: boatRaw.name, makeModel: boatRaw.make_model ?? null }
      : null,
    marina: marina ? { id: marina.id, name: marina.name } : null,
    tech: techRaw ? { id: techRaw.id, fullName: techRaw.full_name } : null,
  };
}

/**
 * PostgREST `.or()` clause selecting paperwork for an office filter: paperwork
 * carries its own `jobs.location_id` (set from the assigned tech by the
 * set_paperwork_location trigger). We include `location_id IS NULL` so an
 * unassigned / office-less paperwork block shows under every office instead of
 * silently vanishing.
 */
function paperworkLocationOr(locationId: string): string {
  return `location_id.eq.${locationId},location_id.is.null`;
}

export async function getJobsInRange(
  supabase: SupabaseClient,
  startUtc: string,
  endUtc: string,
  techId?: string,
  locationId?: string,
): Promise<CalendarJob[]> {
  // Range + optional tech filter, applied to whichever select we run.
  const withScope = <T>(q: T): T => {
    let qq = (q as any)
      .gte('scheduled_start', startUtc)
      .lte('scheduled_start', endUtc)
      .order('scheduled_start');
    if (techId) qq = qq.eq('assigned_to', techId);
    return qq;
  };

  if (!locationId) {
    // No office filter: a single plain (LEFT-join) query already includes
    // clientless paperwork blocks.
    const { data, error } = await withScope(supabase.from('jobs').select(SELECT));
    if (error) throw error;
    return (data ?? []).map(mapJobRowToCalendarJob);
  }

  // Office filter active. Service jobs follow their customer's office via an
  // INNER join on the embedded customer — but that inner join drops clientless
  // paperwork blocks (customer_id IS NULL). Fetch paperwork separately by its
  // own jobs.location_id and merge, so scheduled paperwork isn't hidden by the
  // office filter.
  const [service, paperwork] = await Promise.all([
    withScope(supabase.from('jobs').select(calendarSelect(true))).eq(
      'customer.location_id',
      locationId,
    ),
    withScope(supabase.from('jobs').select(SELECT))
      .eq('kind', 'paperwork')
      .or(paperworkLocationOr(locationId)),
  ]);
  if (service.error) throw service.error;
  if (paperwork.error) throw paperwork.error;
  return [...(service.data ?? []), ...(paperwork.data ?? [])]
    .map(mapJobRowToCalendarJob)
    .sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));
}

export async function getUnscheduledJobs(
  supabase: SupabaseClient,
  techId?: string,
  locationId?: string,
): Promise<CalendarJob[]> {
  const withScope = <T>(q: T): T => {
    let qq = (q as any).is('scheduled_start', null).order('created_at');
    if (techId) qq = qq.eq('assigned_to', techId);
    return qq;
  };

  // Push jobs with no linked client to the end. JS Array.sort is stable, so
  // client-bearing jobs keep their existing created_at order.
  const clientsFirst = (jobs: CalendarJob[]) =>
    jobs.sort((a, b) => (a.customer ? 0 : 1) - (b.customer ? 0 : 1));

  if (!locationId) {
    const { data, error } = await withScope(supabase.from('jobs').select(SELECT));
    if (error) throw error;
    return clientsFirst((data ?? []).map(mapJobRowToCalendarJob));
  }

  // Same office-filter split as getJobsInRange: paperwork has no customer to
  // scope through, so fetch it by jobs.location_id and merge.
  const [service, paperwork] = await Promise.all([
    withScope(supabase.from('jobs').select(calendarSelect(true))).eq(
      'customer.location_id',
      locationId,
    ),
    withScope(supabase.from('jobs').select(SELECT))
      .eq('kind', 'paperwork')
      .or(paperworkLocationOr(locationId)),
  ]);
  if (service.error) throw service.error;
  if (paperwork.error) throw paperwork.error;
  return clientsFirst(
    [...(service.data ?? []), ...(paperwork.data ?? [])].map(mapJobRowToCalendarJob),
  );
}

export type CreateJobInput = {
  // Paperwork blocks have no client/boat, so both are nullable.
  customerId: string | null;
  boatId: string | null;
  kind?: JobKind;
  marinaId?: string | null;
  locationOverride?: string | null;
  assignedTo?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  // Date-only string (YYYY-MM-DD) for multi-day end. Mirrors the
  // scheduled_end_date column so the portal calendar renders spans correctly.
  scheduledEndDate?: string | null;
  // Per-day place overrides for multi-day jobs: { "YYYY-MM-DD": "<place>" }.
  dayLocations?: Record<string, string> | null;
  serviceTypes?: string[];
  notes?: string | null;
};

export async function createJob(supabase: SupabaseClient, input: CreateJobInput) {
  const payload = {
    customer_id: input.customerId,
    boat_id: input.boatId,
    kind: input.kind ?? 'service',
    marina_id: input.marinaId ?? null,
    location_override: input.locationOverride ?? null,
    assigned_to: input.assignedTo ?? null,
    scheduled_start: input.scheduledStart ?? null,
    scheduled_end: input.scheduledEnd ?? null,
    scheduled_date: input.scheduledStart ? input.scheduledStart.slice(0, 10) : null,
    scheduled_end_date: input.scheduledEndDate ?? null,
    day_locations: input.dayLocations ?? {},
    service_types: input.serviceTypes ?? [],
    notes: input.notes ?? null,
    status: 'new' as JobStatus,
  };
  const { data, error } = await supabase.from('jobs').insert(payload).select(SELECT).single();
  if (error) throw error;
  return mapJobRowToCalendarJob(data);
}

export type UpdateJobInput = Partial<CreateJobInput> & { id: string };

export async function updateJob(supabase: SupabaseClient, input: UpdateJobInput) {
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = {};
  if ('customerId' in rest) payload.customer_id = rest.customerId;
  if ('boatId' in rest) payload.boat_id = rest.boatId;
  if ('kind' in rest) payload.kind = rest.kind;
  if ('marinaId' in rest) payload.marina_id = rest.marinaId;
  if ('locationOverride' in rest) payload.location_override = rest.locationOverride;
  if ('assignedTo' in rest) payload.assigned_to = rest.assignedTo;
  if ('scheduledStart' in rest) {
    payload.scheduled_start = rest.scheduledStart;
    payload.scheduled_date = rest.scheduledStart ? rest.scheduledStart.slice(0, 10) : null;
  }
  if ('scheduledEnd' in rest) payload.scheduled_end = rest.scheduledEnd;
  if ('scheduledEndDate' in rest) payload.scheduled_end_date = rest.scheduledEndDate;
  if ('dayLocations' in rest) payload.day_locations = rest.dayLocations ?? {};
  if ('serviceTypes' in rest) payload.service_types = rest.serviceTypes;
  if ('notes' in rest) payload.notes = rest.notes;

  const { data, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return mapJobRowToCalendarJob(data);
}
