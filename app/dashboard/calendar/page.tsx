'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import {
  CalendarView, CalendarToolbar, JobPopover, NewJobModal, UnscheduledTray,
} from '@/components/calendar';
import { getJobsInRange, getUnscheduledJobs } from '@/lib/calendar/queries';
import { subscribeToJobs, unsubscribe } from '@/lib/calendar/realtime';
import { createClient } from '@/lib/supabase/client';
import type { CalendarJob, CalendarView as ViewMode } from '@/lib/calendar/types';

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewMode>('month');
  const [date, setDate] = useState(new Date());
  const [techId, setTechId] = useState<string | null>(null);
  const [popoverJob, setPopoverJob] = useState<CalendarJob | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobStart, setNewJobStart] = useState<Date | null>(null);

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
        .eq('role', 'technician')
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
        onNewJob={() => { setNewJobStart(new Date()); setNewJobOpen(true); }}
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
        onSelectSlot={(start) => { setNewJobStart(start); setNewJobOpen(true); }}
      />

      <JobPopover job={popoverJob} anchor={popoverAnchor} onClose={() => setPopoverJob(null)} />

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
          <p className="text-lg mb-3">No jobs scheduled this {view}</p>
          <button onClick={() => { setNewJobStart(new Date()); setNewJobOpen(true); }}
            className="bg-[#C9A96E] text-[#060a12] px-4 py-2 rounded font-semibold">
            + Schedule a job
          </button>
        </div>
      )}
    </div>
  );
}
