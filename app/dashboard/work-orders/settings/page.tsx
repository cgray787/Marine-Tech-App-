import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import type { PriceLevel, JobTemplate, WOSettings } from "@/lib/work-orders/types";
import type { ServiceCampaign } from "@/lib/campaigns/types";
import { CampaignsCard } from "./campaigns-card";
import { SettingsClient } from "./settings-client";

export default async function WorkOrderSettingsPage() {
  const { supabase, profile } = await requireAdmin();

  if (!(profile.role === "admin" || profile.role === "manager")) {
    redirect("/dashboard/work-orders");
  }

  const orgId = profile.org_id as string;

  const [
    { data: priceLevels },
    { data: jobTemplates },
    { data: serviceCampaigns },
    { data: woSettingsRow },
  ] = await Promise.all([
    supabase
      .from("price_levels")
      .select("id, name, rate, unit, active")
      .eq("org_id", orgId)
      .order("name"),
    supabase
      .from("job_templates")
      .select("id, name, description, notes_to_tech, default_hours, default_price_level_id, active")
      .eq("org_id", orgId)
      .order("name"),
    supabase
      .from("service_campaigns")
      .select(
        "id, org_id, manufacturer, campaign_code, title, revision, description, instructions, " +
          "compensated_hours, priority, applies_to, bulletin_url, affected_hins, engine_model, " +
          "engine_serial_from, part_code, labor_codes, part_numbers, active"
      )
      .eq("org_id", orgId)
      .order("manufacturer")
      .order("campaign_code", { ascending: false }),
    supabase
      .from("wo_settings")
      .select("org_id, shop_supplies_amount, default_margin_pct, default_cc_fee_pct, default_taxes")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <RealtimeRefresh tables={["price_levels", "job_templates", "wo_settings", "service_campaigns"]} />

      {/* Back link + header */}
      <div>
        <Link
          href="/dashboard/work-orders"
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ChevronLeft size={16} />
          Work Orders
        </Link>
        <h1 className="text-2xl font-bold text-text-primary">Work Order Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Configure price levels, job templates, service campaigns, and default values for new work orders.
        </p>
      </div>

      <CampaignsCard
        campaigns={(serviceCampaigns ?? []) as unknown as ServiceCampaign[]}
        orgId={orgId}
      />

      <SettingsClient
        priceLevels={(priceLevels ?? []) as PriceLevel[]}
        jobTemplates={(jobTemplates ?? []) as JobTemplate[]}
        woSettings={woSettingsRow as WOSettings | null}
        orgId={orgId}
      />
    </div>
  );
}
