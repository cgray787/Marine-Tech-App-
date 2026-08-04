import { createClient } from "@/lib/supabase/client";
import type { Manufacturer } from "./constants";
import type { ServiceCampaign, CampaignLogEntry, DraftCampaign } from "./types";
import { compensatedHours } from "./matching";

const CAMPAIGN_COLS =
  "id, org_id, manufacturer, campaign_code, title, revision, description, instructions, " +
  "compensated_hours, priority, applies_to, bulletin_url, affected_hins, engine_model, " +
  "engine_serial_from, part_code, labor_codes, part_numbers, active";

const LOG_COLS =
  "id, campaign_id, boat_id, customer_id, job_id, manufacturer, campaign_code, campaign_title, " +
  "campaign_revision, instructions_snapshot, compensated_hours, boat_name, boat_hin, engine_serial, " +
  "customer_name, status, conditions_found, actual_hours, engine_hours, claim_number, claim_status, " +
  "completed_at, completed_by, voided_at, voided_by, voided_reason, backfilled, created_at";

/** Active campaigns for one manufacturer, newest first. Feeds the Create Job picker. */
export async function getCampaigns(manufacturer: Manufacturer): Promise<ServiceCampaign[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_campaigns")
    .select(CAMPAIGN_COLS)
    .eq("manufacturer", manufacturer)
    .eq("active", true)
    .order("campaign_code", { ascending: false });
  if (error) throw error;
  // Double cast: the generated Supabase types predate migration 043 and will pick
  // these tables up on the next `generate_typescript_types` run.
  return (data ?? []) as unknown as ServiceCampaign[];
}

/** Every campaign, active or not — the settings catalog view. */
export async function getAllCampaigns(): Promise<ServiceCampaign[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_campaigns")
    .select(CAMPAIGN_COLS)
    .order("manufacturer")
    .order("campaign_code", { ascending: false });
  if (error) throw error;
  // Double cast: the generated Supabase types predate migration 043 and will pick
  // these tables up on the next `generate_typescript_types` run.
  return (data ?? []) as unknown as ServiceCampaign[];
}

/** Permanent history for a boat — the block on the boat and client pages. */
export async function getCampaignLogForBoat(boatId: string): Promise<CampaignLogEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("campaign_log")
    .select(LOG_COLS)
    .eq("boat_id", boatId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CampaignLogEntry[];
}

/** Permanent history across all of a client's boats. */
export async function getCampaignLogForCustomer(customerId: string): Promise<CampaignLogEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("campaign_log")
    .select(LOG_COLS)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CampaignLogEntry[];
}

/** Campaigns attached to a job — what the tech works through. */
export async function getCampaignLogForJob(jobId: string): Promise<CampaignLogEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("campaign_log")
    .select(LOG_COLS)
    .eq("job_id", jobId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as CampaignLogEntry[];
}

/**
 * Attach staged campaigns to a freshly created job.
 *
 * Snapshot columns are filled by the campaign_log_freeze trigger (migration 043)
 * rather than here, so the frozen text always comes from the database at insert
 * time and cannot be spoofed by the client.
 */
export async function attachCampaignsToJob(params: {
  jobId: string;
  boatId: string | null;
  customerId: string | null;
  drafts: DraftCampaign[];
}): Promise<void> {
  const { jobId, boatId, customerId, drafts } = params;
  if (drafts.length === 0) return;

  const supabase = createClient();
  const rows = drafts.map((d) => ({
    campaign_id: d.campaign.id,
    org_id: d.campaign.org_id,
    boat_id: boatId,
    customer_id: customerId,
    job_id: jobId,
    manufacturer: d.campaign.manufacturer,
    campaign_code: d.campaign.campaign_code,
    campaign_title: d.campaign.title,
    compensated_hours: compensatedHours(d.campaign),
    status: "open" as const,
    conditions_found: d.conditions_found.trim() || null,
    actual_hours: numOrNull(d.actual_hours),
    engine_hours: numOrNull(d.engine_hours),
  }));

  const { error } = await supabase.from("campaign_log").insert(rows);
  if (error) throw error;
}

/**
 * Record a campaign against a boat that was performed before the app existed.
 * Flagged `backfilled` so an audit can tell a reconstructed record from one
 * captured live — a backfilled row has no photos and often no named tech.
 */
export async function backfillCampaign(params: {
  campaignId: string;
  orgId: string;
  boatId: string;
  completedAt: string;
  notes?: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("campaign_log").insert({
    campaign_id: params.campaignId,
    org_id: params.orgId,
    boat_id: params.boatId,
    status: "completed",
    completed_at: params.completedAt,
    conditions_found: params.notes?.trim() || null,
    backfilled: true,
  });
  if (error) throw error;
}

/** Update the mutable fields of a log entry. Snapshot columns are rejected by trigger. */
export async function updateCampaignEntry(
  id: string,
  patch: Partial<
    Pick<
      CampaignLogEntry,
      | "status"
      | "conditions_found"
      | "actual_hours"
      | "engine_hours"
      | "claim_number"
      | "claim_status"
      | "completed_at"
      | "completed_by"
    >
  >
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("campaign_log").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Withdraw a campaign attached in error. This is the app's "delete": the row is
 * never removed — the database refuses DELETE outright — it is marked voided with
 * a reason and stays visible in the history, greyed out.
 *
 * Voiding also frees the campaign to be attached to that boat again, because the
 * one-live-row-per-boat unique index excludes voided rows. Without that, a single
 * mis-click would block the pairing permanently.
 */
export async function voidCampaignEntry(id: string, reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error("A reason is required to withdraw a campaign entry.");
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("campaign_log")
    .update({ status: "voided", voided_reason: trimmed })
    .eq("id", id);
  if (error) throw error;
}

function numOrNull(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
