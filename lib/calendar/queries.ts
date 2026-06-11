import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarJob, JobStatus } from './types';

const SELECT = `
  id, scheduled_start, scheduled_end, scheduled_end_date, status, notes, location_override,
  customer:customers(id, name),
  boat:boats(id, name, make_model),
  marina:marinas(id, name),
  tech:profiles!assigned_to(id, full_name)
`;

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
    scheduledStart: row.scheduled_start ?? null,
    scheduledEnd: row.scheduled_end ?? null,
    scheduledEndDate: row.scheduled_end_date ?? null,
    status: row.status as JobStatus,
    notes: row.notes ?? null,
    locationOverride: row.location_override ?? null,
    customer: customer ? { id: customer.id, name: customer.name } : null,
    boat: boatRaw
      ? { id: boatRaw.id, name: boatRaw.name, makeModel: boatRaw.make_model ?? null }
      : null,
    marina: marina ? { id: marina.id, name: marina.name } : null,
    tech: techRaw ? { id: techRaw.id, fullName: techRaw.full_name } : null,
  };
}

export async function getJobsInRange(
  supabase: SupabaseClient,
  startUtc: string,
  endUtc: string,
  techId?: string,
): Promise<CalendarJob[]> {
  let q = supabase
    .from('jobs')
    .select(SELECT)
    .gte('scheduled_start', startUtc)
    .lte('scheduled_start', endUtc)
    .order('scheduled_start');
  if (techId) q = q.eq('assigned_to', techId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapJobRowToCalendarJob);
}

export async function getUnscheduledJobs(
  supabase: SupabaseClient,
  techId?: string,
): Promise<CalendarJob[]> {
  let q = supabase.from('jobs').select(SELECT).is('scheduled_start', null).order('created_at');
  if (techId) q = q.eq('assigned_to', techId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapJobRowToCalendarJob);
}

export type CreateJobInput = {
  customerId: string;
  boatId: string;
  marinaId?: string | null;
  locationOverride?: string | null;
  assignedTo?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  // Date-only string (YYYY-MM-DD) for multi-day end. Mirrors the
  // scheduled_end_date column so the portal calendar renders spans correctly.
  scheduledEndDate?: string | null;
  serviceTypes?: string[];
  notes?: string | null;
};

export async function createJob(supabase: SupabaseClient, input: CreateJobInput) {
  const payload = {
    customer_id: input.customerId,
    boat_id: input.boatId,
    marina_id: input.marinaId ?? null,
    location_override: input.locationOverride ?? null,
    assigned_to: input.assignedTo ?? null,
    scheduled_start: input.scheduledStart ?? null,
    scheduled_end: input.scheduledEnd ?? null,
    scheduled_date: input.scheduledStart ? input.scheduledStart.slice(0, 10) : null,
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
  if ('marinaId' in rest) payload.marina_id = rest.marinaId;
  if ('locationOverride' in rest) payload.location_override = rest.locationOverride;
  if ('assignedTo' in rest) payload.assigned_to = rest.assignedTo;
  if ('scheduledStart' in rest) {
    payload.scheduled_start = rest.scheduledStart;
    payload.scheduled_date = rest.scheduledStart ? rest.scheduledStart.slice(0, 10) : null;
  }
  if ('scheduledEnd' in rest) payload.scheduled_end = rest.scheduledEnd;
  if ('scheduledEndDate' in rest) payload.scheduled_end_date = rest.scheduledEndDate;
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
