import { describe, it, expect } from "vitest";
import {
  normalizeId,
  parseMercurySerial,
  serialAtOrAfter,
  campaignAppliesToBoat,
  boatsForCampaign,
  compensatedHours,
  laborCodeSummary,
  completionBlocker,
  canComplete,
  hoursSummary,
  round2,
  isLive,
  statusLabel,
  outstanding,
} from "@/lib/campaigns/matching";
import {
  SERVICE_TYPE_OPTIONS,
  CAMPAIGN_SERVICE_TYPES,
  manufacturerForServiceType,
  serviceTypeForManufacturer,
  isCampaignServiceType,
  AXOPAR_CAMPAIGN,
  MERCURY_CAMPAIGN,
} from "@/lib/campaigns/constants";
import type { BoatMatchInput } from "@/lib/campaigns/types";

const boat = (over: Partial<BoatMatchInput> = {}): BoatMatchInput => ({
  id: "b1",
  name: "Northwind",
  hin: "FI-AXO9C148I425",
  engine_serial_port: "3B458751",
  engine_serial_starboard: null,
  ...over,
});

describe("normalizeId", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normalizeId("fi-axo9c148i425")).toBe("FIAXO9C148I425");
    expect(normalizeId(" 3b 458751 ")).toBe("3B458751");
  });
  it("treats null and undefined as empty", () => {
    expect(normalizeId(null)).toBe("");
    expect(normalizeId(undefined)).toBe("");
  });
});

describe("parseMercurySerial", () => {
  it("splits a prefix from the trailing number", () => {
    expect(parseMercurySerial("3B458751")).toEqual({ prefix: "3B", num: 458751 });
    expect(parseMercurySerial("2A991204")).toEqual({ prefix: "2A", num: 991204 });
  });
  it("handles a bare number", () => {
    expect(parseMercurySerial("1234567")).toEqual({ prefix: "", num: 1234567 });
  });
  it("returns null for unparseable input", () => {
    expect(parseMercurySerial("")).toBeNull();
    expect(parseMercurySerial(null)).toBeNull();
    expect(parseMercurySerial("NO-DIGITS")).toBeNull();
  });
});

describe("serialAtOrAfter", () => {
  it("matches at the boundary and after it", () => {
    expect(serialAtOrAfter("3B458751", "3B458751")).toBe(true);
    expect(serialAtOrAfter("3B458902", "3B458751")).toBe(true);
  });
  it("rejects serials before the boundary", () => {
    expect(serialAtOrAfter("3B458700", "3B458751")).toBe(false);
  });
  it("refuses to compare across different prefixes", () => {
    // 2A991204 is numerically larger but belongs to a different engine family.
    expect(serialAtOrAfter("2A991204", "3B458751")).toBe(false);
  });
  it("returns false rather than guessing when either side is unparseable", () => {
    expect(serialAtOrAfter(null, "3B458751")).toBe(false);
    expect(serialAtOrAfter("3B458751", null)).toBe(false);
    expect(serialAtOrAfter("UNKNOWN", "3B458751")).toBe(false);
  });
});

describe("campaignAppliesToBoat — Axopar matches on HIN", () => {
  const ax = {
    manufacturer: "axopar" as const,
    affected_hins: ["FI-AXO9C148I425", "FI-AXO9C148I426"],
    engine_serial_from: null,
  };

  it("matches a listed hull", () => {
    expect(campaignAppliesToBoat(ax, boat())).toBe(true);
  });
  it("matches regardless of dash and case formatting", () => {
    expect(campaignAppliesToBoat(ax, boat({ hin: "fiaxo9c148i425" }))).toBe(true);
  });
  it("does not match an unlisted hull", () => {
    expect(campaignAppliesToBoat(ax, boat({ hin: "FI-AXO9C133K901" }))).toBe(false);
  });
  it("does not match a boat with no HIN recorded", () => {
    expect(campaignAppliesToBoat(ax, boat({ hin: null }))).toBe(false);
  });
  it("applies to nothing when the campaign lists no hulls", () => {
    expect(
      campaignAppliesToBoat({ ...ax, affected_hins: [] }, boat())
    ).toBe(false);
  });
});

