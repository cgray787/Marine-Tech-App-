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
};

export function CalendarView({ jobs, view, date, onNavigate, onView, onSelectJob, onSelectSlot }: Props) {
  const events = useMemo(
    () =>
      jobs
        .filter((j) => j.scheduledStart)
        .map((j) => ({
          id: j.id,
          title: '',
          start: new Date(j.scheduledStart!),
          end: new Date(
            j.scheduledEnd ??
              new Date(new Date(j.scheduledStart!).getTime() + 60 * 60 * 1000).toISOString(),
          ),
          resource: j,
        })),
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
      selectable={!!onSelectSlot}
      onSelectSlot={(slotInfo) => onSelectSlot?.(slotInfo.start, slotInfo.end)}
      onSelectEvent={(event, e) =>
        onSelectJob(event.resource as CalendarJob, e?.currentTarget as HTMLElement)
      }
      components={{
        event: ({ event }) => <JobChip job={event.resource as CalendarJob} />,
      }}
      style={{ height: 'calc(100vh - 280px)', minHeight: 600 }}
    />
  );
}
