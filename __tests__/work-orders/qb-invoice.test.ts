import { describe, it, expect } from "vitest";
import { buildInvoicePayload } from "@/lib/quickbooks/invoice";
import { computeTotals } from "@/lib/work-orders/totals";
import { toTotalsInput as qToTotalsInput } from "@/lib/work-orders/queries";
import type { WorkOrderFull } from "@/lib/work-orders/types";

const ITEMS = { labor: "item-labor-1", parts: "item-parts-1", fees: "item-fees-1" };

// ── WO-4505 fixture ────────────────────────────────────────────────────────
// Job 1: Install Transducer — frh 8h @ $175 = $1400 labor
//   + part (cost 1386.24, default margin 25% => $1732.80)
//   + shop_supplies $75
//   + shipping $51.98
// Job 2: Travel — frh 2h @ $175 = $350
// Taxes: Sales Tax 7.5% on taxable base ($1400+$1732.80+$75+$51.98+$350) = $270.73
// CC fee: 3% of (subtotal $3609.78 + tax $270.73) = $116.42

function makeWo(override?: Partial<WorkOrderFull>): WorkOrderFull {
  return {
    id: "wo-uuid-1",
    wo_number: 4505,
    status: "approved",
    customer_id: "cust-1",
    boat_id: "boat-1",
    location_id: null,
    service_advisor: null,
    wo_date: "2026-06-12",
    default_margin_pct: "25" as unknown as number,
    taxes: [{ name: "Sales Tax", rate_pct: 7.5 }],
    cc_fee_pct: "3" as unknown as number,
    printed_notes: "Please call before arrival.",
    internal_notes: null,
    approved_at: "2026-06-12T10:00:00Z",
    completed_at: null,
    invoiced_at: null,
    quickbooks_invoice_id: null,
    quickbooks_synced_at: null,
    customers: { id: "cust-1", name: "Jeff Brown", email: "jeff@example.com", phone: "206-555-1234" },
    boats: { id: "boat-1", name: "Sea Trial", make_model: "Hatteras 42", year: 2018, hin: null },
    profiles: { full_name: "Connor Gray" },
    work_order_jobs: [
      {
        id: "job-1",
        work_order_id: "wo-uuid-1",
        position: 0,
        title: "Install Transducer",
        description: null,
        notes_to_tech: null,
        cause: null,
        correction: null,
        customer_status: "approved",
        job_status: "done",
        job_type: "frh",
        price_level_id: "pl-1",
        hours: "8" as unknown as number,
        flat_price: null,
        boat_length_ft: null,
        labor_taxable: true,
        assigned_tech: null,
        price_levels: { id: "pl-1", name: "Standard", rate: "175" as unknown as number, unit: "hour", active: true },
        work_order_lines: [
          {
            id: "line-1", work_order_job_id: "job-1", kind: "part",
            item_code: "TRANSD-001", description: "Airmar B175M Transducer",
            qty: "1" as unknown as number, unit_cost: "1386.24" as unknown as number,
            margin_pct: null, taxable: true, position: 0,
          },
          {
            id: "line-2", work_order_job_id: "job-1", kind: "shop_supplies",
            item_code: null, description: "Shop Supplies",
            qty: "1" as unknown as number, unit_cost: "75" as unknown as number,
            margin_pct: null, taxable: true, position: 1,
          },
          {
            id: "line-3", work_order_job_id: "job-1", kind: "shipping",
            item_code: null, description: "Freight",
            qty: "1" as unknown as number, unit_cost: "51.98" as unknown as number,
            margin_pct: null, taxable: true, position: 2,
          },
        ],
      },
      {
        id: "job-2",
        work_order_id: "wo-uuid-1",
        position: 1,
        title: "Travel",
        description: null,
        notes_to_tech: null,
        cause: null,
        correction: null,
        customer_status: "approved",
        job_status: "done",
        job_type: "frh",
        price_level_id: "pl-1",
        hours: "2" as unknown as number,
        flat_price: null,
        boat_length_ft: null,
        labor_taxable: true,
        assigned_tech: null,
        price_levels: { id: "pl-1", name: "Standard", rate: "175" as unknown as number, unit: "hour", active: true },
        work_order_lines: [],
      },
    ],
    work_order_payments: [],
    ...override,
  } as unknown as WorkOrderFull;
}

// ── Test 1: Full WO with fee and taxes ────────────────────────────────────

