import { describe, it, expect } from "vitest";
import { toTotalsInput } from "@/lib/work-orders/queries";
import { computeTotals } from "@/lib/work-orders/totals";
import type { WorkOrderFull } from "@/lib/work-orders/types";

it("adapts joined rows (numeric strings) into totals input", () => {
  const wo = {
    id: "w1", wo_number: 1001, status: "draft", customer_id: "c1", boat_id: null,
    location_id: null, service_advisor: null, wo_date: "2026-06-12",
    default_margin_pct: "25" as unknown as number,
    taxes: [{ name: "Tax", rate_pct: 10 }], cc_fee_pct: null,
    printed_notes: null, internal_notes: null, approved_at: null, completed_at: null, invoiced_at: null,
    work_order_jobs: [{
      id: "j1", work_order_id: "w1", position: 0, title: "T", description: null,
      notes_to_tech: null, cause: null, correction: null, customer_status: "estimate",
      job_status: "open", job_type: "frh", price_level_id: "p1",
      hours: "2" as unknown as number, flat_price: null, boat_length_ft: null,
      labor_taxable: true, assigned_tech: null,
      price_levels: { id: "p1", name: "Std", rate: "175" as unknown as number, unit: "hour", active: true },
      work_order_lines: [{
        id: "l1", work_order_job_id: "j1", kind: "part", item_code: null, description: null,
        qty: "1" as unknown as number, unit_cost: "100" as unknown as number,
        margin_pct: null, taxable: true, position: 0,
      }],
    }],
    work_order_payments: [{ id: "pay1", work_order_id: "w1", paid_on: "2026-06-12", method: null, note: null, amount: "50" as unknown as number }],
  } as unknown as WorkOrderFull;

  const t = computeTotals(toTotalsInput(wo));
  expect(t.totalLabor).toBe(350);
  expect(t.totalParts).toBe(125);
  expect(t.amountDue).toBe(522.5);
  expect(t.balanceDue).toBe(472.5);
});
