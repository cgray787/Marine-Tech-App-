import { requireAdmin } from "@/lib/admin";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { WOList, type WOListRow } from "./wo-list";

export default async function WorkOrdersPage() {
  const { supabase, profile } = await requireAdmin();
  const [{ data: rows }, { data: customers }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_number, status, wo_date, default_margin_pct, taxes, cc_fee_pct, customers:customer_id(name), boats:boat_id(name), work_order_jobs(job_type, hours, flat_price, boat_length_ft, labor_taxable, price_levels:price_level_id(rate, unit), work_order_lines(kind, qty, unit_cost, margin_pct, taxable)), work_order_payments(amount)")
      .order("wo_number", { ascending: false }),
    supabase.from("customers").select("id, name").order("name"),
  ]);
  const canEdit = profile.role === "admin" || profile.role === "manager";
  return (
    <div>
      <RealtimeRefresh tables={["work_orders", "work_order_jobs", "work_order_lines", "work_order_payments"]} />
      <WOList rows={(rows ?? []) as unknown as WOListRow[]} customers={customers ?? []} canEdit={canEdit} profileId={profile.id} />
    </div>
  );
}
