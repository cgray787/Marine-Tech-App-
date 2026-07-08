'use client';
import { MapPin } from 'lucide-react';
import type { CalendarJob } from '@/lib/calendar/types';
import { clientColor, jobStripeColor } from '@/lib/calendar/colors';
import { formatTime } from '@/lib/calendar/format';

// Distinct slate fill for paperwork blocks so they read differently from the
// tech-colored service jobs. Gold (#C9A96E) accent stripe ties it to the brand.
const PAPERWORK_BG = '#334155';
const PAPERWORK_ACCENT = '#C9A96E';

export function JobChip({ job, compact = false }: { job: CalendarJob; compact?: boolean }) {
  const isPaperwork = job.kind === 'paperwork';
  // Color the bar by CLIENT so different customers are easy to tell apart.
  const bg = isPaperwork ? PAPERWORK_BG : clientColor(job.customer?.id);
  // Per-job stripe color so each job reads distinctly (paperwork keeps gold).
  const stripe = isPaperwork ? PAPERWORK_ACCENT : jobStripeColor(job.id);
  const location = job.locationOverride ?? job.marina?.name ?? null;
  const customerShort = job.customer ? shortName(job.customer.name) : 'Unassigned customer';
  const boatLabel = job.boat?.name ?? 'No boat';
  const paperworkNote = job.notes?.trim() || 'Paperwork';

  // Compact single-line chip for the month grid so many same-day jobs fit at
  // once (click opens the job's detail page). Week/Day views use the full chip.
  if (compact) {
    return (
      <div
        style={{ background: bg, borderLeft: `3px solid ${stripe}` }}
        className="text-white text-[11px] rounded-[3px] px-[5px] py-[2px] leading-tight cursor-pointer truncate whitespace-nowrap"
      >
        {isPaperwork ? (
          <span className="font-semibold">
            {formatTime(job.scheduledStart)} · 📋 {paperworkNote}
          </span>
        ) : (
          <>
            <span className="font-semibold">{formatTime(job.scheduledStart)} · {customerShort}</span>
            {job.boat?.name && <span className="opacity-80"> · {job.boat.name}</span>}
          </>
        )}
      </div>
    );
  }

  if (isPaperwork) {
    return (
      <div
        style={{ background: bg, borderLeft: `3px solid ${stripe}` }}
        className="text-white text-[11px] rounded-[3px] px-[5px] py-[4px] leading-[1.35] cursor-pointer"
      >
        <div className="font-semibold">
          {formatTime(job.scheduledStart)} · 📋 Paperwork
        </div>
        <div className="opacity-90 truncate">{paperworkNote}</div>
      </div>
    );
  }

  return (
    <div
      style={{ background: bg, borderLeft: `3px solid ${stripe}` }}
      className="text-white text-[11px] rounded-[3px] px-[5px] py-[4px] leading-[1.35] cursor-pointer"
    >
      <div className="font-semibold">
        {formatTime(job.scheduledStart)} · {customerShort}
      </div>
      <div className="opacity-90">{boatLabel}</div>
      {location && (
        <div className="opacity-75 text-[10px] flex items-center gap-1">
          <MapPin size={10} aria-hidden /> {location}
        </div>
      )}
    </div>
  );
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}
