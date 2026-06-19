'use client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CalendarJob } from '@/lib/calendar/types';

type Props = {
  jobs: CalendarJob[];
  onSelect: (job: CalendarJob, anchor: HTMLElement) => void;
};

export function UnscheduledTray({ jobs, onSelect }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (jobs.length === 0) return null;

  return (
    <div className="bg-[#0d1320] border border-[#1a2236] rounded-lg p-3 mb-4 flex items-center gap-3">
      <span className="text-[#C9A96E] text-xs uppercase tracking-wider whitespace-nowrap">
        Unscheduled ({jobs.length})
      </span>
      {open && (
        <div className="flex gap-1.5 flex-1 overflow-x-auto">
          {jobs.map((j) => {
            const loc = j.locationOverride ?? j.marina?.name ?? '';
            // No-client jobs: prompt to assign and open the job editor on tap.
            if (!j.customer) {
              return (
                <button
                  key={j.id}
                  onClick={() => router.push(`/dashboard/jobs/${j.id}`)}
                  className="bg-[#1a2236] hover:bg-[#243046] text-white px-2.5 py-1 rounded text-xs whitespace-nowrap"
                >
                  No client — tap to assign
                </button>
              );
            }
            return (
              <button
                key={j.id}
                onClick={(e) => onSelect(j, e.currentTarget)}
                className="bg-[#1a2236] hover:bg-[#243046] text-white px-2.5 py-1 rounded text-xs whitespace-nowrap"
              >
                {j.customer.name} · {j.boat?.name ?? 'Boat'}
                {loc ? ` · ${loc}` : ''}
              </button>
            );
          })}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="text-[#8892A5] hover:text-white" aria-label={open ? 'Collapse' : 'Expand'}>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
  );
}
