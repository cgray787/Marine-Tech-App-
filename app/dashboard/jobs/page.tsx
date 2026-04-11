import { requireAdmin } from "@/lib/admin";
import { formatDate, statusColor } from "@/lib/utils";
import { CreateJobForm } from "./create-job-form";
import { JobStatusActions } from "./job-actions";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export default async function JobsPage() {
  const { supabase } = await requireAdmin();

  const [
    { data: jobs },
    { data: customers },
    { data: boats },
    { data: techs },
    { data: marinas },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "*, boats:boat_id(name, make_model), profiles:assigned_to(full_name), customers:customer_id(name)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("boats").select("id, name, customer_id, make_model").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "tech")
      .eq("status", "active")
      .order("full_name"),
    supabase.from("marinas").select("id, name").order("name"),
  ]);

  return (
    <div>
      <RealtimeRefresh tables={["jobs"]} />
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Jobs</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Create and manage service jobs
          </p>
        </div>
      </div>

      {/* Create Job Form */}
      <CreateJobForm
        customers={customers || []}
        boats={boats || []}
        techs={techs || []}
        marinas={marinas || []}
      />

      {/* Jobs List */}
      <div className="overflow-hidden rounded-xl border border-border-line bg-card-bg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-line bg-secondary-bg">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Boat
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Technician
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Services
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
              {jobs && jobs.length > 0 ? (
                jobs.map((job) => {
                  const tech = (job.profiles as unknown) as {
                    full_name: string;
                  } | null;
                  const boat = (job.boats as unknown) as {
                    name: string;
                    make_model: string;
                  } | null;
                  const customer = (job.customers as unknown) as {
                    name: string;
                  } | null;
                  return (
                    <tr
                      key={job.id}
                      className="transition-colors hover:bg-white/5"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                        {formatDate(job.scheduled_date)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-primary">
                        {customer?.name || "N/A"}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {boat?.name || "N/A"}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {boat?.make_model || ""}
                          </p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-primary">
                        {tech?.full_name || "Unassigned"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {job.service_types?.map((type: string) => (
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
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(job.status)}`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <JobStatusActions
                          jobId={job.id}
                          currentStatus={job.status}
                        />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-sm text-text-secondary"
                  >
                    No jobs created yet
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