describe("campaignAppliesToBoat — Mercury matches on engine serial", () => {
  const mr = {
    manufacturer: "mercury" as const,
    affected_hins: [],
    engine_serial_from: "3B458751",
  };

  it("matches on the port engine", () => {
    expect(campaignAppliesToBoat(mr, boat())).toBe(true);
  });
  it("matches when only the starboard engine is in range", () => {
    expect(
      campaignAppliesToBoat(
        mr,
        boat({ engine_serial_port: "2A100000", engine_serial_starboard: "3B999999" })
      )
    ).toBe(true);
  });
  it("does not match an out-of-range engine", () => {
    expect(
      campaignAppliesToBoat(mr, boat({ engine_serial_port: "3B100000" }))
    ).toBe(false);
  });
  it("does not match when no serial is recorded — the gap this migration closes", () => {
    expect(
      campaignAppliesToBoat(
        mr,
        boat({ engine_serial_port: null, engine_serial_starboard: null })
      )
    ).toBe(false);
  });
  it("ignores HIN entirely", () => {
    expect(
      campaignAppliesToBoat(mr, boat({ hin: "COMPLETELY-DIFFERENT" }))
    ).toBe(true);
  });
});

describe("boatsForCampaign", () => {
  it("returns only affected boats, in input order", () => {
    const fleet = [
      boat({ id: "a", hin: "FI-AXO9C148I425" }),
      boat({ id: "b", hin: "FI-AXO9C133K901" }),
      boat({ id: "c", hin: "FI-AXO9C148I426" }),
    ];
    const result = boatsForCampaign(
      {
        manufacturer: "axopar",
        affected_hins: ["FI-AXO9C148I425", "FI-AXO9C148I426"],
        engine_serial_from: null,
      },
      fleet
    );
    expect(result.map((b) => b.id)).toEqual(["a", "c"]);
  });
});

describe("compensatedHours", () => {
  it("uses the stated figure for Axopar", () => {
    expect(
      compensatedHours({ manufacturer: "axopar", compensated_hours: 0.5, labor_codes: [] })
    ).toBe(0.5);
  });
  it("sums Mercury labor codes — MERCNET lists CA12 .5 + CA18 .5", () => {
    expect(
      compensatedHours({
        manufacturer: "mercury",
        compensated_hours: 0,
        labor_codes: [
          { code: "CA12", hours: 0.5 },
          { code: "CA18", hours: 0.5 },
        ],
      })
    ).toBe(1);
  });
  it("falls back to the stated figure when Mercury has no labor codes", () => {
    expect(
      compensatedHours({ manufacturer: "mercury", compensated_hours: 1.4, labor_codes: [] })
    ).toBe(1.4);
  });
});

describe("laborCodeSummary", () => {
  it("formats codes for display", () => {
    expect(
      laborCodeSummary([
        { code: "CA12", hours: 0.5 },
        { code: "CA18", hours: 0.5 },
      ])
    ).toBe("CA12 0.5 · CA18 0.5");
  });
  it("is empty when there are none", () => {
    expect(laborCodeSummary([])).toBe("");
    expect(laborCodeSummary(null)).toBe("");
  });
});

describe("completionBlocker — a claim needs a finding and a photo", () => {
  it("blocks when both are missing", () => {
    expect(completionBlocker({})).toBe("Needs a photo and a written finding");
  });
  it("blocks when only the photo is missing", () => {
    expect(completionBlocker({ conditions_found: "Replaced gasket", photo_count: 0 }))
      .toBe("Needs at least one photo");
  });
  it("blocks when only the finding is missing", () => {
    expect(completionBlocker({ conditions_found: "   ", photo_count: 2 }))
      .toBe("Needs a written finding");
  });
  it("clears when both are present", () => {
    expect(completionBlocker({ conditions_found: "Replaced gasket", photo_count: 1 }))
      .toBeNull();
    expect(canComplete({ conditions_found: "Replaced gasket", photo_count: 1 })).toBe(true);
  });
});

