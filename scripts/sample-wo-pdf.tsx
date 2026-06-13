/**
 * TEMP script — DO NOT COMMIT.
 * Renders a demo WO to /Users/connorgray/.claude/jobs/16f77d12/tmp/sample-work-order-v2.pdf
 * Run: npx tsx scripts/sample-wo-pdf.tsx
 */
import path from "path";
import { renderToFile } from "@react-pdf/renderer";
import { WorkOrderPdf } from "../lib/work-orders/pdf";
import { computeTotals, round2 } from "../lib/work-orders/totals";
import { toTotalsInput } from "../lib/work-orders/queries";
import type { WorkOrderFull } from "../lib/work-orders/types";

const wo: WorkOrderFull = {
  id: "demo-id-4505",
  wo_number: 4505,
  status: "approved",
  customer_id: "cust-1",
  boat_id: "boat-1",
  location_id: "loc-seattle",
  service_advisor: "advisor-1",
  wo_date: "2026-05-19",
  default_margin_pct: 25,
  taxes: [{ name: "Sales Tax", rate_pct: 7.5 }],
  cc_fee_pct: 3,
  printed_notes: "Invoice B12149 sent 6.1.2026 Transducer revised 6.2.2026",
  internal_notes: null,
  approved_at: "2026-05-19T10:00:00Z",
  completed_at: null,
  invoiced_at: null,
  quickbooks_invoice_id: null,
  quickbooks_synced_at: null,
  customers: {
    id: "cust-1",
    name: "Dave MacEwen",
    email: "dmacewen@sbcglobal.net",
    phone: "(650) 967-9787",
  },
  boats: {
    id: "boat-1",
    name: "2022 Axopar 28 Cabin",
    make_model: "Axopar 28 Cabin",
    year: 2022,
    hin: "FI-AXO8C477L122",
  },
  profiles: { full_name: "Darik Swenson" },
  locations: { name: "Seattle" },
  work_order_jobs: [
    {
      id: "job-1",
      work_order_id: "demo-id-4505",
      position: 1,
      title: "Install Transducer",
      description: null,
      notes_to_tech: null,
      cause: null,
      correction: null,
      customer_status: "estimate",
      job_status: "open",
      job_type: "frh",
      price_level_id: "pl-seattle",
      hours: 8,
      flat_price: null,
      boat_length_ft: null,
      labor_taxable: true,
      assigned_tech: null,
      price_levels: { id: "pl-seattle", name: "Seattle", rate: 175, unit: "hour", active: true },
      profiles: null,
      work_order_lines: [
        {
          id: "line-1",
          work_order_job_id: "job-1",
          kind: "part",
          item_code: "23718737",
          description: "B175 High Wide Chirp, 1kW, 20° Tilted Element, M&M Transducer, DT",
          qty: 1,
          unit_cost: 1386.24,
          margin_pct: 25,
          taxable: true,
          position: 1,
        },
        {
          id: "line-2",
          work_order_job_id: "job-1",
          kind: "shop_supplies",
          item_code: "Shop Supplies",
          description: "Sealant, Zip Ties, Rags, Cleaning Products, Etc.",
          qty: 1,
          unit_cost: 75,
          margin_pct: 0,
          taxable: true,
          position: 2,
        },
        {
          id: "line-3",
          work_order_job_id: "job-1",
          kind: "shipping",
          item_code: "Shipping & Handling",
          description: "",
          qty: 1,
          unit_cost: 51.98,
          margin_pct: 0,
          taxable: true,
          position: 3,
        },
      ],
    },
    {
      id: "job-2",
      work_order_id: "demo-id-4505",
      position: 2,
      title: "Travel Fee",
      description: null,
      notes_to_tech: null,
      cause: null,
      correction: null,
      customer_status: "estimate",
      job_status: "open",
      job_type: "frh",
      price_level_id: "pl-seattle",
      hours: 2,
      flat_price: null,
      boat_length_ft: null,
      labor_taxable: true,
      assigned_tech: null,
      price_levels: { id: "pl-seattle", name: "Seattle", rate: 175, unit: "hour", active: true },
      profiles: null,
      work_order_lines: [],
    },
  ],
  work_order_payments: [
    {
      id: "pmt-1",
      work_order_id: "demo-id-4505",
      paid_on: "2026-06-04",
      method: "Wire Transfer ACH",
      note: "payment for Transducer only",
      amount: 1915.61,
    },
  ],
};

const totals = computeTotals(toTotalsInput(wo));

// ── Sanity assertions (throw if math is wrong) ────────────────────────────────
function assert(label: string, actual: number, expected: number) {
  if (round2(actual) !== round2(expected)) {
    throw new Error(`Assertion failed: ${label} expected ${expected}, got ${actual}`);
  }
}

assert("subtotal",   totals.subtotal,            3609.78);
assert("Sales Tax",  totals.taxLines[0].amount,  270.73);
assert("ccFee",      totals.ccFee,               116.42);
assert("amountDue",  totals.amountDue,            3996.93);
assert("amountPaid", totals.amountPaid,           1915.61);
assert("balanceDue", totals.balanceDue,           2081.32);

console.log("✓ Totals assertions passed:");
console.log(`  subtotal:    $${totals.subtotal}`);
console.log(`  Sales Tax:   $${totals.taxLines[0].amount}`);
console.log(`  CC Fee:      $${totals.ccFee}`);
console.log(`  Amount Due:  $${totals.amountDue}`);
console.log(`  Amount Paid: $${totals.amountPaid}`);
console.log(`  Balance:     $${totals.balanceDue}`);

// ── Render ────────────────────────────────────────────────────────────────────
const logoSrc = path.resolve(
  "/Users/connorgray/Desktop/Claude OS/marine-tech-app/public/jby-logo.png"
);

const outPath = "/Users/connorgray/.claude/jobs/16f77d12/tmp/sample-work-order-v2.pdf";

console.log("\nRendering PDF...");
renderToFile(<WorkOrderPdf wo={wo} totals={totals} logoSrc={logoSrc} />, outPath)
  .then(() => {
    const fs = require("fs");
    const stats = fs.statSync(outPath);
    console.log(`✓ Written to: ${outPath}`);
    console.log(`  Size: ${stats.size.toLocaleString()} bytes (${(stats.size / 1024).toFixed(1)} KB)`);
  })
  .catch((err: unknown) => {
    console.error("Failed:", err);
    process.exit(1);
  });
