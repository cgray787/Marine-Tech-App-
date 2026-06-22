import { describe, it, expect } from "vitest";
import { bucketJobsByHour, clampHourBucket } from "@/lib/calendar/format";
import type { CalendarJob } from "@/lib/calendar/types";

const baseJob: CalendarJob = {
  id: "j",
  kind: "service",
  scheduledStart: null,
  scheduledEnd: null,
  scheduledEndDate: null,
  status: "new",
  notes: null,
  locationOverride: null,
  dayLocations: {},
  customer: null,
  boat: null,
  marina: null,
  tech: null,
};

const withStart = (id: string, iso: string): CalendarJob => ({
  ...baseJob,
  id,
  scheduledStart: iso,
});

describe("clampHourBucket", () => {
  it("returns hour-5 for 9 AM", () => {
    expect(clampHourBucket(9)).toEqual({ bucket: 4, overflow: null });
  });
  it("returns 0 with under overflow for 4 AM", () => {
    expect(clampHourBucket(4)).toEqual({ bucket: 0, overflow: "before" });
  });
  it("returns 0 with under overflow for midnight", () => {
    expect(clampHourBucket(0)).toEqual({ bucket: 0, overflow: "before" });
  });
  it("returns 15 with after overflow for 9 PM", () => {
    expect(clampHourBucket(21)).toEqual({ bucket: 15, overflow: "after" });
  });
  it("returns 15 with after overflow for 11 PM", () => {
    expect(clampHourBucket(23)).toEqual({ bucket: 15, overflow: "after" });
  });
  it("returns 15 (no overflow) for 8 PM", () => {
    expect(clampHourBucket(20)).toEqual({ bucket: 15, overflow: null });
  });
});

describe("bucketJobsByHour", () => {
  it("returns 16 empty buckets when given no jobs", () => {
    const buckets = bucketJobsByHour([]);
    expect(buckets).toHaveLength(16);
    expect(buckets.every((b) => b.length === 0)).toBe(true);
  });

  it("groups jobs by start hour", () => {
    const a = withStart("a", "2026-05-27T09:00:00");
    const b = withStart("b", "2026-05-27T09:30:00");
    const c = withStart("c", "2026-05-27T15:00:00");
    const buckets = bucketJobsByHour([a, b, c]);
    expect(buckets[4]).toEqual([a, b]);   // 9 AM = bucket 4
    expect(buckets[10]).toEqual([c]);     // 3 PM = bucket 10
  });

  it("clamps a 4 AM job into bucket 0", () => {
    const j = withStart("j", "2026-05-27T04:00:00");
    const buckets = bucketJobsByHour([j]);
    expect(buckets[0]).toEqual([j]);
  });

  it("clamps a 10 PM job into bucket 15", () => {
    const j = withStart("j", "2026-05-27T22:00:00");
    const buckets = bucketJobsByHour([j]);
    expect(buckets[15]).toEqual([j]);
  });

  it("skips jobs without scheduledStart", () => {
    const j = { ...baseJob, id: "j" };
    expect(bucketJobsByHour([j])).toEqual(Array.from({ length: 16 }, () => []));
  });
});
