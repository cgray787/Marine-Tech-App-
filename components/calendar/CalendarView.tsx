'use client';
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useMemo } from 'react';
import type { CalendarJob, CalendarView as ViewMode } from '@/lib/calendar/types';
import { JobChip } from './JobChip';
import './calendar-overrides.css';

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

type Props = {
  jobs: CalendarJob[];
  view: ViewMode;
  date: Date;
  onNavigate: (date: Date) => void;
  onView: (view: ViewMode) => void;
  onSelectJob: (job: CalendarJob, anchor: HTMLElement) => void;
  /** Optional — pass undefined to disable empty-cell click (read-only viewers). */
  onSelectSlot?: (start: Date, end: Date) => void;
  /** Fired when a day is clicked (empty cell or month date number) — drives the DayFocusPanel. */
  onSelectDay?: (day: Date) => void;
};

export function CalendarView({ jobs, view, date, onNavigate, onView, onSelectJob, onSelectSlot, onSelectDay }: Props) {
  const events = useMemo(
    () =>
      jobs
        .filter((j) => j.scheduledStart)
        .map((j) => {
          const start = new Date(j.scheduledStart!);
          // Multi-day jobs: span the bar across every covered day by ending at
          // end-of-day on scheduled_end_date. Single-day jobs keep their real
          // scheduled_end (or a +1h fallback). scheduled_end_date is a date-only
          // 'yyyy-MM-dd' string; the day part of scheduled_start is its first day.
          const startDay = j.scheduledStart!.slice(0, 10);
          const isMultiDay = !!j.scheduledEndDate && j.scheduledEndDate > startDay;
          const end = isMultiDay
            ? // End-of-day local on the last spanned date so the bar covers it.
              new Date(`${j.scheduledEndDate!}T23:59:59`)
            : new Date(
                j.scheduledEnd ?? new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
              );
          return {
            id: j.id,
            title: '',
            start,
            end,
            allDay: isMultiDay,
            resource: j,
          };
        }),
    [jobs],
  );

  return (
    <Calendar
      localizer={localizer}
      events={events}
      view={view as View}
      date={date}
      onNavigate={onNavigate}
      onView={(v) => onView(v as ViewMode)}
      views={['month', 'week', 'day']}
      popup
      selectable={!!onSelectSlot || !!onSelectDay}
      onSelectSlot={(slotInfo) => {
        onSelectDay?.(slotInfo.start);
        onSelectSlot?.(slotInfo.start, slotInfo.end);
      }}
      // Clicking a month date number drills into the day — use it to focus the
      // DayFocusPanel without forcing a view change (we re-focus, not navigate).
      onDrillDown={onSelectDay ? (day) => onSelectDay(day) : undefined}
      onSelectEvent={(event, e) =>
        onSelectJob(event.resource as CalendarJob, e?.currentTarget as HTMLElement)
      }
      components={{
        event: ({ event }) => (
          <JobChip job={event.resource as CalendarJob} compact={view === 'month'} />
        ),
      }}
      style={{ height: 'calc(100vh - 280px)', minHeight: 600 }}
    />
  );
}
