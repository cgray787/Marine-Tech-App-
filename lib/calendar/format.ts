import type { CalendarJob } from './types';
import { differenceInCalendarDays, parseISO } from 'date-fns';

function toDate(input: Date | string | null): Date | null {
  if (input == null) return null;
  return input instanceof Date ? input : new Date(input);
}

export function formatTime(input: Date | string | null): string {
  const d = toDate(input);
  if (!d) return '';
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return minutes === 0
    ? `${hours} ${period}`
    : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function formatTimeRange(
  start: Date | string | null,
  end: Date | string | null,
): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return '';
  if (!e) return formatTime(s);
  const sPeriod = s.getHours() >= 12 ? 'PM' : 'AM';
  const ePeriod = e.getHours() >= 12 ? 'PM' : 'AM';
  if (sPeriod === ePeriod) {
    const sFmt = formatTime(s).replace(` ${sPeriod}`, '');
    return `${sFmt}-${formatTime(e)}`;
  }
  return `${formatTime(s)} - ${formatTime(e)}`;
}

export function isMultiDay(job: CalendarJob): boolean {
  if (!job.scheduledStart || !job.scheduledEndDate) return false;
  const startDate = job.scheduledStart.slice(0, 10);
  return job.scheduledEndDate > startDate;
}

export function dayOfN(
  selectedDate: string,         // 'yyyy-MM-dd' in local TZ
  startIso: string,             // full ISO from scheduled_start
  endDate: string,              // 'yyyy-MM-dd' from scheduled_end_date
): { day: number; total: number } {
  const startDate = startIso.slice(0, 10);
  const total = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
  const day   = differenceInCalendarDays(parseISO(selectedDate), parseISO(startDate)) + 1;
  return { day, total };
}
