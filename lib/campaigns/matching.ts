import type { ServiceCampaign, BoatMatchInput, LaborCode, DraftCampaign } from "./types";

/** Normalise an identifier for comparison — HINs and serials are quoted inconsistently. */
export function normalizeId(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Split a Mercury serial into a leading prefix and a trailing number, e.g.
 * "3B458751" -> { prefix: "3B", num: 458751 }. Returns null when the shape is not
 * recognised, which is the signal to fall back to "no automatic match".
 */
export function parseMercurySerial(
  serial: string | null | undefined
): { prefix: string; num: number } | null {
  const s = normalizeId(serial);
  const m = /^([A-Z]*\d?[A-Z]+)?(\d+)$/.exec(s);
  if (!m) return null;
  const num = Number(m[2]);
  if (!Number.isFinite(num)) return null;
  return { prefix: m[1] ?? "", num };
}

/**
 * Whether a boat's engine serial falls at or after a campaign's "and after" serial.
 *
 * Deliberately conservative: if either serial does not parse, or the prefixes differ,
 * this returns false rather than guessing. A missed suggestion is recoverable — the
 * tech still sees the full list — whereas a wrong auto-match puts a campaign against
 * the wrong hull and pollutes a permanent record.
 */
export function serialAtOrAfter(
  boatSerial: string | null | undefined,
  campaignFrom: string | null | undefined
): boolean {
  const b = parseMercurySerial(boatSerial);
  const c = parseMercurySerial(campaignFrom);
  if (!b || !c) return false;
  if (b.prefix !== c.prefix) return false;
  return b.num >= c.num;
}

/**
 * Does this campaign apply to this boat?
 *
 * NOT YET WIRED INTO ANY UI. The campaign pickers currently list every active
 * bulletin for a manufacturer and the user chooses. Turning this on needs two
 * things first: an engine-serial field on the Add/Edit Boat form (migration 043
 * added boats.engine_serial_port/starboard, but nothing writes them), and a
 * decision about whether a non-matching campaign should be hidden or merely
 * de-emphasised — hiding it would block a legitimate manual attach when the
 * manufacturer's range data is wrong, which happens.
 *
 * Kept and tested because the rules are subtle and worth pinning down now; see
 * __tests__/campaigns/matching.test.ts.
 *
 * Axopar issues a Boat Service Task against specific hulls, so we match on HIN.
 * Mercury issues a warranty claim against an engine serial range, so we match on
 * either engine's serial. A campaign with no targeting data applies to nothing
 * automatically — it has to be assigned by hand.
 */
export function campaignAppliesToBoat(
  campaign: Pick<
    ServiceCampaign,
    "manufacturer" | "affected_hins" | "engine_serial_from"
  >,
  boat: BoatMatchInput
): boolean {
  if (campaign.manufacturer === "axopar") {
    const hins = (campaign.affected_hins ?? []).map(normalizeId).filter(Boolean);
    if (hins.length === 0) return false;
    const hin = normalizeId(boat.hin);
    return hin !== "" && hins.includes(hin);
  }

  if (!campaign.engine_serial_from) return false;
  return (
    serialAtOrAfter(boat.engine_serial_port, campaign.engine_serial_from) ||
    serialAtOrAfter(boat.engine_serial_starboard, campaign.engine_serial_from)
  );
}

/** Boats a campaign applies to, preserving input order. */
export function boatsForCampaign<T extends BoatMatchInput>(
  campaign: Parameters<typeof campaignAppliesToBoat>[0],
  boats: T[]
): T[] {
  return boats.filter((b) => campaignAppliesToBoat(campaign, b));
}

/**
 * A Mercury bulletin's compensated hours are the sum of its labor codes (MERCNET
 * lists CA12 .5 + CA18 .5); Axopar states a single Compensated Work Hours figure.
 */
export function compensatedHours(
  campaign: Pick<ServiceCampaign, "manufacturer" | "compensated_hours" | "labor_codes">
): number {
  if (campaign.manufacturer === "mercury" && campaign.labor_codes?.length) {
    return round2(campaign.labor_codes.reduce((s, l) => s + toNum(l.hours), 0));
  }
  return round2(toNum(campaign.compensated_hours));
}

export function laborCodeSummary(codes: LaborCode[] | null | undefined): string {
  if (!codes?.length) return "";
  return codes.map((c) => `${c.code} ${toNum(c.hours).toFixed(1)}`).join(" · ");
}

/**
 * Why a campaign cannot yet be marked complete, or null when it can.
 *
 * A claim gets rejected for exactly two reasons more than any other: no written
 * finding and no photographic evidence. Blocking here is cheaper than a rejection
 * three weeks later, when the boat has left.
 */
export function completionBlocker(entry: {
  conditions_found?: string | null;
  photo_count?: number;
}): string | null {
  const hasNote = (entry.conditions_found ?? "").trim().length > 0;
  const hasPhoto = (entry.photo_count ?? 0) > 0;
  if (!hasNote && !hasPhoto) return "Needs a photo and a written finding";
  if (!hasPhoto) return "Needs at least one photo";
  if (!hasNote) return "Needs a written finding";
  return null;
}

export function canComplete(entry: {
  conditions_found?: string | null;
  photo_count?: number;
}): boolean {
  return completionBlocker(entry) === null;
}

/** Compensated vs actual across a set of campaigns, for the job footer and reporting. */
export function hoursSummary(
  drafts: Array<Pick<DraftCampaign, "campaign" | "actual_hours">>
): { compensated: number; actual: number; variance: number } {
  const compensated = round2(
    drafts.reduce((s, d) => s + compensatedHours(d.campaign), 0)
  );
  const actual = round2(drafts.reduce((s, d) => s + toNum(d.actual_hours), 0));
  return { compensated, actual, variance: round2(actual - compensated) };
}

/**
 * Whether an entry still counts as work. Voided entries are withdrawn mistakes and
 * must be excluded from every count, total and outstanding list — but never hidden
 * outright, because the whole point of the record is that nothing disappears.
 */
export function isLive(entry: { status: string }): boolean {
  return entry.status !== "voided";
}

/** How a log entry reads in a history list. */
export function statusLabel(entry: {
  status: string;
  backfilled?: boolean;
  voided_reason?: string | null;
}): string {
  switch (entry.status) {
    case "voided":
      return entry.voided_reason ? `Withdrawn — ${entry.voided_reason}` : "Withdrawn";
    case "completed":
      return entry.backfilled ? "Completed (recorded later)" : "Completed";
    case "not_applicable":
      return "Not applicable";
    default:
      return "Open";
  }
}

/**
 * Outstanding campaigns for a boat: open, not voided. Used for the "campaigns to
 * do" count on the job and boat screens.
 */
export function outstanding<T extends { status: string }>(entries: T[]): T[] {
  return entries.filter((e) => e.status === "open");
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Round to two places on integer hundredths rather than nudging by Number.EPSILON.
 * EPSILON is a fixed 2.22e-16 while the gap it must bridge grows with magnitude, so
 * that trick silently stops working above ~1 — the same weakness flagged in
 * lib/work-orders/totals.ts. Hours are small, but the fix costs nothing.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
}
