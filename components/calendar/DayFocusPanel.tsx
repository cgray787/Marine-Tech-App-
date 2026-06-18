'use client';
import { useMemo } from 'react';
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns';
import { Calendar, AlertCircle, ChevronRight } from 'lucide-react';
import type { CalendarJob } from '@/lib/calendar/types';
import { jobsForDay, jobsForWeek, jobDays, type DayJob } from '@/lib/calendar/spans';
import { techColor, statusStripeColor } from '@/lib/calendar/colors';
import { formatTime } from '@/lib/calendar/format';

type Props = {
  scheduledJobs: CalendarJob[];
  unscheduledJobs: CalendarJob[];
  /** The day the operator selected on the grid, 'yyyy-MM-dd' (UTC-sliced to match jobDays). */
  selectedDate: string;
  /** Any date inside the week to summarize for section ②. */
  weekOf: Date;
  onSelectJob: (job: CalendarJob, anchor: HTMLElement) => void;
  /** Optional — pass undefined to hide the per-row "Schedule" button (read-only viewers). */
  onScheduleJob?: (job: CalendarJob) => void;
};

// Layout A — three stacked sections:
//   ① the selected day's jobs (each tagged "Day N of M" when multi-day)
//   ② the rest of the week (each job once, excluding ①)
//   ③ unscheduled — needs a time (with a Schedule affordance)
export function DayFocusPanel({
  scheduledJobs,
  unscheduledJobs,
  selectedDate,
  weekOf,
  onSelectJob,
  onScheduleJob,
}: Props) {
  const weekStart = startOfWeek(weekOf);
  const weekEnd = endOfWeek(weekOf);
  const weekStartDay = format(weekStart, 'yyyy-MM-dd');
  const weekEndDay = format(weekEnd, 'yyyy-MM-dd');

  // ① the selected day's jobs (including multi-day jobs spanning through it)
  const dayJobs = useMemo(
    () => jobsForDay(scheduledJobs, selectedDate),
    [scheduledJobs, selectedDate],
  );

  // ② the rest of the week — distinct jobs whose span touches this week, minus
  // anything already shown under the selected day (no ①/② duplicates).
  const weekJobs = useMemo(
    () =>
      jobsForWeek(scheduledJobs, weekStartDay, weekEndDay).filter(
        (j) => !jobDays(j).includes(selectedDate),
      ),
    [scheduledJobs, weekStartDay, weekEndDay, selectedDate],
  );

  const total = dayJobs.length + weekJobs.length + unscheduledJobs.length;
  // parseISO on a date-only string yields local midnight — safe for formatting.
  const selectedLabel = format(parseISO(selectedDate), 'EEEE, MMM d');

  if (total === 0) {
    return (
      <div className="mt-6 rounded-lg border border-[#1a2236] bg-[#0d1320] p-6 text-center text-sm text-[#8892A5]">
        No jobs for the week of {format(weekStart, 'MMM d')} — go to{' '}
        <span className="text-[#C9A96E]">+ New job</span> above to add one.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg text-white" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          {selectedLabel}
        </h2>
        <span className="text-xs uppercase tracking-wider text-[#8892A5]">
          {dayJobs.length + weekJobs.length} scheduled · {unscheduledJobs.length} unscheduled
        </span>
      </div>

      <div className="space-y-4">
        {/* ① Selected day */}
        <Section
          title={selectedLabel}
          count={dayJobs.length}
          accent="#C9A96E"
          empty="Nothing scheduled for this day."
        >
          {dayJobs.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              scheduled
              dayIndex={j.dayIndex}
              dayCount={j.dayCount}
              onSelect={(anchor) => onSelectJob(j, anchor)}
              onSchedule={onScheduleJob ? () => onScheduleJob(j) : undefined}
            />
          ))}
        </Section>

        {/* ② Rest of the week */}
        <Section
          title="Scheduled this week"
          count={weekJobs.length}
          accent="#4ade80"
          empty="Nothing else scheduled this week."
        >
          {weekJobs.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              scheduled
              onSelect={(anchor) => onSelectJob(j, anchor)}
              onSchedule={onScheduleJob ? () => onScheduleJob(j) : undefined}
            />
          ))}
        </Section>

        {/* ③ Unscheduled */}
        <Section
          title="Unscheduled — needs a time"
          count={unscheduledJobs.length}
          accent="#94a3b8"
          empty="No unscheduled jobs."
        >
          {unscheduledJobs.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              scheduled={false}
              onSelect={(anchor) => onSelectJob(j, anchor)}
              onSchedule={onScheduleJob ? () => onScheduleJob(j) : undefined}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  accent,
  empty,
  children,
}: {
  title: string;
  count: number;
  accent: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#1a2236] bg-[#0d1320] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-[#1a2236]"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <span className="text-xs uppercase tracking-wider text-white font-semibold">{title}</span>
        <span className="text-xs text-[#8892A5]">{count}</span>
      </div>
      {count === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[#8892A5]">{empty}</div>
      ) : (
        <ul className="divide-y divide-[#1a2236]">{children}</ul>
      )}
    </div>
  );
}

function JobRow({
  job,
  scheduled,
  dayIndex,
  dayCount,
  onSelect,
  onSchedule,
}: {
  job: CalendarJob | DayJob;
  scheduled: boolean;
  dayIndex?: number;
  dayCount?: number;
  onSelect: (anchor: HTMLElement) => void;
  onSchedule?: () => void;
}) {
  const tech = job.tech ? techColor(job.tech.id) : '#3b6cd6';
  const stripe = statusStripeColor(job.status);
  const location = job.locationOverride ?? job.marina?.name ?? null;
  const multiDay = dayCount != null && dayCount > 1;

  return (
    <li className="flex items-stretch hover:bg-white/5 transition-colors">
      {/* Side indicator tabs — full-height left bands (tech color + status stripe). */}
      <div
        className="w-1 shrink-0"
        style={{ background: scheduled ? tech : '#1a2236' }}
        aria-hidden
      />
      <div className="w-1 shrink-0" style={{ background: stripe }} aria-hidden />

      <button
        onClick={(e) => onSelect(e.currentTarget as HTMLElement)}
        className="flex-1 px-3 py-3 text-left flex items-center gap-3 min-w-0"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-white font-medium">
            {scheduled && job.scheduledStart && (
              <span className="text-[#C9A96E] tabular-nums">
                {formatTime(job.scheduledStart)}
              </span>
            )}
            <span className="truncate">{job.customer?.name ?? 'Unassigned'}</span>
          </div>
          <div className="text-xs text-[#8892A5] truncate">
            {job.boat?.name ?? 'No boat'}
            {location ? ` · 📍 ${location}` : ''}
            {multiDay ? ` · Day ${dayIndex} of ${dayCount}` : ''}
          </div>
        </div>

        {/* Status badge */}
        <span
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            scheduled ? 'bg-[#4ade80]/20 text-[#4ade80]' : 'bg-[#1a2236] text-[#8892A5]'
          }`}
        >
          {scheduled ? (
            <>
              <Calendar size={10} aria-hidden /> On calendar
            </>
          ) : (
            <>
              <AlertCircle size={10} aria-hidden /> Unscheduled
            </>
          )}
        </span>
        <ChevronRight size={14} className="text-[#8892A5] shrink-0" aria-hidden />
      </button>

      {!scheduled && onSchedule && (
        <button
          onClick={onSchedule}
          className="px-3 self-stretch border-l border-[#1a2236] bg-[#C9A96E] text-[#060a12] text-xs font-semibold hover:bg-[#D4B87D]"
        >
          Schedule
        </button>
      )}
    </li>
  );
}
