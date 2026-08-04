// Pure money math for work orders. The ONLY place totals are computed —
// editor, list, and print all call computeTotals so figures always agree.
import type { JobType, LineKind, TaxEntry } from "./types";

export interface TotalsLine {
  kind: LineKind; qty: number; unit_cost: number;
  margin_pct: number | null; taxable: boolean;
}

export interface TotalsJob {
  job_type: JobType; hours: number | null; flat_price: number | null;
  boat_length_ft: number | null; rate: number;
  /** informational; laborForJob keys off job_type */
  rate_unit: "hour" | "foot";
  labor_taxable: boolean; lines: TotalsLine[];
}

export interface TotalsInput {
  jobs: TotalsJob[]; default_margin_pct: number; taxes: TaxEntry[];
  cc_fee_pct: number | null; payments: number[];
}

export interface TaxLineOut extends TaxEntry { amount: number; }

export interface WOTotals {
  totalLabor: number; totalParts: number; shopSupplies: number;
  shipping: number; other: number; subtotal: number;
  taxLines: TaxLineOut[]; ccFee: number; amountDue: number;
  amountPaid: number; balanceDue: number; profit: number;
  jobSubtotals: number[];
}

/**
 * Round to cents.
 *
 * The previous implementation nudged by `Number.EPSILON` before rounding — a
 * common trick to rescue values like 1.005 that float storage places a hair below
 * the half-cent. It works there, but EPSILON is a fixed 2.22e-16 while the gap it
 * must bridge grows with magnitude, so the guard silently stopped helping as
 * amounts got larger: round2(10.075) gave 10.07 and round2(4.015) gave 4.01,
 * while round2(1.005) correctly gave 1.01. Half-cent ties therefore resolved
 * differently depending on how big the number was, which is not a property
 * billing code should have.
 *
 * Scaling to integer hundredths with a relative epsilon fixes it at every
 * magnitude. Ties round away from zero, matching how an invoice is expected to
 * round.
 */
export const round2 = (n: number) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const scaled = x * 100;
  // Relative nudge: proportional to the value, so it keeps working as x grows.
  const nudge = Math.abs(scaled) * Number.EPSILON * 4;
  return (
    Math.round(scaled + (x >= 0 ? nudge : -nudge)) / 100
  );
};

export function laborForJob(j: TotalsJob): number {
  if (j.job_type === "flat") return round2(j.flat_price ?? 0);
  if (j.job_type === "per_foot") return round2((j.boat_length_ft ?? 0) * j.rate);
  return round2((j.hours ?? 0) * j.rate); // frh
}

/** Display mapping for the labor row: which figures show as unit price and qty per job_type. */
export function laborDisplay(j: Pick<TotalsJob, "job_type" | "hours" | "flat_price" | "boat_length_ft" | "rate">): { unit: number; qty: number } {
  if (j.job_type === "flat") return { unit: j.flat_price ?? 0, qty: 1 };
  if (j.job_type === "per_foot") return { unit: j.rate, qty: j.boat_length_ft ?? 0 };
  return { unit: j.rate, qty: j.hours ?? 0 }; // frh
}

export function effectiveMargin(line: Pick<TotalsLine, "kind" | "margin_pct">, defaultMargin: number): number {
  if (line.margin_pct != null) return line.margin_pct;
  return line.kind === "part" ? defaultMargin : 0;
}

export function linePrice(line: TotalsLine, defaultMargin: number): number {
  const m = effectiveMargin(line, defaultMargin);
  return round2(line.qty * line.unit_cost * (1 + m / 100));
}

export function computeTotals(input: TotalsInput): WOTotals {
  const buckets: Record<"part" | "shop_supplies" | "shipping" | "other", number> =
    { part: 0, shop_supplies: 0, shipping: 0, other: 0 };
  let totalLabor = 0, taxableBase = 0, profit = 0;
  const jobSubtotals: number[] = [];

  for (const j of input.jobs) {
    const labor = laborForJob(j);
    totalLabor = round2(totalLabor + labor);
    if (j.labor_taxable) taxableBase += labor;
    let jobTotal = labor;
    for (const l of j.lines) {
      const price = linePrice(l, input.default_margin_pct);
      const bucket = l.kind === "flat_service" ? "other" : l.kind === "part" ? "part" : l.kind === "shop_supplies" ? "shop_supplies" : l.kind === "shipping" ? "shipping" : "other";
      buckets[bucket] = round2(buckets[bucket] + price);
      if (l.taxable) taxableBase += price;
      profit += price - l.qty * l.unit_cost;
      jobTotal += price;
    }
    jobSubtotals.push(round2(jobTotal));
  }

  const subtotal = round2(totalLabor + buckets.part + buckets.shop_supplies + buckets.shipping + buckets.other);
  const taxLines: TaxLineOut[] = input.taxes.map((t) => ({ ...t, amount: round2(taxableBase * t.rate_pct / 100) }));
  const taxTotal = taxLines.reduce((s, t) => s + t.amount, 0);
  const ccFee = input.cc_fee_pct != null ? round2((subtotal + taxTotal) * input.cc_fee_pct / 100) : 0;
  const amountDue = round2(subtotal + taxTotal + ccFee);
  const amountPaid = round2(input.payments.reduce((s, p) => s + Number(p), 0));

  return {
    totalLabor, totalParts: buckets.part, shopSupplies: buckets.shop_supplies,
    shipping: buckets.shipping, other: buckets.other, subtotal, taxLines, ccFee,
    amountDue, amountPaid, balanceDue: round2(amountDue - amountPaid),
    profit: round2(profit), jobSubtotals,
  };
}

export const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** True when a completed/invoiced work order still has money outstanding. */
export const isBalanceOverdue = (status: string, balanceDue: number) =>
  balanceDue > 0 && (status === "completed" || status === "invoiced");
