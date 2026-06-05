import { requireAdmin } from "@/lib/admin";
import { formatDateTime, statusColor } from "@/lib/utils";
import Link from "next/link";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { PartsToOrder } from "@/components/dashboard/parts-to-order";
import type { PartRow } from "@/lib/dashboard/parts";

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();

  // Fetch stats in parallel
  const [
    { count: totalJobs },
    { count: pendingReviews },
    { count: activeTechs },
    { count: openPdis },
    { data: recentReports },
    { data: recentJobs },
    { data: partsRaw },
  ] = await Promise.all([
    supabase.from("jobs").select("*", { count: "exact", head: true }),
    supabase
      .from("service_reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "tech")
      .eq("status", "active"),
    supabase
      .from("pdi_reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["submitted", "reviewed"]),
    supabase
      .from("service_reports")
      .select("id, boat_name, owner_name, status, submitted_at, service_types, tech_id, profiles:tech_id(full_name)")
      .order("submitted_at", { ascending: false })
      .limit(5),
    supabase
      .from("jobs")
      .select("id, status, scheduled_date, service_types, boats:boat_id(name), profiles:assigned_to(full_name), customers:customer_id(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("parts")
      .select("id, name, customer_id, boat_id, part_number, quantity, description, supplier, url, photo_url, status, ordered_at, customers:customer_id(name), boats:boat_id(name)")
      .order("created_at", { ascending: false }),
  ]);

  const partsList: PartRow[] = (partsRaw ?? []).map((p) => ({
    id: p.id, name: p.name, customer_id: p.customer_id, boat_id: p.boat_id,
    customer_name: ((p.customers as unknown) as { name: string } | null)?.name ?? null,
    boat_name: ((p.boats as unknown) as { name: string } | null)?.name ?? null,
    part_number: p.part_number, quantity: p.quantity, description: p.description,
    supplier: p.supplier, url: p.url, photo_url: p.photo_url, status: p.status, ordered_at: p.ordered_at,
  }));
  const partsToOrderCount = partsList.filter((p) => p.status === "need_to_order").length;

  const stats = [
    {
      label: "Total Jobs",
      value: totalJobs ?? 0,
      color: "text-status-new",
      bg: "bg-blue-500/10",
    },
    {
      label: "Pending Reviews",
      value: pendingReviews ?? 0,
      color: "text-status-progress",
      bg: "bg-amber-500/10",
    },
    {
      label: "Active Techs",
      value: activeTechs ?? 0,
      color: "text-status-good",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Open PDIs",
      value: openPdis ?? 0,
      color: "text-gold",
      bg: "bg-gold-muted",
    },
    {
      label: "Parts to Order",
      value: partsToOrderCount,
      color: "text-gold",
      bg: "bg-gold-muted",
    },
  ];

  return (
    <div>
      <RealtimeRefresh tables={["jobs", "service_reports", "pdi_reports", "parts"]} />
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Overview of your marine service operations
        </p>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border-line bg-card-bg p-6"
          >
            <p className="text-sm font-medium text-text-secondary">
              {stat.label}
            </p>
            <p className={`mt-2 text-3xl font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Reports */}
        <div className="rounded-xl border border-border-line bg-card-bg">
          <div className="flex items-center justify-between border-b border-border-line px-6 py-4">
            <h2 className="font-semibold text-text-primary">Recent Reports</h2>
            <Link
              href="/dashboard/reports"
              className="text-sm text-gold hover:text-gold-hover"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-border-line">
            {recentReports && recentReports.length > 0 ? (
              recentReports.map((report) => {
                const tech = (report.profiles as unknown) as { full_name: string } | null;
                return (
                  <Link
                    key={report.id}
                    href={`/dashboard/reports/${report.id}`}
                    className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-white/5"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {report.boat_name || "Unknown Vessel"}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {tech?.full_name || "Unknown Tech"} &middot;{" "}
                        {formatDateTime(report.submitted_at)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(report.status)}`}
                    >
                      {report.status}
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="px-6 py-8 text-center text-sm text-text-secondary">
                No reports submitted yet
              </p>
            )}
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="rounded-xl border border-border-line bg-card-bg">
          <div className="flex items-center justify-between border-b border-border-line px-6 py-4">
            <h2 className="font-semibold text-text-primary">Recent Jobs</h2>
            <Link
              href="/dashboard/jobs"
              className="text-sm text-gold hover:text-gold-hover"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-border-line">
            {recentJobs && recentJobs.length > 0 ? (
              recentJobs.map((job) => {
                const tech = (job.profiles as unknown) as { full_name: string } | null;
                const boat = (job.boats as unknown) as { name: string } | null;
                const customer = (job.customers as unknown) as { name: string } | null;
                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between px-6 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {boat?.name || "Unassigned Boat"}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {customer?.name || "No Customer"} &middot;{" "}
                        {tech?.full_name || "Unassigned"} &middot;{" "}
                        {job.scheduled_date || "No date"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(job.status)}`}
                    >
                      {job.status}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="px-6 py-8 text-center text-sm text-text-secondary">
                No jobs created yet
              </p>
            )}
          </div>
        </div>
      </div>

      <PartsToOrder parts={partsList} />
    </div>
  );
}
