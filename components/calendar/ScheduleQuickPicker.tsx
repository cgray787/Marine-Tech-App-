"use client";

import { useEffect, useState } from "react";
import type { CalendarJob } from "@/lib/calendar/types";
import { DatePopover } from "./DatePopover";

// Centered modal-ish dialog with a date + start-time + duration picker. Save
// writes scheduledStart and scheduledEnd via the provided callback so the
// parent's mutation + invalidation flow stays in one place.

interface Props {
  job: CalendarJob;
  // Initial date for the picker. Defaults to today if the job has no prior time.
  initial?: Date | null;
  onCancel: () => void;
  // scheduledEndDate is the date-only string for the multi-day end (mirrors
  // jobs.scheduled_end_date so the portal calendar can render the span).
  onSave: (input: {
    scheduledStart: string;
    scheduledEnd: string;
    scheduledEndDate?: string;
  }) => Promise<void>;
}

const DEFAULT_DURATION_HOURS = 1;

// Format Date → 'YYYY-MM-DD' in the local timezone (HTML date inputs are
// timezone-naive and we want the operator's wall-clock).
function dateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 9 AM → '09:00'
function timeInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function summarizeLine(job: CalendarJob): string {
  // CalendarJob shape: customerName, boatName, etc. Defensive on missing fields.
  const j = job as unknown as { customerName?: string | null; boatName?: string | null };
  const bits = [j.customerName, j.boatName].filter(Boolean) as string[];
  return bits.length > 0 ? bits.join(" · ") : "Job";
}

export function ScheduleQuickPicker({ job, initial, onCancel, onSave }: Props) {
  const seed = initial ?? new Date();
  // If seeding from "now" snap to top of next hour so the default isn't 10:37.
  if (!initial) {
    seed.setMinutes(0, 0, 0);
    seed.setHours(seed.getHours() + 1);
  }

  const [dateStr, setDateStr] = useState(() => dateInputValue(seed));
  const [timeStr, setTimeStr] = useState(() => timeInputValue(seed));
  const [hours, setHours] = useState<number>(DEFAULT_DURATION_HOURS);
  // Optional end date for multi-day jobs. Empty = single-day.
  const [endDateStr, setEndDateStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // True when the operator has set an end date that is strictly after start.
  const isMultiDay = !!endDateStr && endDateStr > dateStr;

  // Escape closes; Enter saves.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function handleSave() {
    setError("");
    if (!dateStr || !timeStr) {
      setError("Pick a date and start time.");
      return;
    }
    const start = new Date(`${dateStr}T${timeStr}`);
    if (Number.isNaN(start.getTime())) {
      setError("Couldn't read that date/time.");
      return;
    }

    let end: Date;
    let scheduledEndDate: string | undefined;

    if (isMultiDay) {
      // End = end date at 17:00 local time.
      end = new Date(`${endDateStr}T17:00`);
      if (Number.isNaN(end.getTime())) {
        setError("Couldn't read the end date.");
        return;
      }
      scheduledEndDate = endDateStr;
    } else {
      end = new Date(start.getTime() + hours * 60 * 60 * 1000);
    }

    setSaving(true);
    try {
      await onSave({
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        ...(scheduledEndDate ? { scheduledEndDate } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
      return;
    }
    // Parent unmounts us on success.
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#1a2236] bg-[#0d1320] p-5 shadow-2xl">
        <h3 className="text-base font-semibold text-[#f1f5f9]">Schedule</h3>
        <p className="mt-0.5 text-xs text-[#8892A5]">{summarizeLine(job)}</p>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8892A5]">
                Start date
              </label>
              <DatePopover
                value={dateStr}
                onChange={setDateStr}
                ariaLabel="Start date"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8892A5]">
                End date <span className="normal-case font-normal text-[#8892A5]">(optional)</span>
              </label>
              <DatePopover
                value={endDateStr}
                onChange={setEndDateStr}
                min={dateStr}
                ariaLabel="End date"
              />
            </div>
          </div>
          <div className={`grid gap-3 ${isMultiDay ? "grid-cols-1" : "grid-cols-2"}`}>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8892A5]">
                Start time
              </label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full rounded-lg border border-[#1a2236] bg-[#060a12] px-3 py-2.5 text-sm text-[#f1f5f9] focus:border-[#C9A96E] focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
              />
            </div>
            {!isMultiDay && (
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8892A5]">
                  Duration
                </label>
                <select
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#1a2236] bg-[#060a12] px-3 py-2.5 text-sm text-[#f1f5f9] focus:border-[#C9A96E] focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
                >
                  {[0.5, 1, 1.5, 2, 3, 4, 6, 8].map((h) => (
                    <option key={h} value={h}>
                      {h === 0.5 ? "30 min" : h === 1 ? "1 hour" : `${h} hours`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {isMultiDay && (
            <p className="text-xs text-[#8892A5]">
              Multi-day job — ends {endDateStr} at 5:00 PM.
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-[#1a2236] bg-[#060a12] px-4 py-2 text-xs text-[#8892A5] transition-colors hover:bg-[#111827] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#C9A96E] px-4 py-2 text-xs font-semibold tracking-wide text-[#060a12] transition-colors hover:bg-[#d4b87e] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
