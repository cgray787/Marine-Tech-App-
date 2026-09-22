'use client';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, addMonths, addWeeks, addDays } from 'date-fns';
import type { CalendarView } from '@/lib/calendar/types';

type Tech = { id: string; fullName: string };

type Props = {
  date: Date;
  view: CalendarView;
  onDateChange: (d: Date) => void;
  onViewChange: (v: CalendarView) => void;
  techs: Tech[];
  selectedTechId: string | null;
  onTechChange: (id: string | null) => void;
  /** Optional — pass undefined to hide the "New job" button (read-only viewers). */
  onNewJob?: () => void;
};

export function CalendarToolbar({
  date, view, onDateChange, onViewChange, techs, selectedTechId, onTechChange, onNewJob,
}: Props) {
  const titleFmt = view === 'month' ? 'MMMM yyyy' : view === 'week' ? "'Week of' MMM d, yyyy" : 'EEEE, MMM d, yyyy';
  const step = (delta: 1 | -1) => {
    const fn = view === 'month' ? addMonths : view === 'week' ? addWeeks : addDays;
    onDateChange(fn(date, delta));
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="w-full text-2xl text-white sm:w-auto" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          {format(date, titleFmt)}
        </span>
        <button onClick={() => step(-1)} aria-label="Previous"
          className="bg-[#0d1320] border border-[#1a2236] text-white px-3 py-1.5 rounded-md hover:bg-[#1a2236]">
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => onDateChange(new Date())}
          className="bg-[#0d1320] border border-[#1a2236] text-white px-3 py-1.5 rounded-md hover:bg-[#1a2236]">
          Today
        </button>
        <button onClick={() => step(1)} aria-label="Next"
          className="bg-[#0d1320] border border-[#1a2236] text-white px-3 py-1.5 rounded-md hover:bg-[#1a2236]">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex w-full flex-wrap gap-2 xl:w-auto">
        <select
          value={selectedTechId ?? ''}
          onChange={(e) => onTechChange(e.target.value || null)}
          className="w-full sm:w-auto bg-[#0d1320] border border-[#1a2236] text-white px-3 py-1.5 rounded-md"
        >
          <option value="">All technicians</option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>{t.fullName}</option>
          ))}
        </select>

        <div className="flex bg-[#0d1320] border border-[#1a2236] rounded-md overflow-hidden">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={
                v === view
                  ? 'bg-[#C9A96E] text-[#060a12] px-3.5 py-1.5 font-semibold capitalize'
                  : 'text-[#8892A5] px-3.5 py-1.5 capitalize hover:text-white'
              }
            >
              {v}
            </button>
          ))}
        </div>

        {onNewJob && (
          <button onClick={onNewJob}
            className="bg-[#C9A96E] text-[#060a12] px-3.5 py-1.5 rounded-md font-semibold flex items-center gap-1 hover:bg-[#D4B87D]">
            <Plus size={16} /> New job
          </button>
        )}
      </div>
    </div>
  );
}
