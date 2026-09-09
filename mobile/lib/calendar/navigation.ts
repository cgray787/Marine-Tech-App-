import {
  addDays,
  addMonths,
  addWeeks,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  format,
} from "date-fns";
export type CalendarMode = "month" | "week" | "day";
export function calendarRange(date: Date, mode: CalendarMode) {
  const start =
    mode === "month"
      ? startOfWeek(startOfMonth(date))
      : mode === "week"
        ? startOfWeek(date)
        : startOfDay(date);
  const end =
    mode === "month"
      ? endOfWeek(endOfMonth(date))
      : mode === "week"
        ? endOfWeek(date)
        : endOfDay(date);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}
export function moveCalendar(
  date: Date,
  mode: CalendarMode,
  direction: number,
) {
  return mode === "month"
    ? addMonths(date, direction)
    : mode === "week"
      ? addWeeks(date, direction)
      : addDays(date, direction);
}
export function calendarDays(date: Date, mode: CalendarMode) {
  const range = calendarRange(date, mode);
  return eachDayOfInterval({
    start: new Date(range.startUtc),
    end: new Date(range.endUtc),
  }).map((d) => format(d, "yyyy-MM-dd"));
}
