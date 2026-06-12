import { requireAdmin } from "@/lib/admin";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cn, formatDate, statusColor } from "@/lib/utils";
import { computeTotals, fmtUSD } from "@/lib/work-orders/totals";
import { toTotalsInput } from "@/lib/work-orders/queries";
import type { WorkOrderFull } from "@/lib/work-orders/types";
import { NewWOButton } from "./new-wo-button";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, profile } = await requireAdmin();

  const [
    { data: customer, error: customerError },
    { data: boats },
    { data: workOrders },
    { data: recentJobs },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, address")
      .eq("id", id)
      .single(),
    supabase
      .from("boats")
      .select("id, name, make_model, year")
      .eq("customer_id", id)
      .order("name"),
    supabase
      .from("work_orders")
      .select(
        "id, wo_number, status, wo_date, default_margin_pct, taxes, cc_fee_pct, " +
        "work_order_jobs(job_type, hours, flat_price, boat_length_ft, labor_taxable, price_levels:price_level_id(rate, unit), work_order_lines(kind, qty, unit_cost, margin_pct, taxable)), " +
        "work_order_payments(amount)"
      )
      .eq("customer_id", id)
      .order("wo_number", { ascending: false }),
    supabase
      .from("jobs")
      .select(
        "id, status, scheduled_date, service_types, boats:boat_id(name), profiles:assigned_to(full_name)"
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (customerError || !customer) {
    notFound();
  }

  const canEdit = profile.role === "admin" || profile.role === "manager";

  return (
    <div className="space-y-6">
      <RealtimeRefresh tables={["customers", "work_orders", "jobs"]} />

      {/* Back link */}
      <div>
        <Link
          href="/dashboard/customers"
          className="text-sm text-text-secondary hover:text-gold transition-colors"
        >
          ← Clients
        </Link>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border-line bg-card-bg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{customer.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="text-text-secondary hover:text-gold transition-colors"
                >
                  {customer.phone}
                </a>
              )}
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="text-text-secondary hover:text-gold transition-colors"
                >
                  {customer.email}
                </a>
              )}
              {customer.address && (
                <span className="text-text-secondary">{customer.address}</span>
              )}
            </div>
          </div>
          {/* Boat chips */}
          {(boats ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(boats ?? []).map((boat) => (
                <span
                  key={boat.id}
                  className="rounded-full border border-border-line px-3 py-1 text-xs text-text-secondary"
                >
                  {boat.name}
                  {boat.make_model ? ` · ${boat.make_model}` : ""}
                  {boat.year ? ` (${boat.year})` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Work Orders card */}
      <div className="rounded-xl border border-border-line bg-card-bg">
        <div className="flex items-center justify-between border-b border-border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">Work Orders</h2>
          {canEdit && (
            <NewWOButton customerId={customer.id} profileId={profile.id} />
          )}
        </div>

        {(workOrders ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-line bg-secondary-bg">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    WO #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Amount Due
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-line">
                {((workOrders ?? []) as unknown as WorkOrderFull[]).map((wo) => {
                  const totals = computeTotals(toTotalsInput(wo));
                  const balanceRed =
                    totals.balanceDue > 0 &&
                    (wo.status === "completed" || wo.status === "invoiced");
                  return (
                    <tr key={wo.id} className="transition-colors hover:bg-white/5">
                      <td className="whitespace-nowrap px-6 py-4">
                        <Link
                          href={`/dashboard/work-orders/${wo.id}`}
                          className="text-sm font-medium text-gold hover:underline"
                        >
                          WO-{wo.wo_number}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                        {formatDate(wo.wo_date)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            statusColor(wo.status)
                          )}
                        >
                          {wo.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-text-primary">
                        {fmtUSD(totals.amountDue)}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-6 py-4 text-right text-sm",
                          balanceRed ? "text-red-400" : "text-text-secondary"
                        )}
                      >
                        {fmtUSD(totals.balanceDue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-8 text-center text-sm text-text-secondary">
            No work orders for this client yet.
          </p>
        )}
      </div>

      {/* Recent Jobs card */}
      <div className="rounded-xl border border-border-line bg-card-bg">
        <div className="border-b border-border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">Recent Jobs</h2>
        </div>

        {(recentJobs ?? []).length > 0 ? (
          <div className="divide-y divide-border-line">
            {(recentJobs ?? []).map((job) => {
              const jobWithProfiles = job as typeof job & {
                profiles: { full_name: string } | null;
                boats: { name: string } | null;
              };
              return (
                <div key={job.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {jobWithProfiles.boats?.name ?? "Unknown boat"}
                    </p>
                    {job.service_types && job.service_types.length > 0 && (
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {job.service_types.join(", ")}
                      </p>
                    )}
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-text-secondary">
                      {job.scheduled_date && <span>{formatDate(job.scheduled_date)}</span>}
                      {jobWithProfiles.profiles?.full_name && (
                        <span>{jobWithProfiles.profiles.full_name}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      statusColor(job.status)
                    )}
                  >
                    {job.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-6 py-8 text-center text-sm text-text-secondary">
            No jobs for this client yet.
          </p>
        )}
      </div>
    </div>
  );
}
