'use client';
import { MapPin } from 'lucide-react';
import type { CalendarJob } from '@/lib/calendar/types';
import { techColor, statusStripeColor } from '@/lib/calendar/colors';
import { formatTime } from '@/lib/calendar/format';

export function JobChip({ job, compact = false }: { job: CalendarJob; compact?: boolean }) {
  const bg = job.tech ? techColor(job.tech.id) : '#3b6cd6';
  const stripe = statusStripeColor(job.status);
  const location = job.locationOverride ?? job.marina?.name ?? null;
  const customerShort = job.customer ? shortName(job.customer.name) : 'Unassigned customer';
  const boatLabel = job.boat?.name ?? 'No boat';

  // Compact single-line chip for the month grid so many same-day jobs fit at
  // once (click opens the job's detail page). Week/Day views use the full chip.
  if (compact) {
    return (
      <div
        style={{ background: bg, borderLeft: `3px solid ${stripe}` }}
        className="text-white text-[11px] rounded-[3px] px-[5px] py-[2px] leading-tight cursor-pointer truncate whitespace-nowrap"
      >
        <span className="font-semibold">{formatTime(job.scheduledStart)} · {customerShort}</span>
        {job.boat?.name && <span className="opacity-80"> · {job.boat.name}</span>}
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
