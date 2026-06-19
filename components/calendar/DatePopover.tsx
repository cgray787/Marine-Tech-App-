"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

// A native date input paired with a Radix Popover mini month-calendar. The
// native <input type="date"> stays the editable field (typing still works);
// the popover (opened from the calendar icon button) is an additive way to
// pick a day. Values flow through `value` / `onChange` as 'YYYY-MM-DD' strings
// to match the HTML date-input contract the parent already speaks.

interface Props {
  // 'YYYY-MM-DD' or '' when cleared.
  value: string;
  onChange: (value: string) => void;
  // 'YYYY-MM-DD' lower bound (forwarded to both the native input and the grid).
  min?: string;
  // For accessibility / matching the existing inputs.
  ariaLabel?: string;
}

// Parse a 'YYYY-MM-DD' string to a local Date (timezone-naive, like the input).
function parseDateInput(s: string): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function DatePopover({ value, onChange, min, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseDateInput(value);
  const minDate = parseDateInput(min ?? "");
  // The month the grid is showing. Follows the selected day, else min, else today.
  const [viewMonth, setViewMonth] = useState<Date>(
    () => startOfMonth(selected ?? minDate ?? new Date()),
  );

  // Re-sync the grid to the selected day whenever the popover (re)opens, so it
  // doesn't get stranded on a stale month after the operator types a new date.
  function handleOpenChange(next: boolean) {
    if (next) {
      setViewMonth(startOfMonth(parseDateInput(value) ?? minDate ?? new Date()));
    }
    setOpen(next);
  }

  // Full weeks covering the visible month (leading/trailing days from adjacent
  // months fill the grid).
  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  function pick(day: Date) {
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  }

  const inputClass =
    "w-full rounded-lg border border-[#1a2236] bg-[#060a12] px-3 py-2.5 pr-9 text-sm text-[#f1f5f9] focus:border-[#C9A96E] focus:outline-none focus:ring-1 focus:ring-[#C9A96E]";

  return (
    <div className="relative">
      <input
        type="date"
        aria-label={ariaLabel}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`${ariaLabel ?? "date"}: open calendar`}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#8892A5] transition-colors hover:bg-[#111827] hover:text-[#C9A96E]"
          >
            <CalendarIcon size={16} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            className="z-[70] w-64 rounded-xl border border-[#1a2236] bg-[#0d1320] p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="rounded-md p-1 text-[#8892A5] transition-colors hover:bg-[#111827] hover:text-[#f1f5f9]"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="text-sm font-semibold text-[#f1f5f9]">
                {format(viewMonth, "MMMM yyyy")}
              </div>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="rounded-md p-1 text-[#8892A5] transition-colors hover:bg-[#111827] hover:text-[#f1f5f9]"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={i}
                  className="py-1 text-center text-[10px] font-medium uppercase tracking-wider text-[#8892A5]"
                >
                  {w}
                </div>
              ))}
              {days.map((day) => {
                const inMonth = isSameMonth(day, viewMonth);
                const isSelected = selected ? isSameDay(day, selected) : false;
                const isToday = isSameDay(day, today);
                const disabled = minDate ? day < startOfDay(minDate) : false;
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(day)}
                    className={[
                      "flex h-8 items-center justify-center rounded-md text-xs transition-colors",
                      isSelected
                        ? "bg-[#C9A96E] font-semibold text-[#060a12]"
                        : disabled
                          ? "cursor-not-allowed text-[#8892A5]/30"
                          : inMonth
                            ? "text-[#f1f5f9] hover:bg-[#111827]"
                            : "text-[#8892A5]/50 hover:bg-[#111827]",
                      !isSelected && isToday
                        ? "ring-1 ring-inset ring-[#C9A96E]"
                        : "",
                    ].join(" ")}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

// Midnight of the given date (local) — used so a `min` of today still allows today.
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
