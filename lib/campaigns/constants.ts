// Shared service-type list. This used to be copy-pasted in create-job-form.tsx and
// job-editor.tsx; adding entries to two copies is how lists drift, so both now import
// from here. Mobile mirrors this file.

/** Manufacturer campaign service types. Values are stored verbatim in jobs.service_types. */
export const AXOPAR_CAMPAIGN = "AXOPAR Service Campaign";
export const MERCURY_CAMPAIGN = "Mercury Service Campaign";

export type Manufacturer = "axopar" | "mercury";

/** The campaign service types, in display order, with their manufacturer key. */
export const CAMPAIGN_SERVICE_TYPES: ReadonlyArray<{
  type: string;
  manufacturer: Manufacturer;
  /** Two-letter chip shown next to the checkbox and on each campaign row. */
  mark: string;
}> = [
  { type: AXOPAR_CAMPAIGN, manufacturer: "axopar", mark: "AX" },
  { type: MERCURY_CAMPAIGN, manufacturer: "mercury", mark: "MR" },
];

/** Standard, non-campaign service types. */
export const STANDARD_SERVICE_TYPES = [
  "Engine Service",
  "Electrical",
  "Hull & Bottom",
  "Safety Inspection",
  "Navigation Systems",
  "General Maintenance",
  "Winterization",
  "Spring Commissioning",
  "Sea Trial",
] as const;

/** Everything shown in the SERVICES checkbox list, campaigns last. */
export const SERVICE_TYPE_OPTIONS: readonly string[] = [
  ...STANDARD_SERVICE_TYPES,
  ...CAMPAIGN_SERVICE_TYPES.map((c) => c.type),
];

/** The manufacturer a service type maps to, or null when it is a standard type. */
export function manufacturerForServiceType(type: string): Manufacturer | null {
  return CAMPAIGN_SERVICE_TYPES.find((c) => c.type === type)?.manufacturer ?? null;
}

/** The service type that carries a given manufacturer's campaigns. */
export function serviceTypeForManufacturer(m: Manufacturer): string {
  const found = CAMPAIGN_SERVICE_TYPES.find((c) => c.manufacturer === m);
  if (!found) throw new Error(`Unknown manufacturer: ${m}`);
  return found.type;
}

export function isCampaignServiceType(type: string): boolean {
  return manufacturerForServiceType(type) !== null;
}

/** Display label — "Axopar" / "Mercury". */
export function manufacturerLabel(m: Manufacturer): string {
  return m === "axopar" ? "Axopar" : "Mercury";
}

/**
 * How each manufacturer identifies an affected vessel. Axopar issues a Boat Service
 * Task against a HIN; Mercury issues a warranty claim against an engine serial.
 */
export function matchFieldLabel(m: Manufacturer): string {
  return m === "axopar" ? "HIN" : "engine serial";
}
