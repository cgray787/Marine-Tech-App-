'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import {
  CalendarView, CalendarToolbar, JobPopover, NewJobModal, UnscheduledTray, WeeklyJobsPanel,
  ScheduleQuickPicker,
} from '@/components/calendar';
import { getJobsInRange, getUnscheduledJobs, updateJob } from '@/lib/calendar/queries';
import { subscribeToJobs, unsubscribe } from '@/lib/calendar/realtime';
import { createClient } from '@/lib/supabase/client';
import { techColor, statusStripeColor } from '@/lib/calendar/colors';
import { useCanWrite } from '@/lib/role-context';
import type { CalendarJob, CalendarView as ViewMode } from '@/lib/calendar/types';

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();

  const [view, setView] = useState<ViewMode>('month');
  const [date, setDate] = useState(new Date());
  const [techId, setTechId] = useState<string | null>(null);
  const [popoverJob, setPopoverJob] = useState<CalendarJob | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobStart, setNewJobStart] = useState<Date | null>(null);
  // The job currently being scheduled via the inline quick-picker (null = closed).
  const [scheduleJob, setScheduleJob] = useState<CalendarJob | null>(null);

  const range = useMemo(() => {
    const fns = view === 'month'
      ? [startOfMonth, endOfMonth]
      : view === 'week'
      ? [startOfWeek, endOfWeek]
      : [startOfDay, endOfDay];
    return { startUtc: fns[0](date).toISOString(), endUtc: fns[1](date).toISOString() };
  }, [date, view]);

  const jobsQuery = useQuery({
    queryKey: ['calendar', range.startUtc, range.endUtc, techId],
    queryFn: () => getJobsInRange(supabase, range.startUtc, range.endUtc, techId ?? undefined),
  });

  const unscheduledQuery = useQuery({
    queryKey: ['calendar', 'unscheduled', techId],
    queryFn: () => getUnscheduledJobs(supabase, techId ?? undefined),
  });

  const techsQuery = useQuery({
    queryKey: ['techs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'tech')
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((t) => ({ id: t.id, fullName: t.full_name }));
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const channel = subscribeToJobs(supabase, () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    });
    return () => unsubscribe(supabase, channel);
  }, [supabase, queryClient]);

  const lookupsQuery = useQuery({
    queryKey: ['calendar', 'lookups'],
    enabled: newJobOpen,
    queryFn: async () => {
      const [customers, boats, marinas] = await Promise.all([
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('boats').select('id, name, customer_id').order('name'),
        supabase.from('marinas').select('id, name').order('name'),
      ]);
      if (customers.error) throw customers.error;
      if (boats.error) throw boats.error;
      if (marinas.error) throw marinas.error;
      return {
        customers: customers.data ?? [],
        boats: (boats.data ?? []).map((b) => ({ id: b.id, name: b.name, customerId: b.customer_id })),
        marinas: marinas.data ?? [],
      };
    },
  });

  const jobs = jobsQuery.data ?? [];

  return (
    <div className="p-6 text-white min-h-screen bg-[#060a12]">
      <CalendarToolbar
        date={date}
        view={view}
        onDateChange={setDate}
        onViewChange={setView}
        techs={techsQuery.data ?? []}
        selectedTechId={techId}
        onTechChange={setTechId}
        onNewJob={
          canWrite
            ? () => { setNewJobStart(new Date()); setNewJobOpen(true); }
            : undefined
        }
      />

      <UnscheduledTray
        jobs={unscheduledQuery.data ?? []}
        onSelect={(job, anchor) => { setPopoverJob(job); setPopoverAnchor(anchor); }}
      />

      <CalendarView
        jobs={jobs}
        view={view}
        date={date}
        onNavigate={setDate}
        onView={setView}
        onSelectJob={(job, anchor) => { setPopoverJob(job); setPopoverAnchor(anchor); }}
        onSelectSlot={
          canWrite
            ? (start) => { setNewJobStart(start); setNewJobOpen(true); }
            : undefined
        }
      />

      <WeeklyJobsPanel
        scheduledJobs={jobs}
        unscheduledJobs={unscheduledQuery.data ?? []}
        weekOf={date}
        onSelectJob={(job, anchor) => { setPopoverJob(job); setPopoverAnchor(anchor); }}
        // Schedule button on each UNSCHEDULED row → open inline date/time picker.
        // (Previously this opened the read-only JobPopover with no save path.)
        onScheduleJob={canWrite ? (job) => setScheduleJob(job) : undefined}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#8892A5]">
        <span className="text-[#C9A96E] uppercase tracking-wider">Techs:</span>
        {(techsQuery.data ?? []).map((t) => (
          <span key={t.id} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: techColor(t.id) }} />
            {t.fullName}
          </span>
        ))}
        <span className="ml-4 text-[#C9A96E] uppercase tracking-wider">Status:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-[3px] h-2.5" style={{ background: statusStripeColor('new') }} />
          New
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-[3px] h-2.5" style={{ background: statusStripeColor('in_progress') }} />
          In progress
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-[3px] h-2.5" style={{ background: statusStripeColor('completed') }} />
          Completed
        </span>
      </div>

      <JobPopover job={popoverJob} anchor={popoverAnchor} onClose={() => setPopoverJob(null)} />

      {scheduleJob && (
        <ScheduleQuickPicker
          job={scheduleJob}
          initial={scheduleJob.scheduledStart ? new Date(scheduleJob.scheduledStart) : null}
          onCancel={() => setScheduleJob(null)}
          onSave={async ({ scheduledStart, scheduledEnd }) => {
            await updateJob(supabase, {
              id: scheduleJob.id,
              scheduledStart,
              scheduledEnd,
            });
            // Refetch the lanes so the row moves from UNSCHEDULED → SCHEDULED.
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['jobs'] }),
              queryClient.invalidateQueries({ queryKey: ['unscheduled-jobs'] }),
            ]);
            setScheduleJob(null);
          }}
        />
      )}

      <NewJobModal
        open={newJobOpen}
        defaultStart={newJobStart}
        customers={lookupsQuery.data?.customers ?? []}
        boats={lookupsQuery.data?.boats ?? []}
        marinas={lookupsQuery.data?.marinas ?? []}
        techs={techsQuery.data ?? []}
        onClose={() => setNewJobOpen(false)}
      />

      {jobsQuery.data && jobs.length === 0 && unscheduledQuery.data?.length === 0 && (
        <div className="text-center text-[#8892A5] mt-12">
          {techId ? (
            <>
              <p className="text-lg mb-3">
                No jobs for {techsQuery.data?.find((t) => t.id === techId)?.fullName ?? 'this tech'} this {view}
              </p>
              <button onClick={() => setTechId(null)} className="text-[#C9A96E] hover:text-[#D4B87D] text-sm">
                Show all techs
              </button>
            </>
          ) : (
            <>
              <p className="text-lg mb-3">No jobs scheduled this {view}</p>
              {canWrite && (
                <button onClick={() => { setNewJobStart(new Date()); setNewJobOpen(true); }}
                  className="bg-[#C9A96E] text-[#060a12] px-4 py-2 rounded font-semibold">
                  + Schedule a job
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
