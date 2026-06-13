/**
 * lib/quickbooks/invoice.ts
 * PURE payload builder — no I/O, fully unit-testable.
 *
 * Converts a WorkOrderFull + computed WOTotals into a QBO Invoice object
 * ready to POST to /v3/company/{realm}/invoice.
 *
 * Tax note: QBO may recompute taxes via Automated Sales Tax (AST).
 * We pass TxnTaxDetail.TotalTax as a best-effort override from our own
 * computed totals. When AST is enabled on the QBO company, QBO may ignore
 * this value and recompute from line-level TaxCodeRef. Acceptable for now.
 */

import {
  laborForJob,
  linePrice,
  round2,
  type TotalsJob,
  type TotalsLine,
} from "@/lib/work-orders/totals";
import type { WorkOrderFull, WOJob, WOLine } from "@/lib/work-orders/types";
import type { WOTotals } from "@/lib/work-orders/totals";

// ── Item references (QBO IDs for the three service items) ─────────────────

export interface QbItemRefs {
  /** QBO Item.Id for "Labor" */
  labor: string;
  /** QBO Item.Id for "Parts & Materials" */
  parts: string;
  /** QBO Item.Id for "Service Fees" */
  fees: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────

/** Adapter: WOJob -> TotalsJob shape expected by laborForJob. */
function toTotalsJob(job: WOJob): TotalsJob {
  return {
    job_type: job.job_type,
    hours: job.hours == null ? null : Number(job.hours),
    flat_price: job.flat_price == null ? null : Number(job.flat_price),
    boat_length_ft: job.boat_length_ft == null ? null : Number(job.boat_length_ft),
    rate: Number(job.price_levels?.rate ?? 0),
    rate_unit: job.price_levels?.unit ?? "hour",
    labor_taxable: job.labor_taxable,
    lines: [],
  };
}

/** Adapter: WOLine -> TotalsLine shape expected by linePrice. */
function toTotalsLine(line: WOLine): TotalsLine {
  return {
    kind: line.kind,
    qty: Number(line.qty),
    unit_cost: Number(line.unit_cost),
    margin_pct: line.margin_pct == null ? null : Number(line.margin_pct),
    taxable: line.taxable,
  };
}

/** Labor description string — adds unit detail for frh jobs. */
function laborDescription(job: WOJob): string {
  const base = `Labor — ${job.title}`;
  if (job.job_type === "frh" && job.hours != null && job.price_levels?.rate != null) {
    return `${base} (${Number(job.hours)} hrs @ $${Number(job.price_levels.rate)}/hr)`;
  }
  return base;
}

// ── buildInvoicePayload ───────────────────────────────────────────────────

/**
 * Builds a QBO Invoice object from a WorkOrderFull.
 *
 * @param wo           Full work order (with joined jobs, lines, payments, customer)
 * @param totals       Pre-computed WOTotals (from computeTotals(toTotalsInput(wo)))
 * @param customerId   QBO Customer.Id (find-or-create before calling)
 * @param items        QBO Item.Ids for Labor / Parts & Materials / Service Fees
 */
export function buildInvoicePayload(
  wo: WorkOrderFull,
  totals: WOTotals,
  customerId: string,
  items: QbItemRefs
): object {
  const lines: object[] = [];
  let lineNum = 1;

  // ── Job lines (in position order) ─────────────────────────────────────
  const jobs = [...(wo.work_order_jobs ?? [])].sort((a, b) => a.position - b.position);

  for (const job of jobs) {
    const tj = toTotalsJob(job);
    const laborAmount = laborForJob(tj);

    // Labor line — only when labor > 0
    if (laborAmount > 0) {
      const { qty: laborQty } = (() => {
        if (job.job_type === "flat") return { qty: 1 };
        if (job.job_type === "per_foot") return { qty: Number(job.boat_length_ft ?? 0) };
        return { qty: Number(job.hours ?? 0) }; // frh
      })();
      const unitPrice = laborQty > 0 ? round2(laborAmount / laborQty) : laborAmount;

      lines.push({
        Id: String(lineNum++),
        LineNum: lineNum - 1,
        Amount: laborAmount,
        Description: laborDescription(job),
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          ItemRef: { value: items.labor },
          Qty: laborQty,
          UnitPrice: unitPrice,
        },
      });
    }

    // Part / material lines
    const sortedLines = [...(job.work_order_lines ?? [])].sort(
      (a, b) => a.position - b.position
    );

    for (const line of sortedLines) {
      const tl = toTotalsLine(line);
      const defaultMargin = Number(wo.default_margin_pct);
      const amount = linePrice(tl, defaultMargin);
      const qty = Number(line.qty);
      const unitPrice = qty > 0 ? round2(amount / qty) : amount;

      const descParts = [line.item_code, line.description].filter(Boolean);
      const description = descParts.join(" — ") || line.kind;

      lines.push({
        Id: String(lineNum++),
        LineNum: lineNum - 1,
        Amount: amount,
        Description: description,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          ItemRef: { value: items.parts },
          Qty: qty,
          UnitPrice: unitPrice,
        },
      });
    }
  }

  // ── CC fee line ───────────────────────────────────────────────────────
  if (totals.ccFee > 0 && wo.cc_fee_pct != null) {
    lines.push({
      Id: String(lineNum++),
      LineNum: lineNum - 1,
      Amount: totals.ccFee,
      Description: `Credit Card Fee (${Number(wo.cc_fee_pct)}%)`,
      DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: {
        ItemRef: { value: items.fees },
        Qty: 1,
        UnitPrice: totals.ccFee,
      },
    });
  }

  // ── Base payload ──────────────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    DocNumber: `WO-${wo.wo_number}`,
    TxnDate: wo.wo_date,
    CustomerRef: { value: customerId },
    PrivateNote: `Synced from Marine Tech WO-${wo.wo_number}`,
    Line: lines,
  };

  // Optional customer memo (printed notes)
  if (wo.printed_notes) {
    payload.CustomerMemo = { value: wo.printed_notes };
  }

  // Tax override — best-effort; QBO AST may recompute (see file-level comment)
  const totalTax = totals.taxLines.reduce((s, t) => s + t.amount, 0);
  if (totalTax > 0) {
    payload.TxnTaxDetail = {
      TotalTax: round2(totalTax),
    };
  }

  return payload;
}
