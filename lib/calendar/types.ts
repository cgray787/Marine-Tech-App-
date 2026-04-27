export type JobStatus = 'new' | 'in_progress' | 'completed';

export type CalendarJob = {
  id: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: JobStatus;
  notes: string | null;
  locationOverride: string | null;
  customer: { id: string; name: string } | null;
  boat: { id: string; name: string; makeModel: string | null } | null;
  marina: { id: string; name: string } | null;
  tech: { id: string; fullName: string } | null;
};

export type CalendarRange = { startUtc: string; endUtc: string };

export type CalendarView = 'month' | 'week' | 'day';
