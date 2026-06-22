import type { CalendarJob } from "./types";

/** Hard cap so a bad/huge scheduled_end_date can never spin the day loop. */
const MAX_SPAN_DAYS = 60;

/**
 * Every calendar day (yyyy-MM-dd) a job occupies.
 * Span = the start day → scheduled_end_date (inclusive). A job with no end date
 * (or an end <= start) is a single day. Unscheduled jobs return [].
 *
 * Day strings are sliced/iterated in UTC to match how MonthCalendar derives the
 * day (j.scheduledStart.slice(0,10)), so the markers and the lists agree.
 */
export function jobDays(job: Pick<CalendarJob, "scheduledStart" | "scheduledEndDate">): string[] {
  if (!job.scheduledStart) return [];
  const start = job.scheduledStart.slice(0, 10);
  const end =
    job.scheduledEndDate && job.scheduledEndDate > start ? job.scheduledEndDate : start;
  if (end === start) return [start];

  const days: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (isNaN(cur.getTime()) || isNaN(last.getTime())) return [start];
  let guard = 0;
  while (cur <= last && guard < MAX_SPAN_DAYS) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }
  return days;
}

/**
 * The place a job is at on a given day (yyyy-MM-dd). For multi-day jobs the
 * per-day `day_locations` override wins; otherwise it falls back to the job's
 * single marina, then its free-text location override. Returns null if unknown.
 */
export function placeForDay(
  job: Pick<CalendarJob, "dayLocations" | "marina" | "locationOverride">,
  day: string,
): string | null {
  return job.dayLocations?.[day] ?? job.marina?.name ?? job.locationOverride ?? null;
}

export type DayJob = CalendarJob & { dayIndex: number; dayCount: number };

/**
 * Jobs occurring on a given day (yyyy-MM-dd), including multi-day jobs that span
 * through it. Each is annotated with dayIndex/dayCount ("Day N of M"). Sorted by
 * start time.
 */
export function jobsForDay(jobs: CalendarJob[], day: string): DayJob[] {
  const out: DayJob[] = [];
  for (const j of jobs) {
    const days = jobDays(j);
    const idx = days.indexOf(day);
    if (idx === -1) continue;
    out.push({ ...j, dayIndex: idx + 1, dayCount: days.length });
  }
  out.sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));
  return out;
}

/**
 * Distinct scheduled jobs whose span intersects [weekStartDay, weekEndDay]
 * (both yyyy-MM-dd, inclusive). Each job appears once. Sorted by start time.
 */
export function jobsForWeek(
  jobs: CalendarJob[],
  weekStartDay: string,
  weekEndDay: string,
): CalendarJob[] {
  return jobs
    .filter((j) => {
      const days = jobDays(j);
      if (days.length === 0) return false;
      // intersect: job's first day <= week end AND job's last day >= week start
      return days[0] <= weekEndDay && days[days.length - 1] >= weekStartDay;
    })
    .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));
}
