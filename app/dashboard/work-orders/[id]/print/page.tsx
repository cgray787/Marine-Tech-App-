import { requireAdmin } from "@/lib/admin";
import { fetchWorkOrderFull } from "@/lib/work-orders/queries";
import { computeTotals, laborForJob, linePrice, fmtUSD } from "@/lib/work-orders/totals";
import { toTotalsInput } from "@/lib/work-orders/queries";
import { letterheadFor } from "@/lib/work-orders/letterhead";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function WorkOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  let wo;
  try {
    wo = await fetchWorkOrderFull(supabase, id);
  } catch {
    notFound();
  }

  const totals = computeTotals(toTotalsInput(wo));
  const letterhead = letterheadFor(wo.locations?.name);

  const jobs = wo.work_order_jobs ?? [];

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Ensure sidebar/nav is hidden on screen and print for this page */}
      <style>{`
        @media print {
          aside, nav, header, .no-print { display: none !important; }
          body { background: white !important; }
          .print-layout { display: block !important; height: auto !important; overflow: visible !important; }
          .print-main { padding: 0 !important; overflow: visible !important; }
        }
        /* On screen: keep the white container readable against the dark dashboard */
        .print-page-wrapper { background: white; color: black; }
      `}</style>

      <div className="print-page-wrapper mx-auto max-w-[800px] p-8 print:p-0">

        {/* 1. Header row */}
        <div className="flex justify-between items-start mb-6">
          {/* Left: Letterhead */}
          <div>
            <p className="text-lg font-bold">{letterhead.company}</p>
            {letterhead.lines.map((line, i) => (
              <p key={i} className="text-sm text-gray-600">{line}</p>
            ))}
          </div>

          {/* Right: WO heading */}
          <div className="text-right">
            <h1 className="text-3xl font-bold">Work Order</h1>
            <p className="text-xl font-semibold text-red-600">WO-{wo.wo_number}</p>
            <p className="text-sm mt-1">Location: {wo.locations?.name ?? "—"}</p>
            <p className="text-sm">Date: {formatDate(wo.wo_date)}</p>
            <p className="text-sm">Service Advisor: {wo.profiles?.full_name ?? "—"}</p>
          </div>
        </div>

        {/* 2. Customer Information */}
        <section className="mb-5">
          <h2 className="font-semibold border-b border-black/20 mb-2 pb-1">Customer Information</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="pr-4 py-0.5 font-medium text-gray-600 w-32">Name</td>
                <td>{wo.customers?.name ?? "—"}</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 font-medium text-gray-600">Phone</td>
                <td>{wo.customers?.phone ?? "—"}</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 font-medium text-gray-600">Email</td>
                <td>{wo.customers?.email ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 3. Boat Information (skip when no boat) */}
        {wo.boats && (
          <section className="mb-5">
            <h2 className="font-semibold border-b border-black/20 mb-2 pb-1">Boat Information</h2>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="pr-4 py-0.5 font-medium text-gray-600 w-32">Boat</td>
                  <td>{wo.boats.name}</td>
                </tr>
                <tr>
                  <td className="pr-4 py-0.5 font-medium text-gray-600">Make/Model</td>
                  <td>
                    {[wo.boats.make_model, wo.boats.year?.toString()]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
                <tr>
                  <td className="pr-4 py-0.5 font-medium text-gray-600">HIN</td>
                  <td>{wo.boats.hin ?? "—"}</td>
                </tr>
              </tbody>
            </table>
          </section>
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

          // Determine labor description
          const priceLevel = job.price_levels;
          let laborDesc = "Hourly Rate";
          let laborUnit: string | number = Number(priceLevel?.rate ?? 0);
          let laborQty: string | number = job.hours ?? 1;

          if (job.job_type === "flat") {
            laborDesc = "Flat Rate";
            laborUnit = Number(job.flat_price ?? 0);
            laborQty = 1;
          } else if (job.job_type === "per_foot") {
            laborDesc = "Per Foot";
            laborUnit = Number(priceLevel?.rate ?? 0);
            laborQty = job.boat_length_ft ?? 0;
          }

          const showLaborRow = laborAmt > 0 || job.job_type === "frh";
          const jobSubtotal = totals.jobSubtotals[i] ?? 0;

          return (
            <section key={job.id} className="mb-6">
              {/* Title bar */}
              <div className="bg-amber-400 text-black px-3 py-1.5 font-semibold flex justify-between items-center">
                <span>
                  {i + 1}&nbsp;&nbsp;{job.title}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  {job.profiles?.full_name && (
                    <span>{job.profiles.full_name}</span>
                  )}
                  {job.customer_status === "estimate" && (
                    <span className="bg-black/10 px-2 py-0.5 rounded text-xs font-bold tracking-wide">
                      ESTIMATE
                    </span>
                  )}
                </span>
              </div>

              {/* Line items table */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-black/10 text-left text-gray-600">
                    <th className="py-1 pr-3 font-medium">Item</th>
                    <th className="py-1 pr-3 font-medium">Description</th>
                    <th className="py-1 pr-3 font-medium text-right">Unit Price</th>
                    <th className="py-1 pr-3 font-medium text-right">Qty</th>
                    <th className="py-1 font-medium text-right">Total Price</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Labor row */}
                  {showLaborRow && (
                    <tr className="border-b border-black/5">
                      <td className="py-1 pr-3">Labor</td>
                      <td className="py-1 pr-3">{laborDesc}</td>
                      <td className="py-1 pr-3 text-right">{fmtUSD(Number(laborUnit))}</td>
                      <td className="py-1 pr-3 text-right">{laborQty}</td>
                      <td className="py-1 text-right">{fmtUSD(laborAmt)}</td>
                    </tr>
                  )}

                  {/* Part/line rows at CUSTOMER prices — no cost, no margin */}
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

                    const kindLabels: Record<string, string> = {
                      part: "Part",
                      shop_supplies: "Shop Supplies",
                      shipping: "Shipping",
                      flat_service: "Service",
                      other: "Other",
                    };

                    return (
                      <tr key={line.id} className="border-b border-black/5">
                        <td className="py-1 pr-3">{line.item_code ?? kindLabels[line.kind] ?? line.kind}</td>
                        <td className="py-1 pr-3">{line.description ?? "—"}</td>
                        <td className="py-1 pr-3 text-right">{fmtUSD(unitPrice)}</td>
                        <td className="py-1 pr-3 text-right">{qty}</td>
                        <td className="py-1 text-right">{fmtUSD(totalPrice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Per-section subtotal */}
                <tfoot>
                  <tr>
                    <td colSpan={4} className="py-1 pr-3 text-right font-medium text-sm text-gray-600">
                      Subtotal
                    </td>
                    <td className="py-1 text-right font-semibold">{fmtUSD(jobSubtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
          );
        })}

        {/* 5. Customer Charges box */}
        <div className="flex justify-end mb-6">
          <div className="w-72 border border-black/20 text-sm">
            {/* Header */}
            <div className="bg-gray-100 px-3 py-1.5 font-semibold text-gray-700 border-b border-black/20">
              Customer Charges
            </div>

            <div className="px-3 py-1">
              {totals.totalLabor > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>Total Labor</span>
                  <span>{fmtUSD(totals.totalLabor)}</span>
                </div>
              )}
              {totals.totalParts > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>Total Parts</span>
                  <span>{fmtUSD(totals.totalParts)}</span>
                </div>
              )}
              {totals.shopSupplies > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>Shop Supplies</span>
                  <span>{fmtUSD(totals.shopSupplies)}</span>
                </div>
              )}
              {totals.shipping > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>Shipping &amp; Handling</span>
                  <span>{fmtUSD(totals.shipping)}</span>
                </div>
              )}
              {totals.other > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>Other</span>
                  <span>{fmtUSD(totals.other)}</span>
                </div>
              )}

              {totals.taxLines.map((tax, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span>{tax.name} ({tax.rate_pct}%)</span>
                  <span>{fmtUSD(tax.amount)}</span>
                </div>
              ))}

              {totals.ccFee > 0 && wo.cc_fee_pct != null && (
                <div className="flex justify-between py-0.5">
                  <span>Credit Card Fee ({wo.cc_fee_pct}%)</span>
                  <span>{fmtUSD(totals.ccFee)}</span>
                </div>
              )}

              <div className="flex justify-between py-1 mt-1 border-t border-black/20 font-bold">
                <span>Amount Due</span>
                <span>{fmtUSD(totals.amountDue)}</span>
              </div>

              {totals.amountPaid > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>Amount Paid</span>
                  <span>{fmtUSD(totals.amountPaid)}</span>
                </div>
              )}

              <div className="flex justify-between py-1 border-t border-black/20 font-bold">
                <span>Balance Due</span>
                <span>{fmtUSD(totals.balanceDue)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Payments table */}
        {(wo.work_order_payments?.length ?? 0) > 0 && (
          <section className="mb-5">
            <h2 className="font-semibold border-b border-black/20 mb-2 pb-1">Payments</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-gray-600">
                  <th className="py-1 pr-4 font-medium">Date</th>
                  <th className="py-1 pr-4 font-medium">Method</th>
                  <th className="py-1 pr-4 font-medium">Note</th>
                  <th className="py-1 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {wo.work_order_payments!.map((pmt) => (
                  <tr key={pmt.id} className="border-b border-black/5">
                    <td className="py-1 pr-4">{formatDate(pmt.paid_on)}</td>
                    <td className="py-1 pr-4">{pmt.method ?? "—"}</td>
                    <td className="py-1 pr-4">{pmt.note ?? "—"}</td>
                    <td className="py-1 text-right">{fmtUSD(Number(pmt.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 7. Printed Notes */}
        {wo.printed_notes && (
          <section className="mb-5">
            <h2 className="font-semibold border-b border-black/20 mb-2 pb-1">Notes</h2>
            <p className="text-sm whitespace-pre-wrap">{wo.printed_notes}</p>
          </section>
        )}

        {/* 8. Print/Back actions (hidden on print) */}
        <div className="print:hidden flex items-center gap-4 mt-8 pt-4 border-t border-black/10">
          <PrintButton />
          <Link
            href={`/dashboard/work-orders/${wo.id}`}
            className="text-sm text-gray-600 hover:text-black transition-colors"
          >
            ← Back to work order
          </Link>
        </div>
      </div>
    </div>
  );
}
