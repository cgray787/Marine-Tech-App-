import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkOrderFull, WOJob } from "./types";
import type { TotalsInput, TotalsJob } from "./totals";

export async function createDraftWorkOrder(
  supabase: SupabaseClient,
  { profileId, customerId }: { profileId: string; customerId: string }
): Promise<{ id: string } | { error: string }> {
  const [{ data: settings }, { data: me }, { data: customer }] = await Promise.all([
    supabase.from("wo_settings").select("*").single(),
    supabase.from("profiles").select("id, org_id, location_id").eq("id", profileId).single(),
    supabase.from("customers").select("location_id").eq("id", customerId).single(),
  ]);
  if (!me) return { error: "Could not load your profile." };
  const { data: created, error } = await supabase
    .from("work_orders")
    .insert({
      org_id: me.org_id,
      // The WO belongs to the customer's office, not the creator's — an
      // org-wide admin (location_id NULL) creating a Seattle WO must still
      // produce a WO that Seattle's manager can see.
      location_id: customer?.location_id ?? me.location_id,
      customer_id: customerId,
      service_advisor: profileId,
      created_by: profileId,
      default_margin_pct: settings?.default_margin_pct ?? 25,
      taxes: settings?.default_taxes ?? [],
      cc_fee_pct: null,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Work order was not created." };
  return { id: created.id };
}

export const WO_FULL_SELECT = `
  id, wo_number, status, customer_id, boat_id, location_id, service_advisor,
  wo_date, default_margin_pct, taxes, cc_fee_pct, printed_notes, internal_notes,
  approved_at, completed_at, invoiced_at, quickbooks_invoice_id, quickbooks_synced_at,
  customers:customer_id ( id, name, email, phone ),
  boats:boat_id ( id, name, make_model, year, hin ),
  profiles:service_advisor ( full_name ),
  locations:location_id ( name ),
  work_order_jobs (
    id, work_order_id, position, title, description, notes_to_tech, cause, correction,
    customer_status, job_status, job_type, price_level_id, hours, flat_price,
    boat_length_ft, labor_taxable, assigned_tech,
    price_levels:price_level_id ( id, name, rate, unit, active ),
    profiles:assigned_tech ( full_name ),
    work_order_lines ( id, work_order_job_id, kind, item_code, description, qty, unit_cost, margin_pct, taxable, position )
  ),
  work_order_payments ( id, work_order_id, paid_on, method, note, amount )
`;

export async function fetchWorkOrderFull(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("work_orders").select(WO_FULL_SELECT).eq("id", id).single();
  if (error) throw error;
  const wo = data as unknown as WorkOrderFull;
  wo.work_order_jobs?.sort((a, b) => a.position - b.position);
  wo.work_order_jobs?.forEach((j) => j.work_order_lines?.sort((a, b) => a.position - b.position));
  return wo;
}

/** Adapter: joined DB rows -> pure totals input. */
export function toTotalsInput(wo: WorkOrderFull): TotalsInput {
  const jobs: TotalsJob[] = (wo.work_order_jobs ?? []).map((j: WOJob) => ({
    job_type: j.job_type,
    hours: j.hours == null ? null : Number(j.hours),
    flat_price: j.flat_price == null ? null : Number(j.flat_price),
    boat_length_ft: j.boat_length_ft == null ? null : Number(j.boat_length_ft),
    rate: Number(j.price_levels?.rate ?? 0),
    rate_unit: j.price_levels?.unit ?? "hour",
    labor_taxable: j.labor_taxable,
    lines: (j.work_order_lines ?? []).map((l) => ({
      kind: l.kind, qty: Number(l.qty), unit_cost: Number(l.unit_cost),
      margin_pct: l.margin_pct == null ? null : Number(l.margin_pct),
      taxable: l.taxable,
    })),
  }));
  return {
    jobs,
    default_margin_pct: Number(wo.default_margin_pct),
    taxes: wo.taxes ?? [],
    cc_fee_pct: wo.cc_fee_pct == null ? null : Number(wo.cc_fee_pct),
    payments: (wo.work_order_payments ?? []).map((p) => Number(p.amount)),
  };
}
