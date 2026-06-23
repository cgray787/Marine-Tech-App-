// brand-filter.ts — the "Jeff Brown Yachts only" filter for Salesforce logging.
//
// Salesforce is Jeff Brown Yachts' CRM. Gray Yachts is Connor's SEPARATE
// brokerage. Per Connor (2026-06-23): never write Gray Yachts information into
// Salesforce. Concretely:
//   1. Strip any "Gray Yachts" mention out of anything we write (redaction).
//   2. For a conversation that is itself a Gray Yachts thread, log only a
//      contentless summary (counts) — never the message details, never the
//      brand name.
//
// This module is that filter, isolated from the rest of the job so it can be
// reasoned about and tested on its own.

import type { ActivityItem } from "./quo.ts";

export type Brand = "jby" | "gray_yachts" | "unknown";

// Patterns that identify each brand in message text. Case-insensitive and
// tolerant of spacing/variants: "Gray Yachts", "GrayYachts", "gray yachts
// media", grayyachts.com / grayyachts.media.
const GRAY_YACHTS_RE = /\bgray\s*yachts\b|grayyachts(\.(com|media))?/i;
const JBY_RE = /\bjeff\s*brown\s*yachts\b|jeffbrownyachts/i;

const REDACTION = "[redacted — non-JBY]";

/**
 * Classify a conversation's brand from its message text. A JBY greeting present
 * => "jby" (the funnel's Touch-1 says "this is Connor Gray with Jeff Brown
 * Yachts"); a Gray Yachts greeting and no JBY signal => "gray_yachts" ("Connor
 * with Gray Yachts"); neither => "unknown". When JBY wins, any Gray Yachts
 * mentions inside the thread are still scrubbed by `redactItems`.
 */
export function classifyBrand(items: ActivityItem[]): Brand {
  let sawJby = false;
  let sawGray = false;
  for (const i of items) {
    const t = i.text ?? "";
    if (!t) continue;
    if (JBY_RE.test(t)) sawJby = true;
    if (GRAY_YACHTS_RE.test(t)) sawGray = true;
  }
  if (sawJby) return "jby";
  if (sawGray) return "gray_yachts";
  return "unknown";
}

/** True when a single message body references Gray Yachts. */
export function mentionsGrayYachts(text: string | null | undefined): boolean {
  return !!text && GRAY_YACHTS_RE.test(text);
}

/**
 * Redact Gray Yachts content from one message body. Any body that mentions Gray
 * Yachts is replaced wholesale — we never leave partial Gray Yachts detail in
 * Salesforce. Other bodies pass through unchanged.
 */
export function redactGrayYachts(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return mentionsGrayYachts(text) ? REDACTION : text;
}

/** Return items with every text body run through the Gray Yachts redactor. */
export function redactItems(items: ActivityItem[]): ActivityItem[] {
  return items.map((i) =>
    i.kind === "text" ? { ...i, text: redactGrayYachts(i.text) } : i
  );
}

/** True if redaction changed at least one item's text body. */
export function anyRedacted(original: ActivityItem[], redacted: ActivityItem[]): boolean {
  return original.some((o, idx) => (o.text ?? "") !== (redacted[idx]?.text ?? ""));
}

/**
 * A contentless summary for a Gray Yachts thread: counts only — no message
 * bodies, no brand name, no details. This is what (rarely) lands in SF when a
 * Gray Yachts contact also exists as a JBY Person Account.
 */
export function grayYachtsSummary(items: ActivityItem[]): string {
  const texts = items.filter((i) => i.kind === "text").length;
  const calls = items.filter((i) => i.kind === "call").length;
  const parts: string[] = [];
  if (texts) parts.push(`${texts} text${texts === 1 ? "" : "s"}`);
  if (calls) parts.push(`${calls} call${calls === 1 ? "" : "s"}`);
  const tally = parts.join(", ") || "activity";
  return `Client contact logged (${tally}). Details omitted — non-JBY.`;
}
