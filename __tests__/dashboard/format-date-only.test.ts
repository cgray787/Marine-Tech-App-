import { describe, it, expect } from "vitest";
import { formatDateOnly } from "@/lib/utils";

describe("formatDateOnly", () => {
  it("parses YYYY-MM-DD as local date (no UTC-midnight shift)", () => {
    expect(formatDateOnly("2026-06-04")).toBe("Jun 4, 2026");
  });

  it("returns N/A for null", () => {
    expect(formatDateOnly(null)).toBe("N/A");
  });

  it("returns correct date for month boundary edge case", () => {
    expect(formatDateOnly("2026-05-01")).toBe("May 1, 2026");
  });

  it("returns correct date for end-of-month", () => {
    expect(formatDateOnly("2026-05-19")).toBe("May 19, 2026");
  });
});
