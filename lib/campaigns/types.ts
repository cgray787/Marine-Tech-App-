import type { Manufacturer } from "./constants";

/** A labor line on a Mercury bulletin — MERCNET lists these as Code + Hours. */
export interface LaborCode {
  code: string;
  hours: number;
}

/** A part on a Mercury bulletin — MERCNET's Item Detail row. */
export interface PartNumber {
  item_number: string;
  description: string;
  qty: number;
}

/** A row in the catalog: the bulletin as issued by the manufacturer. */
export interface ServiceCampaign {
  id: string;
  org_id: string;
  manufacturer: Manufacturer;
  campaign_code: string;
  title: string;
  revision: string | null;
  description: string | null;
  instructions: string | null;
  /** Axopar "Compensated Work Hours"; for Mercury, the sum of its labor codes. */
  compensated_hours: number;
  priority: "normal" | "urgent";
  applies_to: string | null;
  bulletin_url: string | null;
  affected_hins: string[];
  engine_model: string | null;
  engine_serial_from: string | null;
  part_code: string | null;
  labor_codes: LaborCode[];
  part_numbers: PartNumber[];
  active: boolean;
}

export type CampaignStatus = "open" | "completed" | "not_applicable";

/**
 * A permanent record of one campaign against one boat. Snapshot fields are frozen
 * at insert by the campaign_log_freeze trigger and rejected on update by
 * campaign_log_no_rewrite — see migration 043.
 */
export interface CampaignLogEntry {
  id: string;
  campaign_id: string | null;
  boat_id: string | null;
  customer_id: string | null;
  job_id: string | null;

  // Frozen at attach time.
  manufacturer: Manufacturer;
  campaign_code: string;
  campaign_title: string;
  campaign_revision: string | null;
  instructions_snapshot: string | null;
  compensated_hours: number;
  boat_name: string | null;
  boat_hin: string | null;
  engine_serial: string | null;
  customer_name: string | null;

  // Mutable.
  status: CampaignStatus;
  conditions_found: string | null;
  actual_hours: number | null;
  engine_hours: number | null;
  claim_number: string | null;
  claim_status: string | null;
  completed_at: string | null;
  completed_by: string | null;
  backfilled: boolean;
  created_at: string;
}

/** A campaign staged on the Create Job form before the job exists. */
export interface DraftCampaign {
  campaign: ServiceCampaign;
  conditions_found: string;
  actual_hours: string;
  engine_hours: string;
  photo_count: number;
}

/** Minimal boat shape needed to decide whether a campaign applies. */
export interface BoatMatchInput {
  id: string;
  name: string | null;
  hin: string | null;
  engine_serial_port: string | null;
  engine_serial_starboard: string | null;
}
