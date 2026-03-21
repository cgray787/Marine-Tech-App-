import { requireAdmin } from "@/lib/admin";
import { formatDate, statusColor } from "@/lib/utils";
import Link from "next/link";
import { ReportStatusActions } from "./report-actions";

export default async function ReportsPage() {
  const { supabase } = await requireAdmin();

  const { data: reports } = await supabase
    .from("service_reports")
    .select(
      "id, boat_name, owner_name, make_model, status, submitted_at, service_types, tech_id, profiles:tech_id(full_name)"
    )
    .order("submitted_at", { ascending: false });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          Service Reports
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Review and manage technician service reports
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
                  Service Type
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
              {reports && reports.length > 0 ? (
                reports.map((report) => {
                  const tech = (report.profiles as unknown) as {
                    full_name: string;
                  } | null;
                  return (
                    <tr
                      key={report.id}
                      className="transition-colors hover:bg-white/5"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                        {formatDate(report.submitted_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-primary">
                        {tech?.full_name || "Unknown"}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {report.boat_name || "N/A"}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {report.make_model || ""}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {report.service_types?.map((type: string) => (
                            <span
                              key={type}
                              className="rounded bg-gold-muted px-2 py-0.5 text-xs text-gold"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(report.status)}`}
                        >
                          {report.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/reports/${report.id}`}
                            className="rounded-lg border border-border-line px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-gold/30 hover:text-gold"
                          >
                            View
                          </Link>
                          <ReportStatusActions
                            reportId={report.id}
                            currentStatus={report.status}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-sm text-text-secondary"
                  >
                    No service reports found
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
