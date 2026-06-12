export interface Letterhead { company: string; lines: string[]; }

const SEATTLE: Letterhead = {
  company: "Jeff Brown Yachts Seattle",
  lines: ["2288 W. Commodore Way, Suite 110", "Seattle, WA 98199", "(619) 222-9899", "https://jeffbrownyachts.com"],
};

const DEFAULT: Letterhead = {
  company: "Jeff Brown Yachts",
  lines: ["https://jeffbrownyachts.com"],
};

export function letterheadFor(locationName: string | null | undefined): Letterhead {
  if (locationName?.toLowerCase().includes("seattle")) return SEATTLE;
  return DEFAULT;
}
