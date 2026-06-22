export type JobStatus = 'new' | 'in_progress' | 'completed';

export type JobKind = 'service' | 'paperwork';

export type CalendarJob = {
  id: string;
  kind: JobKind;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledEndDate: string | null;
  status: JobStatus;
  notes: string | null;
  locationOverride: string | null;
  // Per-day place overrides for multi-day jobs: { "YYYY-MM-DD": "<place text>" }.
  dayLocations: Record<string, string>;
  customer: { id: string; name: string } | null;
  boat: { id: string; name: string; makeModel: string | null } | null;
  marina: { id: string; name: string } | null;
  tech: { id: string; fullName: string } | null;
};

export type CalendarRange = { startUtc: string; endUtc: string };

export type CalendarView = 'month' | 'week' | 'day';
