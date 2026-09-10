import { describe, expect, it } from "vitest";
import {
  calendarDays,
  calendarRange,
  moveCalendar,
} from "../../mobile/lib/calendar/navigation";
import { jobDays } from "../../mobile/lib/calendar/spans";
import { getJobsInRange } from "../../mobile/lib/calendar/queries";
import { format, parseISO } from "date-fns";

describe("mobile calendar dates", () => {
  it("queries the adjacent months visible in a full month grid", () => {
    const days = calendarDays(parseISO("2026-09-09"), "month");
    expect(days[0]).toBe("2026-08-30");
    expect(days.at(-1)).toBe("2026-10-03");
    expect(days).toHaveLength(35);
  });
  it("includes all seven days when a week crosses a month boundary", () => {
    expect(calendarDays(parseISO("2026-09-01"), "week")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });
  it("clamps month navigation at leap day instead of skipping February", () => {
    expect(
      format(moveCalendar(parseISO("2024-01-31"), "month", 1), "yyyy-MM-dd"),
    ).toBe("2024-02-29");
  });
  it("places an evening job on its local day and preserves the multi-day span", () => {
    // The explicit Pacific run also verifies a UTC timestamp on the next date.
    const localEvening = new Date(2026, 8, 9, 19).toISOString();
    expect(
      jobDays({ scheduledStart: localEvening, scheduledEndDate: "2026-09-11" }),
    ).toEqual(["2026-09-09", "2026-09-10", "2026-09-11"]);
  });
  it("fetches jobs that started earlier but still occupy the visible range, scoped to the tech", async () => {
    const calls: unknown[][] = [];
    const query: any = {
      then: (resolve: any) => resolve({ data: [], error: null }),
    };
    for (const method of ["select", "or", "lte", "order", "eq"])
      query[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return query;
      };
    const range = calendarRange(parseISO("2026-09-09"), "day");
    await getJobsInRange(
      { from: () => query } as any,
      range.startUtc,
      range.endUtc,
      "tech-1",
    );
    expect(calls).toContainEqual([
      "or",
      `scheduled_start.gte.${range.startUtc},scheduled_end_date.gte.2026-09-09`,
    ]);
    expect(calls).toContainEqual(["lte", "scheduled_start", range.endUtc]);
    expect(calls).toContainEqual(["eq", "assigned_to", "tech-1"]);
  });
});
