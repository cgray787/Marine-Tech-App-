import { requireAdmin } from "@/lib/admin";
import { fetchWorkOrderFull } from "@/lib/work-orders/queries";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { notFound } from "next/navigation";
import { WOEditor } from "./editor";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireAdmin();
  let wo;
  try { wo = await fetchWorkOrderFull(supabase, id); } catch { notFound(); }
  const [{ data: customers }, { data: boats }, { data: priceLevels }, { data: templates }, { data: settings }, { data: staff }] = await Promise.all([
    supabase.from("customers").select("id, name, email, phone").order("name"),
    supabase.from("boats").select("id, name, make_model, customer_id").order("name"),
    supabase.from("price_levels").select("*").eq("active", true).order("name"),
    supabase.from("job_templates").select("*").eq("active", true).order("name"),
    supabase.from("wo_settings").select("*").single(),
    supabase.from("profiles").select("id, full_name").in("role", ["admin", "manager", "tech"]).eq("status", "active").order("full_name"),
  ]);
  const canEdit = profile.role === "admin" || profile.role === "manager";
  const isViewer = profile.role === "viewer";
  return (
    <div>
      <RealtimeRefresh tables={["work_orders", "work_order_jobs", "work_order_lines", "work_order_payments"]} />
      <WOEditor
        wo={wo}
        customers={customers ?? []}
        boats={boats ?? []}
        priceLevels={priceLevels ?? []}
        templates={templates ?? []}
        settings={settings}
        staff={staff ?? []}
        canEdit={canEdit}
        hideCosts={isViewer}
        profileId={profile.id}
      />
    </div>
  );
}
