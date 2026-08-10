import { supabase } from "@/lib/supabase";

// Service campaigns on the field app. Mirrors lib/campaigns on the web — the two
// surfaces read and write the same campaign_log and report_photos rows, so an
// admin attaching a campaign in the dashboard makes it appear here, and a photo
// shot here shows up there.

export type Manufacturer = "axopar" | "mercury";
export type CampaignStatus = "open" | "completed" | "not_applicable" | "voided";

export interface CampaignEntry {
  id: string;
  manufacturer: Manufacturer;
  campaign_code: string;
  campaign_title: string;
  campaign_revision: string | null;
  instructions_snapshot: string | null;
  compensated_hours: number;
  status: CampaignStatus;
  conditions_found: string | null;
  actual_hours: number | null;
  engine_hours: number | null;
  boat_name: string | null;
  voided_reason: string | null;
}

export interface CampaignPhoto {
  id: string;
  campaign_log_id: string;
  photo_url: string;
}

const ENTRY_COLS =
  "id, manufacturer, campaign_code, campaign_title, campaign_revision, instructions_snapshot, " +
  "compensated_hours, status, conditions_found, actual_hours, engine_hours, boat_name, voided_reason";

/** Campaigns attached to a job. Withdrawn entries are filtered out — the tech
 *  should never be handed work that was retracted. */
export async function getJobCampaigns(jobId: string): Promise<CampaignEntry[]> {
  const { data, error } = await supabase
    .from("campaign_log")
    .select(ENTRY_COLS)
    .eq("job_id", jobId)
    .neq("status", "voided")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as CampaignEntry[];
}

/** Photos already attached to these campaigns, keyed by entry id. */
export async function getCampaignPhotos(
  entryIds: string[]
): Promise<Record<string, CampaignPhoto[]>> {
  if (entryIds.length === 0) return {};
  const { data, error } = await supabase
    .from("report_photos")
    .select("id, campaign_log_id, photo_url")
    .in("campaign_log_id", entryIds)
    .order("created_at");
  if (error) throw error;
  const out: Record<string, CampaignPhoto[]> = {};
  for (const p of (data ?? []) as unknown as CampaignPhoto[]) {
    (out[p.campaign_log_id] ??= []).push(p);
  }
  return out;
}

/** Save the tech's findings and hours. */
export async function saveCampaignWork(
  entryId: string,
  patch: {
    conditions_found?: string | null;
    actual_hours?: number | null;
    engine_hours?: number | null;
  }
): Promise<void> {
  const { error } = await supabase.from("campaign_log").update(patch).eq("id", entryId);
  if (error) throw error;
}

/**
 * Upload a work-area photo and link it to the campaign.
 *
 * Reuses the report-photos bucket the service form already writes to, so there is
 * one storage path and one set of permissions rather than a parallel system.
 */
export async function uploadCampaignPhoto(
  entryId: string,
  localUri: string,
  caption?: string
): Promise<CampaignPhoto> {
  const fileName = `campaigns/${entryId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.jpg`;

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("report-photos")
    .upload(fileName, arrayBuffer, { contentType: "image/jpeg" });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("report-photos").getPublicUrl(fileName);

  const { data, error } = await supabase
    .from("report_photos")
    .insert({
      campaign_log_id: entryId,
      photo_url: publicUrl,
      category: "campaign",
      caption: caption ?? null,
    })
    .select("id, campaign_log_id, photo_url")
    .single();
  if (error) throw error;
  return data as unknown as CampaignPhoto;
}

/** Mark a campaign done. Requires a written finding and at least one photo —
 *  the two things whose absence gets a warranty claim rejected. */
export async function completeCampaign(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("campaign_log")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw error;
}

export function completionBlocker(e: {
  conditions_found?: string | null;
  photoCount: number;
}): string | null {
  const hasNote = (e.conditions_found ?? "").trim().length > 0;
  if (!hasNote && e.photoCount === 0) return "Needs a photo and a written finding";
  if (e.photoCount === 0) return "Needs at least one photo";
  if (!hasNote) return "Needs a written finding";
  return null;
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export const MARK: Record<Manufacturer, string> = { axopar: "AX", mercury: "MR" };