describe("buildInvoicePayload — WO-4505 full", () => {
  const wo = makeWo();
  const totals = computeTotals(qToTotalsInput(wo));
  const payload = buildInvoicePayload(wo, totals, "qbo-cust-99", ITEMS) as Record<string, unknown>;

  it("sets DocNumber to WO-4505", () => {
    expect(payload.DocNumber).toBe("WO-4505");
  });

  it("sets TxnDate to wo_date", () => {
    expect(payload.TxnDate).toBe("2026-06-12");
  });

  it("sets CustomerRef", () => {
    expect(payload.CustomerRef).toEqual({ value: "qbo-cust-99" });
  });

  it("sets CustomerMemo from printed_notes", () => {
    expect(payload.CustomerMemo).toEqual({ value: "Please call before arrival." });
  });

  it("sets PrivateNote with WO number", () => {
    expect(payload.PrivateNote).toBe("Synced from Marine Tech WO-4505");
  });

  it("produces 6 lines: 2 labor + 3 parts/supplies/shipping + 1 fee", () => {
    const lines = payload.Line as object[];
    expect(lines).toHaveLength(6);
  });

  it("first labor line: $1400, 8 qty, $175 unit, items.labor ref", () => {
    const lines = payload.Line as Record<string, unknown>[];
    const laborLine = lines[0] as Record<string, unknown>;
    expect(laborLine.Amount).toBe(1400);
    expect(laborLine.Description).toBe("Labor — Install Transducer (8 hrs @ $175/hr)");
    const detail = laborLine.SalesItemLineDetail as Record<string, unknown>;
    expect(detail.Qty).toBe(8);
    expect(detail.UnitPrice).toBe(175);
    expect(detail.ItemRef).toEqual({ value: ITEMS.labor });
  });

  it("part line: Amount 1732.80, item_code+description joined", () => {
    const lines = payload.Line as Record<string, unknown>[];
    // After job-1 labor (index 0): part (index 1), shop_supplies (2), shipping (3)
    const partLine = lines[1] as Record<string, unknown>;
    expect(partLine.Amount).toBe(1732.8);
    expect(partLine.Description).toBe("TRANSD-001 — Airmar B175M Transducer");
    const detail = partLine.SalesItemLineDetail as Record<string, unknown>;
    expect(detail.ItemRef).toEqual({ value: ITEMS.parts });
    expect(detail.Qty).toBe(1);
    expect(detail.UnitPrice).toBe(1732.8);
  });

  it("second labor line (Travel 2h): $350", () => {
    const lines = payload.Line as Record<string, unknown>[];
    // job-1 labor(0), part(1), shop_supplies(2), shipping(3), job-2 labor(4), fee(5)
    const travelLabor = lines[4] as Record<string, unknown>;
    expect(travelLabor.Amount).toBe(350);
    expect(travelLabor.Description).toBe("Labor — Travel (2 hrs @ $175/hr)");
  });

  it("CC fee line: $116.42 with items.fees ref", () => {
    const lines = payload.Line as Record<string, unknown>[];
    const feeLine = lines[5] as Record<string, unknown>;
    expect(feeLine.Amount).toBe(116.42);
    expect(feeLine.Description).toBe("Credit Card Fee (3%)");
    const detail = feeLine.SalesItemLineDetail as Record<string, unknown>;
    expect(detail.ItemRef).toEqual({ value: ITEMS.fees });
  });

  it("TxnTaxDetail.TotalTax = 270.73", () => {
    const taxDetail = payload.TxnTaxDetail as Record<string, unknown>;
    expect(taxDetail).toBeDefined();
    expect(taxDetail.TotalTax).toBe(270.73);
  });
});

// ── Test 2: No fee, no taxes ───────────────────────────────────────────────

describe("buildInvoicePayload — no fee, no taxes", () => {
  const wo = makeWo({
    cc_fee_pct: null,
    taxes: [],
    printed_notes: null,
  });
  const totals = computeTotals(qToTotalsInput(wo));
  const payload = buildInvoicePayload(wo, totals, "qbo-cust-99", ITEMS) as Record<string, unknown>;

  it("has no fee line — 5 lines total (2 labor + 3 parts)", () => {
    const lines = payload.Line as object[];
    expect(lines).toHaveLength(5);
  });

  it("has no TxnTaxDetail", () => {
    expect(payload.TxnTaxDetail).toBeUndefined();
  });

  it("has no CustomerMemo when printed_notes is null", () => {
    expect(payload.CustomerMemo).toBeUndefined();
  });
});
