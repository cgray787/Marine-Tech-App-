import { requireAdmin } from "@/lib/admin";
import { CreateJobForm } from "./create-job-form";
import { JobsByCustomer } from "./jobs-by-customer";
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
        "id, status, service_types, scheduled_date, scheduled_start, scheduled_end, customer_id, notes, boats:boat_id(name, make_model), profiles:assigned_to(full_name), customers:customer_id(name)"
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
            Grouped by customer — click a customer to expand their jobs.
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

      {/* Jobs grouped by customer */}
      <JobsByCustomer
        customers={customers || []}
        jobs={(jobs as unknown as Parameters<typeof JobsByCustomer>[0]['jobs']) || []}
      />
    </div>
  );
}
