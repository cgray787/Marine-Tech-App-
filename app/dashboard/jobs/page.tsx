import { requireAdmin } from "@/lib/admin";
import { locationFilterFor } from "@/lib/location/server";
import { CreateJobForm } from "./create-job-form";
import { JobsByCustomer } from "./jobs-by-customer";
import { PendingJobsPanel } from "./pending-jobs-panel";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export default async function JobsPage() {
  const { supabase, profile } = await requireAdmin();
  const loc = await locationFilterFor(profile);

  // Jobs follow their customer's office, so the office filter rides an inner
  // join on the embedded customer. Without the filter, keep the plain embed
  // so customer-less jobs still show.
  const jobsCustomerEmbed = loc
    ? "customers:customer_id!inner(name, location_id)"
    : "customers:customer_id(name)";

  let jobsQuery = supabase
    .from("jobs")
    .select(
      `id, status, service_types, scheduled_date, scheduled_start, scheduled_end, customer_id, notes, boats:boat_id(name, make_model), profiles:assigned_to(full_name), ${jobsCustomerEmbed}`
    )
    .order("created_at", { ascending: false });
  if (loc) jobsQuery = jobsQuery.eq("customers.location_id", loc);

  // Pending = both timestamp columns null, not completed
  let pendingQuery = supabase
    .from("jobs")
    .select(
      `id, status, service_types, customer_id, notes, boats:boat_id(name, make_model), profiles:assigned_to(full_name), ${jobsCustomerEmbed}`
    )
    .is("scheduled_start", null)
    .is("scheduled_date", null)
    .neq("status", "completed")
    .order("created_at", { ascending: false });
  if (loc) pendingQuery = pendingQuery.eq("customers.location_id", loc);

  let customersQuery = supabase.from("customers").select("id, name");
  if (loc) customersQuery = customersQuery.eq("location_id", loc);

  let boatsQuery = supabase
    .from("boats")
    .select(
      loc
        ? "id, name, customer_id, make_model, customers:customer_id!inner(location_id)"
        : "id, name, customer_id, make_model"
    );
  if (loc) boatsQuery = boatsQuery.eq("customers.location_id", loc);

  // Managers are also assignable as techs — they do floor work too, and
  // promoting Derik to manager would otherwise hide him from the dropdown.
  // Under an office filter, only that office's staff are assignable (the
  // jobs.assigned_to trigger from migration 035 enforces this at the DB too).
  let techsQuery = supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["tech", "manager"])
    .eq("status", "active");
  if (loc) techsQuery = techsQuery.eq("location_id", loc);

  const [
    { data: jobs },
    { data: pendingJobs },
    { data: customers },
    { data: boats },
    { data: techs },
    { data: marinas },
  ] = await Promise.all([
    jobsQuery,
    pendingQuery,
    customersQuery.order("name"),
    boatsQuery.order("name"),
    techsQuery.order("full_name"),
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
        boats={(boats as unknown as Parameters<typeof CreateJobForm>[0]['boats']) || []}
        techs={techs || []}
        marinas={marinas || []}
      />

      {/* Pending Jobs panel — jobs with no schedule date at all */}
      <PendingJobsPanel
        jobs={(pendingJobs as unknown as Parameters<typeof PendingJobsPanel>[0]['jobs']) || []}
      />

      {/* Jobs grouped by customer */}
      <JobsByCustomer
        customers={customers || []}
        jobs={(jobs as unknown as Parameters<typeof JobsByCustomer>[0]['jobs']) || []}
      />
    </div>
  );
}
