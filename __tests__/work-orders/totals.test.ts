import { describe, it, expect } from "vitest";
import { computeTotals, laborForJob, laborDisplay, linePrice, type TotalsJob } from "@/lib/work-orders/totals";

const rate175 = { rate: 175, unit: "hour" as const };

function job(over: Partial<TotalsJob> = {}): TotalsJob {
  return {
    job_type: "frh", hours: 8, flat_price: null, boat_length_ft: null,
    rate: 175, rate_unit: "hour", labor_taxable: true, lines: [], ...over,
  };
}

describe("laborForJob", () => {
  it("frh = hours x rate", () => expect(laborForJob(job())).toBe(1400));
  it("flat = flat_price", () =>
    expect(laborForJob(job({ job_type: "flat", flat_price: 1850 }))).toBe(1850));
  it("per_foot = length x rate", () =>
    expect(laborForJob(job({ job_type: "per_foot", boat_length_ft: 28, rate: 10 }))).toBe(280));
  it("missing inputs => 0", () =>
    expect(laborForJob(job({ hours: null }))).toBe(0));
});

describe("linePrice", () => {
  it("part uses default margin when line margin null", () =>
    expect(linePrice({ kind: "part", qty: 1, unit_cost: 1386.24, margin_pct: null, taxable: true }, 25)).toBe(1732.8));
  it("line margin overrides default", () =>
    expect(linePrice({ kind: "part", qty: 1, unit_cost: 100, margin_pct: 0, taxable: true }, 25)).toBe(100));
  it("non-part kinds get no default margin", () =>
    expect(linePrice({ kind: "shipping", qty: 1, unit_cost: 51.98, margin_pct: null, taxable: true }, 25)).toBe(51.98));
  it("non-part respects explicit margin", () =>
    expect(linePrice({ kind: "other", qty: 2, unit_cost: 50, margin_pct: 10, taxable: true }, 25)).toBe(110));
});

describe("computeTotals — WO-4505 shape", () => {
  // Job 1: Install Transducer 8h@175 + part (cost 1386.24, 25% => 1732.80)
  //        + shop supplies 75 + shipping 51.98. Job 2: Travel 2h@175.
  const jobs: TotalsJob[] = [
    job({
      lines: [
        { kind: "part", qty: 1, unit_cost: 1386.24, margin_pct: null, taxable: true },
        { kind: "shop_supplies", qty: 1, unit_cost: 75, margin_pct: null, taxable: true },
        { kind: "shipping", qty: 1, unit_cost: 51.98, margin_pct: null, taxable: true },
      ],
    }),
    job({ hours: 2 }),
  ];

  it("rolls up charges by category and computes due/paid/balance", () => {
    const t = computeTotals({
      jobs, default_margin_pct: 25,
      taxes: [{ name: "Sales Tax", rate_pct: 7.5 }],
      cc_fee_pct: 3, payments: [1915.61],
    });
    expect(t.totalLabor).toBe(1750);
    expect(t.totalParts).toBe(1732.8);
    expect(t.shopSupplies).toBe(75);
    expect(t.shipping).toBe(51.98);
    expect(t.subtotal).toBe(3609.78);
    expect(t.taxLines).toEqual([{ name: "Sales Tax", rate_pct: 7.5, amount: 270.73 }]);
    expect(t.ccFee).toBe(116.42);          // 3% of (subtotal + tax)
    expect(t.amountDue).toBe(3996.93);
    expect(t.amountPaid).toBe(1915.61);
    expect(t.balanceDue).toBe(2081.32);
    expect(t.profit).toBe(346.56);         // 1732.80 - 1386.24
  });

  it("stacks multiple taxes on the same base", () => {
    const t = computeTotals({
      jobs: [job({ hours: 1 })], default_margin_pct: 25,
      taxes: [{ name: "WA", rate_pct: 6.5 }, { name: "Seattle", rate_pct: 3.85 }],
      cc_fee_pct: null, payments: [],
    });
    expect(t.taxLines.map((x) => x.amount)).toEqual([11.38, 6.74]);
    expect(t.amountDue).toBe(193.12);
  });

  it("excludes non-taxable lines and non-taxable labor from the tax base", () => {
    const t = computeTotals({
      jobs: [job({
        labor_taxable: false, hours: 1,
        lines: [{ kind: "other", qty: 1, unit_cost: 100, margin_pct: null, taxable: false }],
      })],
      default_margin_pct: 25, taxes: [{ name: "Tax", rate_pct: 10 }],
      cc_fee_pct: null, payments: [],
    });
    expect(t.subtotal).toBe(275);
    expect(t.taxLines[0].amount).toBe(0);
  });

  it("no cc fee when pct is null, fee row when set", () => {
    const base = { jobs: [job({ hours: 1 })], default_margin_pct: 0, taxes: [], payments: [] };
    expect(computeTotals({ ...base, cc_fee_pct: null }).ccFee).toBe(0);
    expect(computeTotals({ ...base, cc_fee_pct: 3 }).ccFee).toBe(5.25);
  });

  it("handles below-cost lines (negative margin) in profit", () => {
    const t = computeTotals({
      jobs: [job({ hours: 0, lines: [{ kind: "part", qty: 1, unit_cost: 100, margin_pct: -10, taxable: true }] })],
      default_margin_pct: 25, taxes: [], cc_fee_pct: null, payments: [],
    });
    expect(t.totalParts).toBe(90);
    expect(t.profit).toBe(-10);
  });

  it("empty work order returns clean zeros", () => {
    const t = computeTotals({ jobs: [], default_margin_pct: 25, taxes: [{ name: "Tax", rate_pct: 10 }], cc_fee_pct: 3, payments: [] });
    expect(t.subtotal).toBe(0);
    expect(t.taxLines[0].amount).toBe(0);
    expect(t.ccFee).toBe(0);
    expect(t.amountDue).toBe(0);
    expect(t.balanceDue).toBe(0);
    expect(t.jobSubtotals).toEqual([]);
  });
});

describe("laborDisplay", () => {
  it("maps unit/qty per job type", () => {
    expect(laborDisplay({ job_type: "frh", hours: 8, flat_price: null, boat_length_ft: null, rate: 175 })).toEqual({ unit: 175, qty: 8 });
    expect(laborDisplay({ job_type: "frh", hours: null, flat_price: null, boat_length_ft: null, rate: 175 })).toEqual({ unit: 175, qty: 0 });
    expect(laborDisplay({ job_type: "flat", hours: null, flat_price: 1850, boat_length_ft: null, rate: 0 })).toEqual({ unit: 1850, qty: 1 });
    expect(laborDisplay({ job_type: "per_foot", hours: null, flat_price: null, boat_length_ft: 28, rate: 10 })).toEqual({ unit: 10, qty: 28 });
  });
});
