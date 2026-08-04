import { describe, it, expect } from "vitest";
import { round2, computeTotals } from "@/lib/work-orders/totals";

/**
 * Regression tests for the rounding weakness found during the 2026-08 audit.
 *
 * The old implementation nudged by a fixed Number.EPSILON (2.22e-16) before
 * rounding. That rescued half-cent values near 1.0 but stopped working as
 * magnitude grew, so identical ties rounded differently depending on size.
 */
describe("round2 — half-cent ties must resolve the same at every magnitude", () => {
  const ties: Array<[number, number]> = [
    [1.005, 1.01],
    [2.675, 2.68],
    [4.015, 4.02],
    [8.165, 8.17],
    [10.075, 10.08],
    [1234.565, 1234.57],
    [99999.995, 100000],
  ];

  it.each(ties)("rounds %d up to %d", (input, expected) => {
    expect(round2(input)).toBe(expected);
  });

  it("rounds negatives away from zero, symmetrically", () => {
    expect(round2(-10.075)).toBe(-10.08);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-0.5)).toBe(-0.5);
  });

  it("absorbs classic float drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.1 * 3)).toBe(3.3);
  });

  it("does not round up below the tie", () => {
    expect(round2(1.0049)).toBe(1);
    expect(round2(10.0749)).toBe(10.07);
  });

  it("leaves exact values untouched", () => {
    expect(round2(2.3)).toBe(2.3);
    expect(round2(0)).toBe(0);
    expect(round2(175)).toBe(175);
  });

  it("coerces non-finite input to zero rather than propagating NaN into a total", () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
    expect(round2(-Infinity)).toBe(0);
  });
});

describe("computeTotals still balances end to end", () => {
  it("carries labor, parts, tax and cc fee into a consistent amount due", () => {
    const t = computeTotals({
      jobs: [
        {
          job_type: "frh",
          hours: 2.5,
          rate: 175,
          flat_price: null,
          boat_length_ft: null,
          labor_taxable: false,
          lines: [
            { kind: "part", qty: 3, unit_cost: 8.3, margin_pct: null, taxable: true },
            { kind: "shop_supplies", qty: 1, unit_cost: 75, margin_pct: 0, taxable: true },
          ],
        },
      ],
      taxes: [{ name: "WA Sales Tax", rate_pct: 10.35 }],
      cc_fee_pct: 3,
      default_margin_pct: 25,
      payments: [100],
    } as never);

    // subtotal must equal the sum of its published parts, with no drift.
    const sum = round2(
      t.totalLabor + t.totalParts + t.shopSupplies + t.shipping + t.other
    );
    expect(t.subtotal).toBe(sum);

    const taxTotal = round2(t.taxLines.reduce((s, l) => s + l.amount, 0));
    expect(t.amountDue).toBe(round2(t.subtotal + taxTotal + t.ccFee));
    expect(t.balanceDue).toBe(round2(t.amountDue - t.amountPaid));
    expect(t.amountPaid).toBe(100);
  });
});
