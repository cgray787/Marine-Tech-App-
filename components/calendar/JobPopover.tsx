'use client';
import * as Popover from '@radix-ui/react-popover';
import Link from 'next/link';
import { MapPin, ExternalLink, Wrench } from 'lucide-react';
import type { CalendarJob } from '@/lib/calendar/types';
import { formatTimeRange } from '@/lib/calendar/format';

type Props = {
  job: CalendarJob | null;
  anchor: HTMLElement | null;
  onClose: () => void;
};

export function JobPopover({ job, anchor, onClose }: Props) {
  if (!job || !anchor) return null;
  const location = job.locationOverride ?? job.marina?.name ?? null;
  const isPaperwork = job.kind === 'paperwork';
  return (
    <Popover.Root open onOpenChange={(o) => !o && onClose()}>
      <Popover.Anchor virtualRef={{ current: anchor }} />
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          className="bg-[#0d1320] border border-[#1a2236] text-white rounded-lg shadow-xl p-4 w-80 z-50"
        >
          <div className="text-xs text-[#C9A96E] uppercase tracking-wider mb-1">
            {formatTimeRange(job.scheduledStart, job.scheduledEnd)}
          </div>
          {isPaperwork ? (
            <div className="text-lg font-semibold mb-2">📋 Paperwork</div>
          ) : (
            <>
              <div className="text-lg font-semibold mb-2">{job.customer?.name ?? 'Unassigned customer'}</div>
              <div className="text-sm text-[#8892A5] mb-3">
                {job.boat?.name ?? 'No boat'}{job.boat?.makeModel ? ` · ${job.boat.makeModel}` : ''}
              </div>
            </>
          )}
          {location && (
            <div className="text-sm text-white flex items-center gap-1.5 mb-2">
              <MapPin size={14} className="text-[#C9A96E]" /> {location}
            </div>
          )}
          {job.tech && (
            <div className="text-sm text-white flex items-center gap-1.5 mb-2">
              <Wrench size={14} className="text-[#C9A96E]" /> {job.tech.fullName}
            </div>
          )}
          {job.notes && <div className="text-xs text-[#8892A5] mt-2 italic">{job.notes}</div>}
          <Link
            href={`/dashboard/jobs/${job.id}`}
            className="mt-3 inline-flex items-center gap-1 text-[#C9A96E] hover:text-[#D4B87D] text-sm font-semibold"
          >
            Open job <ExternalLink size={14} />
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
