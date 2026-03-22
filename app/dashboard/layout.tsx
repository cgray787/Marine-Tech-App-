import { requireAdmin } from "@/lib/admin";
import { Sidebar } from "./sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAdmin();

  return (
    <div className="flex h-screen overflow-hidden bg-primary-bg print:block print:h-auto print:overflow-visible">
      <div className="print:hidden">
        <Sidebar profile={profile} />
      </div>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8 print:overflow-visible print:p-0">
        {children}
      </main>
    </div>
  );
}
