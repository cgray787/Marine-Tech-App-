import { requireAdmin } from "@/lib/admin";
import { Sidebar } from "./sidebar";
import { QueryProvider } from "./QueryProvider";
import { RoleProvider } from "@/lib/role-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, supabase } = await requireAdmin();

  // Pending count for the sidebar badge — jobs with no schedule date and not completed.
  const { count: pendingJobCount } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .is("scheduled_start", null)
    .is("scheduled_date", null)
    .neq("status", "completed");

  return (
    <RoleProvider role={profile.role}>
      <div className="flex h-screen overflow-hidden bg-primary-bg print-layout">
        <div className="no-print">
          <Sidebar profile={profile} pendingJobCount={pendingJobCount ?? 0} />
        </div>
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 print-main">
          <QueryProvider>{children}</QueryProvider>
        </main>
      </div>
    </RoleProvider>
  );
}
