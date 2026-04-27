import { requireAdmin } from "@/lib/admin";
import { Sidebar } from "./sidebar";
import { QueryProvider } from "./QueryProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAdmin();

  return (
    <div className="flex h-screen overflow-hidden bg-primary-bg print-layout">
      <div className="no-print">
        <Sidebar profile={profile} />
      </div>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8 print-main">
        <QueryProvider>{children}</QueryProvider>
      </main>
    </div>
  );
}
