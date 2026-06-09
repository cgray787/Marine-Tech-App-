"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { ScheduleQuickPicker } from "@/components/calendar/ScheduleQuickPicker";
import { updateJob } from "@/lib/calendar/queries";
import { createClient } from "@/lib/supabase/client";
import type { CalendarJob } from "@/lib/calendar/types";
import { useCanWrite } from "@/lib/role-context";

type PendingJob = {
  id: string;
  status: string;
  service_types: string[] | null;
  customer_id: string | null;
  notes: string | null;
  boats: { name: string; make_model: string } | null;
  profiles: { full_name: string } | null;
  customers: { name: string } | null;
};

interface Props {
  jobs: PendingJob[];
}

export function PendingJobsPanel({ jobs }: Props) {
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const supabase = createClient();

  // The job currently being scheduled via the inline quick-picker (null = closed).
  const [scheduleJob, setScheduleJob] = useState<CalendarJob | null>(null);

  function toCalendarJob(job: PendingJob): CalendarJob {
    return {
      id: job.id,
      scheduledStart: null,
      scheduledEnd: null,
      status: job.status as CalendarJob["status"],
      notes: job.notes ?? null,
      locationOverride: null,
      customer: job.customers ? { id: job.customer_id!, name: job.customers.name } : null,
      boat: job.boats
        ? { id: "", name: job.boats.name, makeModel: job.boats.make_model ?? null }
        : null,
      marina: null,
      tech: null,
    };
  }

  return (
    <>
      <div className="mb-8 rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <AlertCircle size={16} className="text-amber-400" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
              Pending — Needs scheduling
            </h2>
            {jobs.length > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                {jobs.length}
              </span>
            )}
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-amber-300/60">
            No pending jobs — every job has a schedule.
          </div>
        ) : (
          <div className="divide-y divide-amber-500/10">
            {jobs.map((job) => (
              <PendingJobRow
                key={job.id}
                job={job}
                canWrite={canWrite}
                onSchedule={canWrite ? () => setScheduleJob(toCalendarJob(job)) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {scheduleJob && (
        <ScheduleQuickPicker
          job={scheduleJob}
          initial={null}
          onCancel={() => setScheduleJob(null)}
          onSave={async ({ scheduledStart, scheduledEnd, scheduledEndDate }) => {
            await updateJob(supabase, {
              id: scheduleJob.id,
              scheduledStart,
              scheduledEnd,
              ...(scheduledEndDate != null ? { scheduledEndDate } : {}),
            });
            // Invalidate both the jobs page (via router) and any calendar queries.
            await queryClient.invalidateQueries({ queryKey: ["calendar"] });
            setScheduleJob(null);
            // Re-fetch the jobs page so the pending panel reflects the change.
            window.location.reload();
          }}
        />
      )}
    </>
  );
}

function PendingJobRow({
  job,
  canWrite,
  onSchedule,
}: {
  job: PendingJob;
  canWrite: boolean;
  onSchedule?: () => void;
}) {
  const customerName = job.customers?.name ?? "No customer";
  const boatName = job.boats?.name ?? "No boat";
  const boatMeta = job.boats?.make_model;

  return (
    <div className="flex items-center gap-4 px-6 py-3">
      {/* Customer + boat */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-text-primary truncate">
            {customerName}
          </span>
          <span className="text-text-secondary text-xs">·</span>
          <span className="text-sm text-text-secondary truncate">
            {boatName}
            {boatMeta ? ` (${boatMeta})` : ""}
          </span>
        </div>

        {/* Service type chips */}
        {job.service_types && job.service_types.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {job.service_types.map((type) => (
              <span
                key={type}
                className="rounded bg-gold-muted px-2 py-0.5 text-xs text-gold"
              >
                {type}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Assigned tech */}
      {job.profiles?.full_name && (
        <span className="hidden sm:block text-xs text-text-secondary shrink-0">
          {job.profiles.full_name}
        </span>
      )}

      {/* Schedule button */}
      {canWrite && onSchedule && (
        <button
          type="button"
          onClick={onSchedule}
          className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 hover:border-amber-500/60"
        >
          Schedule
        </button>
      )}
    </div>
  );
}
