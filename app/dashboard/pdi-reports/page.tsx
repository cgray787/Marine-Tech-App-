import { requireAdmin } from "@/lib/admin";
import { formatDate, statusColor } from "@/lib/utils";
import Link from "next/link";
import { PdiStatusActions } from "./pdi-actions";

export default async function PdiReportsPage() {
  const { supabase } = await requireAdmin();

  const { data: pdiReports } = await supabase
    .from("pdi_reports")
    .select(
      "*, profiles:tech_id(full_name)"
    )
    .order("submitted_at", { ascending: false });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">PDI Reports</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Pre-Delivery Inspection reports
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-line bg-card-bg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-line bg-secondary-bg">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Technician
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Boat
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Flagged
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-line">
              {pdiReports && pdiReports.length > 0 ? (
                pdiReports.map((pdi) => {
                  const tech = (pdi.profiles as unknown) as {
                    full_name: string;
                  } | null;
                  const progress =
                    pdi.total_items > 0
                      ? Math.round(
                          (pdi.completed_items / pdi.total_items) * 100
                        )
                      : 0;
                  return (
                    <tr
                      key={pdi.id}
                      className="transition-colors hover:bg-white/5"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                        {formatDate(pdi.submitted_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-primary">
                        {tech?.full_name || "Unknown"}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {pdi.boat_name || "N/A"}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {pdi.make_model || ""}
                          </p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-primary">
                        {pdi.owner_name || "N/A"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-border-line">
                            <div
                              className="h-full rounded-full bg-gold"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-text-secondary">
                            {pdi.completed_items}/{pdi.total_items}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {pdi.flagged_items > 0 ? (
                          <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400">
                            {pdi.flagged_items} flagged
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-400">
                            All clear
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(pdi.status)}`}
                        >
                          {pdi.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/pdi-reports/${pdi.id}`}
                            className="rounded-lg border border-border-line px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-gold/30 hover:text-gold"
                          >
                            View
                          </Link>
                          <PdiStatusActions
                            pdiId={pdi.id}
                            currentStatus={pdi.status}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sm text-text-secondary"
                  >
                    No PDI reports found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
