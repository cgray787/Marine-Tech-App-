// Framework-pure (no "use client", no next imports) — renders in browser and Node.
// Mirrors the print page layout 1:1. NEVER exposes costs/margin/profit/internal_notes.
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { WorkOrderFull } from "./types";
import type { WOTotals } from "./totals";
import {
  laborForJob,
  laborDisplay,
  linePrice,
  fmtUSD,
} from "./totals";
import { toTotalsInput } from "./queries";
import { letterheadFor } from "./letterhead";

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#000",
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    backgroundColor: "#fff",
  },

  // ── Header row ──────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  headerCenter: {
    width: 70,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  headerRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  logo: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  letterheadCompany: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  letterheadLine: {
    fontSize: 8,
    color: "#555",
    marginBottom: 1,
  },
  woTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  woNumber: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#dc2626",
    marginBottom: 3,
  },
  woMeta: {
    fontSize: 8,
    color: "#444",
    marginBottom: 1,
  },

  // ── Section blocks ───────────────────────────────────────────────────────────
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingBottom: 3,
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  infoLabel: {
    width: 80,
    fontSize: 8,
    color: "#666",
    fontFamily: "Helvetica-Bold",
  },
  infoValue: {
    fontSize: 8,
    flex: 1,
  },

  // ── Job section ─────────────────────────────────────────────────────────────
  jobSection: {
    marginBottom: 14,
  },
  jobTitleBar: {
    backgroundColor: "#fbbf24",
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  jobTitleText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#000",
  },
  jobTitleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  estimateTag: {
    backgroundColor: "rgba(0,0,0,0.12)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#000",
  },
  techName: {
    fontSize: 8,
    color: "#111",
  },

  // ── Line table ───────────────────────────────────────────────────────────────
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    paddingVertical: 2,
  },
  colItem: { width: 60, fontSize: 8 },
  colDesc: { flex: 1, fontSize: 8, paddingRight: 4 },
  colUnitPrice: { width: 55, fontSize: 8, textAlign: "right" },
  colQty: { width: 30, fontSize: 8, textAlign: "right", paddingRight: 4 },
  colTotal: { width: 60, fontSize: 8, textAlign: "right" },
  colHeaderText: { fontSize: 7, color: "#666", fontFamily: "Helvetica-Bold" },

  // ── Subtotal row ─────────────────────────────────────────────────────────────
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 3,
  },
  subtotalLabel: {
    width: 85,
    fontSize: 8,
    color: "#666",
    textAlign: "right",
    paddingRight: 4,
  },
  subtotalValue: {
    width: 60,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },

  // ── Customer Charges box ─────────────────────────────────────────────────────
  chargesBox: {
    alignItems: "flex-end",
    marginBottom: 16,
  },
  chargesInner: {
    width: 220,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chargesHeader: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  chargesHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#555",
  },
  chargesBody: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chargeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  chargeLabel: { fontSize: 8, flex: 1 },
  chargeValue: { fontSize: 8, textAlign: "right" },
  chargeRowBold: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    paddingTop: 3,
    marginTop: 2,
    marginBottom: 2,
  },
  chargeLabelBold: { fontSize: 8, flex: 1, fontFamily: "Helvetica-Bold" },
  chargeValueBold: { fontSize: 8, textAlign: "right", fontFamily: "Helvetica-Bold" },

  // ── Payments table ───────────────────────────────────────────────────────────
  paymentsSection: {
    marginBottom: 12,
  },
  colPmtDate: { width: 60, fontSize: 8 },
  colPmtMethod: { width: 80, fontSize: 8 },
  colPmtNote: { flex: 1, fontSize: 8, paddingRight: 4 },
  colPmtAmt: { width: 60, fontSize: 8, textAlign: "right" },

  // ── Notes ─────────────────────────────────────────────────────────────────────
  notesSection: {
    marginBottom: 12,
  },
  notesText: {
    fontSize: 8,
    lineHeight: 1.5,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const KIND_LABELS: Record<string, string> = {
  part: "Part",
  shop_supplies: "Shop Supplies",
  shipping: "Shipping",
  flat_service: "Service",
  other: "Other",
};

// ── Document component ────────────────────────────────────────────────────────

export interface WorkOrderPdfProps {
  wo: WorkOrderFull;
  totals: WOTotals;
  /** Browser: "/jby-logo.png" (absolute URL path). Node: absolute file path. */
  logoSrc: string;
}

export function WorkOrderPdf({ wo, totals, logoSrc }: WorkOrderPdfProps) {
  const letterhead = letterheadFor(wo.locations?.name);
  const jobs = wo.work_order_jobs ?? [];

  return (
    <Document>
      <Page size="LETTER" style={S.page}>

        {/* 1. Header row */}
        <View style={S.headerRow} fixed>
          {/* Left: letterhead */}
          <View style={S.headerLeft}>
            <Text style={S.letterheadCompany}>{letterhead.company}</Text>
            {letterhead.lines.map((line, i) => (
              <Text key={i} style={S.letterheadLine}>{line}</Text>
            ))}
          </View>

          {/* Center: round logo */}
          <View style={S.headerCenter}>
            <Image src={logoSrc} style={S.logo} />
          </View>

          {/* Right: WO block */}
          <View style={S.headerRight}>
            <Text style={S.woTitle}>Work Order</Text>
            <Text style={S.woNumber}>WO-{wo.wo_number}</Text>
            <Text style={S.woMeta}>Location: {wo.locations?.name ?? "—"}</Text>
            <Text style={S.woMeta}>Date: {formatDate(wo.wo_date)}</Text>
            <Text style={S.woMeta}>Service Advisor: {wo.profiles?.full_name ?? "—"}</Text>
          </View>
        </View>

        {/* 2. Customer Information */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Customer Information</Text>
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>Name</Text>
            <Text style={S.infoValue}>{wo.customers?.name ?? "—"}</Text>
          </View>
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>Phone</Text>
            <Text style={S.infoValue}>{wo.customers?.phone ?? "—"}</Text>
          </View>
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>Email</Text>
            <Text style={S.infoValue}>{wo.customers?.email ?? "—"}</Text>
          </View>
        </View>

        {/* 3. Boat Information */}
        {wo.boats && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Boat Information</Text>
            <View style={S.infoRow}>
              <Text style={S.infoLabel}>Boat</Text>
              <Text style={S.infoValue}>{wo.boats.name}</Text>
            </View>
            <View style={S.infoRow}>
              <Text style={S.infoLabel}>Make/Model</Text>
              <Text style={S.infoValue}>
                {[wo.boats.make_model, wo.boats.year?.toString()].filter(Boolean).join(" · ") || "—"}
              </Text>
            </View>
            <View style={S.infoRow}>
              <Text style={S.infoLabel}>HIN</Text>
              <Text style={S.infoValue}>{wo.boats.hin ?? "—"}</Text>
            </View>
          </View>
        )}

        {/* 4. Job sections */}
        {jobs.map((job, i) => {
          const jobTotalsInput = toTotalsInput({
            ...wo,
            work_order_jobs: [job],
            work_order_payments: [],
          });
          const laborAmt = laborForJob(jobTotalsInput.jobs[0]);
          const lines = job.work_order_lines ?? [];

          let laborDesc = "Hourly Rate";
          if (job.job_type === "flat") laborDesc = "Flat Rate";
          else if (job.job_type === "per_foot") laborDesc = "Per Foot";

          const priceLevel = job.price_levels;
          const { unit: laborUnit, qty: laborQty } = laborDisplay({
            job_type: job.job_type,
            hours: job.hours == null ? null : Number(job.hours),
            flat_price: job.flat_price == null ? null : Number(job.flat_price),
            boat_length_ft: job.boat_length_ft == null ? null : Number(job.boat_length_ft),
            rate: Number(priceLevel?.rate ?? 0),
          });

          const showLaborRow = laborAmt > 0 || (job.job_type === "frh" && job.hours != null);
          const jobSubtotal = totals.jobSubtotals[i] ?? 0;

          return (
            <View key={job.id} style={S.jobSection} wrap={false}>
              {/* Title bar */}
              <View style={S.jobTitleBar}>
                <Text style={S.jobTitleText}>
                  {i + 1}{"  "}{job.title}
                </Text>
                <View style={S.jobTitleRight}>
                  {job.profiles?.full_name && (
                    <Text style={S.techName}>{job.profiles.full_name}</Text>
                  )}
                  {job.customer_status === "estimate" && (
                    <Text style={S.estimateTag}>ESTIMATE</Text>
                  )}
                </View>
              </View>

              {/* Table header */}
              <View style={S.tableHeader}>
                <Text style={[S.colItem, S.colHeaderText]}>Item</Text>
                <Text style={[S.colDesc, S.colHeaderText]}>Description</Text>
                <Text style={[S.colUnitPrice, S.colHeaderText]}>Unit Price</Text>
                <Text style={[S.colQty, S.colHeaderText]}>Qty</Text>
                <Text style={[S.colTotal, S.colHeaderText]}>Total</Text>
              </View>

              {/* Labor row */}
              {showLaborRow && (
                <View style={S.tableRow}>
                  <Text style={S.colItem}>Labor</Text>
                  <Text style={S.colDesc}>{laborDesc}</Text>
                  <Text style={S.colUnitPrice}>{fmtUSD(Number(laborUnit))}</Text>
                  <Text style={S.colQty}>{laborQty}</Text>
                  <Text style={S.colTotal}>{fmtUSD(laborAmt)}</Text>
                </View>
              )}

              {/* Part/line rows — CUSTOMER prices only */}
              {lines.map((line) => {
                const totalPrice = linePrice(
                  {
                    kind: line.kind,
                    qty: Number(line.qty),
                    unit_cost: Number(line.unit_cost),
                    margin_pct: line.margin_pct == null ? null : Number(line.margin_pct),
                    taxable: line.taxable,
                  },
                  Number(wo.default_margin_pct)
                );
                const qty = Number(line.qty) || 1;
                const unitPrice = totalPrice / qty;

                return (
                  <View key={line.id} style={S.tableRow}>
                    <Text style={S.colItem}>{line.item_code ?? KIND_LABELS[line.kind] ?? line.kind}</Text>
                    <Text style={S.colDesc}>{line.description ?? "—"}</Text>
                    <Text style={S.colUnitPrice}>{fmtUSD(unitPrice)}</Text>
                    <Text style={S.colQty}>{qty}</Text>
                    <Text style={S.colTotal}>{fmtUSD(totalPrice)}</Text>
                  </View>
                );
              })}

              {/* Subtotal */}
              <View style={S.subtotalRow}>
                <Text style={S.subtotalLabel}>Subtotal</Text>
                <Text style={S.subtotalValue}>{fmtUSD(jobSubtotal)}</Text>
              </View>
            </View>
          );
        })}

        {/* 5. Customer Charges box */}
        <View style={S.chargesBox} wrap={false}>
          <View style={S.chargesInner}>
            <View style={S.chargesHeader}>
              <Text style={S.chargesHeaderText}>Customer Charges</Text>
            </View>
            <View style={S.chargesBody}>
              {totals.totalLabor > 0 && (
                <View style={S.chargeRow}>
                  <Text style={S.chargeLabel}>Total Labor</Text>
                  <Text style={S.chargeValue}>{fmtUSD(totals.totalLabor)}</Text>
                </View>
              )}
              {totals.totalParts > 0 && (
                <View style={S.chargeRow}>
                  <Text style={S.chargeLabel}>Total Parts</Text>
                  <Text style={S.chargeValue}>{fmtUSD(totals.totalParts)}</Text>
                </View>
              )}
              {totals.shopSupplies > 0 && (
                <View style={S.chargeRow}>
                  <Text style={S.chargeLabel}>Shop Supplies</Text>
                  <Text style={S.chargeValue}>{fmtUSD(totals.shopSupplies)}</Text>
                </View>
              )}
              {totals.shipping > 0 && (
                <View style={S.chargeRow}>
                  <Text style={S.chargeLabel}>Shipping &amp; Handling</Text>
                  <Text style={S.chargeValue}>{fmtUSD(totals.shipping)}</Text>
                </View>
              )}
              {totals.other > 0 && (
                <View style={S.chargeRow}>
                  <Text style={S.chargeLabel}>Other</Text>
                  <Text style={S.chargeValue}>{fmtUSD(totals.other)}</Text>
                </View>
              )}
              {totals.taxLines.map((tax, i) => (
                <View key={i} style={S.chargeRow}>
                  <Text style={S.chargeLabel}>{tax.name} ({tax.rate_pct}%)</Text>
                  <Text style={S.chargeValue}>{fmtUSD(tax.amount)}</Text>
                </View>
              ))}
              {totals.ccFee > 0 && wo.cc_fee_pct != null && (
                <View style={S.chargeRow}>
                  <Text style={S.chargeLabel}>Credit Card Fee ({wo.cc_fee_pct}%)</Text>
                  <Text style={S.chargeValue}>{fmtUSD(totals.ccFee)}</Text>
                </View>
              )}
              <View style={S.chargeRowBold}>
                <Text style={S.chargeLabelBold}>Amount Due</Text>
                <Text style={S.chargeValueBold}>{fmtUSD(totals.amountDue)}</Text>
              </View>
              {totals.amountPaid > 0 && (
                <View style={S.chargeRow}>
                  <Text style={S.chargeLabel}>Amount Paid</Text>
                  <Text style={S.chargeValue}>{fmtUSD(totals.amountPaid)}</Text>
                </View>
              )}
              <View style={S.chargeRowBold}>
                <Text style={S.chargeLabelBold}>Balance Due</Text>
                <Text style={S.chargeValueBold}>{fmtUSD(totals.balanceDue)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 6. Payments table */}
        {(wo.work_order_payments?.length ?? 0) > 0 && (
          <View style={S.paymentsSection} wrap={false}>
            <Text style={S.sectionTitle}>Payments</Text>
            <View style={S.tableHeader}>
              <Text style={[S.colPmtDate, S.colHeaderText]}>Date</Text>
              <Text style={[S.colPmtMethod, S.colHeaderText]}>Method</Text>
              <Text style={[S.colPmtNote, S.colHeaderText]}>Note</Text>
              <Text style={[S.colPmtAmt, S.colHeaderText]}>Amount</Text>
            </View>
            {wo.work_order_payments!.map((pmt) => (
              <View key={pmt.id} style={S.tableRow}>
                <Text style={S.colPmtDate}>{formatDate(pmt.paid_on)}</Text>
                <Text style={S.colPmtMethod}>{pmt.method ?? "—"}</Text>
                <Text style={S.colPmtNote}>{pmt.note ?? "—"}</Text>
                <Text style={S.colPmtAmt}>{fmtUSD(Number(pmt.amount))}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 7. Printed Notes */}
        {wo.printed_notes && (
          <View style={S.notesSection}>
            <Text style={S.sectionTitle}>Notes</Text>
            <Text style={S.notesText}>{wo.printed_notes}</Text>
          </View>
        )}

      </Page>
    </Document>
  );
}

/** Returns the suggested filename for the PDF download. */
export function woFileName(wo: Pick<WorkOrderFull, "wo_number">): string {
  return `WO-${wo.wo_number} — Jeff Brown Yachts.pdf`;
}
