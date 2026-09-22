export type EditableJob = {
  id: string;
  kind: string;
  customer_id: string | null;
  boat_id: string | null;
  notes: string | null;
  location_override: string | null;
  service_types: string[] | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_end_date: string | null;
};

export type JobDraft = {
  customerId: string | null;
  boatId: string | null;
  notes: string;
  location: string;
  services: string;
  start: string | null;
  end: string | null;
};

export function jobDraft(job: EditableJob): JobDraft {
  return {
    customerId: job.customer_id, boatId: job.boat_id,
    notes: job.notes ?? '', location: job.location_override ?? '',
    services: (job.service_types ?? []).join('\n'),
    start: job.scheduled_start, end: job.scheduled_end,
  };
}

function localDay(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Patch only edited fields. Never complete a job or create/rewrite its report.
export function jobEditPatch(job: EditableJob, draft: JobDraft) {
  const original = jobDraft(job);
  const patch: Record<string, unknown> = {};
  if (draft.customerId !== original.customerId) patch.customer_id = draft.customerId;
  if (draft.boatId !== original.boatId) patch.boat_id = draft.boatId;
  if (draft.notes !== original.notes) patch.notes = draft.notes.trim() || null;
  if (draft.location !== original.location) patch.location_override = draft.location.trim() || null;
  if (draft.services !== original.services) patch.service_types = draft.services.split('\n').map(s => s.trim()).filter(Boolean);
  if (draft.start !== original.start || draft.end !== original.end) {
    if (!draft.start || !draft.end || !Number.isFinite(Date.parse(draft.start)) || !Number.isFinite(Date.parse(draft.end)) || Date.parse(draft.end) <= Date.parse(draft.start)) {
      throw new Error('Choose an end time after the start time.');
    }
    patch.scheduled_start = draft.start;
    patch.scheduled_end = draft.end;
    patch.scheduled_date = localDay(draft.start);
    patch.scheduled_end_date = localDay(draft.end) === localDay(draft.start) ? null : localDay(draft.end);
  }
  return patch;
}
