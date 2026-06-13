export type WOStatus = "draft" | "approved" | "completed" | "invoiced";
export type JobType = "frh" | "flat" | "per_foot";
export type LineKind = "part" | "shop_supplies" | "shipping" | "flat_service" | "other";
export type CustomerStatus = "estimate" | "approved";
export type WOJobStatus = "open" | "awaiting_customer" | "in_progress" | "done";

export interface TaxEntry { name: string; rate_pct: number; }

export interface PriceLevel {
  id: string; name: string; rate: number; unit: "hour" | "foot"; active: boolean;
}

export interface JobTemplate {
  id: string; name: string; description: string | null; notes_to_tech: string | null;
  default_hours: number | null; default_price_level_id: string | null; active: boolean;
}

export interface WOSettings {
  org_id: string; shop_supplies_amount: number; default_margin_pct: number;
  default_cc_fee_pct: number; default_taxes: TaxEntry[];
}

export interface WOLine {
  id: string; work_order_job_id: string; kind: LineKind; item_code: string | null;
  description: string | null; qty: number; unit_cost: number; margin_pct: number | null;
  taxable: boolean; position: number;
}

export interface WOJob {
  id: string; work_order_id: string; position: number; title: string;
  description: string | null; notes_to_tech: string | null; cause: string | null;
  correction: string | null; customer_status: CustomerStatus; job_status: WOJobStatus;
  job_type: JobType; price_level_id: string | null; hours: number | null;
  flat_price: number | null; boat_length_ft: number | null; labor_taxable: boolean;
  assigned_tech: string | null;
  price_levels?: PriceLevel | null;            // joined
  work_order_lines?: WOLine[];                 // joined
  profiles?: { full_name: string } | null;     // joined assigned tech
}

export interface WOPayment {
  id: string; work_order_id: string; paid_on: string; method: string | null;
  note: string | null; amount: number;
}

export interface WorkOrderFull {
  id: string; wo_number: number; status: WOStatus; customer_id: string;
  boat_id: string | null; location_id: string | null; service_advisor: string | null;
  wo_date: string; default_margin_pct: number; taxes: TaxEntry[];
  cc_fee_pct: number | null; printed_notes: string | null; internal_notes: string | null;
  approved_at: string | null; completed_at: string | null; invoiced_at: string | null;
  quickbooks_invoice_id: string | null;
  quickbooks_synced_at: string | null;
  customers?: { id: string; name: string; email: string | null; phone: string | null } | null;
  boats?: { id: string; name: string; make_model: string | null; year: number | null; hin: string | null } | null;
  profiles?: { full_name: string } | null;     // joined advisor
  work_order_jobs?: WOJob[];
  work_order_payments?: WOPayment[];
  locations?: { name: string } | null;
}
