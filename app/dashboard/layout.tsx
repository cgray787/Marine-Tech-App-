import { requireAdmin } from "@/lib/admin";
import { isOwner } from "@/lib/owner";
import { activeLocation } from "@/lib/location/server";
import { Sidebar } from "./sidebar";
import { QueryProvider } from "./QueryProvider";
import { RoleProvider } from "@/lib/role-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, supabase } = await requireAdmin();

  // The office filter only exists for org-wide users; everyone else is
  // already scoped to one office by RLS.
  const orgWide = profile.role === "admin" || isOwner(profile);
  const loc = orgWide ? await activeLocation() : null;
  const { data: locations } = orgWide
    ? await supabase.from("locations").select("id, name").order("name")
    : { data: null };

  let ownLocationName: string | null = null;
  if (!orgWide && profile.location_id) {
    const { data: ownLoc } = await supabase
      .from("locations")
      .select("name")
      .eq("id", profile.location_id)
      .single();
    ownLocationName = ownLoc?.name ?? null;
  }

  // Pending count for the sidebar badge — jobs with no schedule date and not completed.
  let pendingQuery = supabase
    .from("jobs")
    .select(loc ? "id, customers:customer_id!inner(location_id)" : "id", {
      count: "exact",
      head: true,
    })
    .is("scheduled_start", null)
    .is("scheduled_date", null)
    .neq("status", "completed");
  if (loc) pendingQuery = pendingQuery.eq("customers.location_id", loc);
  const { count: pendingJobCount } = await pendingQuery;

  return (
    <RoleProvider role={profile.role}>
      <div className="flex h-screen overflow-hidden bg-primary-bg print-layout">
        <div className="no-print">
          <Sidebar
            profile={profile}
            pendingJobCount={pendingJobCount ?? 0}
            locations={locations ?? []}
            activeLocationId={loc}
            showLocationSwitcher={orgWide}
            ownLocationName={ownLocationName}
          />
        </div>
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 print-main">
          <QueryProvider>{children}</QueryProvider>
        </main>
      </div>
    </RoleProvider>
  );
}