describe("hoursSummary", () => {
  const c = (h: number) =>
    ({ manufacturer: "axopar", compensated_hours: h, labor_codes: [] } as never);

  it("totals compensated and actual and reports the variance", () => {
    const r = hoursSummary([
      { campaign: c(1.5), actual_hours: "1.5" },
      { campaign: c(0.8), actual_hours: "1.1" },
    ]);
    expect(r.compensated).toBe(2.3);
    expect(r.actual).toBe(2.6);
    expect(r.variance).toBe(0.3);
  });
  it("treats blank actuals as zero rather than NaN", () => {
    const r = hoursSummary([{ campaign: c(0.5), actual_hours: "" }]);
    expect(r.actual).toBe(0);
    expect(r.variance).toBe(-0.5);
  });
  it("is zeroed for an empty list", () => {
    expect(hoursSummary([])).toEqual({ compensated: 0, actual: 0, variance: 0 });
  });
});

describe("round2 holds where the EPSILON trick fails", () => {
  it("rounds half-cent values up at magnitudes above 1", () => {
    // Number.EPSILON is fixed at 2.22e-16 while the gap grows with magnitude, so
    // Math.round((10.075 + Number.EPSILON) * 100) / 100 gives 10.07.
    expect(round2(10.075)).toBe(10.08);
    expect(round2(4.015)).toBe(4.02);
    expect(round2(1.005)).toBe(1.01);
  });
  it("leaves ordinary values alone", () => {
    expect(round2(2.3)).toBe(2.3);
    expect(round2(0)).toBe(0);
  });
  it("handles negatives symmetrically", () => {
    expect(round2(-0.5)).toBe(-0.5);
    expect(round2(-10.075)).toBe(-10.08);
  });
  it("coerces non-finite input to zero", () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe("voided entries — the app's 'delete'", () => {
  it("treats a voided entry as not live", () => {
    expect(isLive({ status: "voided" })).toBe(false);
    expect(isLive({ status: "open" })).toBe(true);
    expect(isLive({ status: "completed" })).toBe(true);
    expect(isLive({ status: "not_applicable" })).toBe(true);
  });

  it("excludes voided and completed from the outstanding list", () => {
    const rows = [
      { id: "1", status: "open" },
      { id: "2", status: "voided" },
      { id: "3", status: "completed" },
      { id: "4", status: "open" },
    ];
    expect(outstanding(rows).map((r) => r.id)).toEqual(["1", "4"]);
  });

  it("shows the withdrawal reason, because a bare 'Withdrawn' explains nothing", () => {
    expect(
      statusLabel({ status: "voided", voided_reason: "attached to the wrong boat" })
    ).toBe("Withdrawn — attached to the wrong boat");
    expect(statusLabel({ status: "voided" })).toBe("Withdrawn");
  });

  it("distinguishes a backfilled record from one captured live", () => {
    expect(statusLabel({ status: "completed", backfilled: true }))
      .toBe("Completed (recorded later)");
    expect(statusLabel({ status: "completed", backfilled: false })).toBe("Completed");
  });

  it("labels the remaining states", () => {
    expect(statusLabel({ status: "open" })).toBe("Open");
    expect(statusLabel({ status: "not_applicable" })).toBe("Not applicable");
  });
});

describe("service type constants", () => {
  it("puts both campaign types at the end of the list", () => {
    expect(SERVICE_TYPE_OPTIONS.slice(-2)).toEqual([AXOPAR_CAMPAIGN, MERCURY_CAMPAIGN]);
  });
  it("keeps every standard type", () => {
    expect(SERVICE_TYPE_OPTIONS).toContain("Engine Service");
    expect(SERVICE_TYPE_OPTIONS).toContain("Sea Trial");
    expect(SERVICE_TYPE_OPTIONS).toHaveLength(11);
  });
  it("maps service types to manufacturers both ways", () => {
    expect(manufacturerForServiceType(AXOPAR_CAMPAIGN)).toBe("axopar");
    expect(manufacturerForServiceType(MERCURY_CAMPAIGN)).toBe("mercury");
    expect(manufacturerForServiceType("Engine Service")).toBeNull();
    expect(serviceTypeForManufacturer("axopar")).toBe(AXOPAR_CAMPAIGN);
    expect(serviceTypeForManufacturer("mercury")).toBe(MERCURY_CAMPAIGN);
  });
  it("identifies campaign types", () => {
    expect(isCampaignServiceType(MERCURY_CAMPAIGN)).toBe(true);
    expect(isCampaignServiceType("Winterization")).toBe(false);
  });
  it("exposes a chip mark for each manufacturer", () => {
    expect(CAMPAIGN_SERVICE_TYPES.map((c) => c.mark)).toEqual(["AX", "MR"]);
  });
});
