'use client';
import { format, parseISO } from 'date-fns';

/** Inclusive list of yyyy-MM-dd days from startDay → endDay. UTC-iterated to
 * match the rest of the calendar's day math (lib/calendar/spans.ts). */
export function daysBetween(startDay: string, endDay: string): string[] {
  if (!startDay) return [];
  if (!endDay || endDay <= startDay) return [startDay];
  const out: string[] = [];
  const cur = new Date(`${startDay}T00:00:00Z`);
  const last = new Date(`${endDay}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return [startDay];
  let guard = 0;
  while (cur <= last && guard < 60) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

type Props = {
  /** Start day, yyyy-MM-dd. */
  startDay: string;
  /** End day, yyyy-MM-dd. Empty / <= start renders nothing (single-day). */
  endDay: string;
  /** Current per-day place map. */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

/**
 * Compact one-place-per-day editor shown only for multi-day jobs. Writes a
 * { "yyyy-MM-dd": "<place>" } map into day_locations. Empty inputs are dropped
 * so a job with no per-day overrides keeps an empty map (falls back to its
 * single marina / location override).
 */
export function PerDayLocationEditor({ startDay, endDay, value, onChange }: Props) {
  const days = daysBetween(startDay, endDay);
  if (days.length < 2) return null;

  function setDay(day: string, text: string) {
    const next = { ...value };
    if (text.trim()) next[day] = text;
    else delete next[day];
    onChange(next);
  }

  return (
    <div className="rounded-lg border border-[#1a2236] bg-[#060a12] p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[#8892A5]">
        Place per day <span className="normal-case font-normal">(optional)</span>
      </div>
      <div className="space-y-2">
        {days.map((day) => (
          <div key={day} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs tabular-nums text-[#C9A96E]">
              {format(parseISO(day), 'EEE MMM d')}
            </span>
            <input
              type="text"
              value={value[day] ?? ''}
              onChange={(e) => setDay(day, e.target.value)}
              placeholder="Place / marina"
              className="flex-1 rounded-md border border-[#1a2236] bg-[#0d1320] px-2.5 py-1.5 text-sm text-[#f1f5f9] focus:border-[#C9A96E] focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
