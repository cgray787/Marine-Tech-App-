// Pure helpers for the private "do-not-report" list.
//
// Some of Connor's Quo contacts are private and must NEVER be written into
// Salesforce. The edge function loads the active rows from
// `public.quo_do_not_report` and uses the helpers below (no I/O) to decide
// whether a given Quo counterpart must be skipped before anything is logged.
//
// Matching is primarily by phone (digits-only last-10 — the same key the rest of
// the function uses to match Salesforce accounts), with a secondary name guard
// against the matched account's name in case a phone was never resolved.
//
// Maintained as data: adding/removing a person is an INSERT/DELETE on the table,
// so it never requires a function redeploy.

import { last10 } from "./quo.ts";

/** A row from `public.quo_do_not_report` (only the fields matching needs). */
export interface DoNotReportRow {
  phone_last10?: string | null;
  name?: string | null;
}

/** Pre-built lookup sets for O(1) exclusion checks. */
export interface DoNotReportList {
  /** Digits-only last-10 phone keys to skip (the reliable match). */
  phones: Set<string>;
  /** Normalized names to skip (secondary guard on a matched SF account name). */
  names: Set<string>;
}

/** Normalize a name for comparison: lowercased, trimmed, whitespace-collapsed. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Build the phone + name lookup sets from the raw do-not-report rows. */
export function buildDoNotReport(rows: DoNotReportRow[]): DoNotReportList {
  const phones = new Set<string>();
  const names = new Set<string>();
  for (const r of rows) {
    const k = last10(r.phone_last10 ?? "");
    if (k) phones.add(k);
    const n = normalizeName(r.name);
    if (n) names.add(n);
  }
  return { phones, names };
}

/**
 * Whether a Quo counterpart phone (any format) is on the do-not-report list.
 * Checked BEFORE any Quo messages/calls are pulled, so a private contact's
 * content never even leaves Quo.
 */
export function isExcludedByPhone(
  list: DoNotReportList,
  phone: string | null | undefined,
): boolean {
  const k = last10(phone ?? "");
  return k !== "" && list.phones.has(k);
}

/**
 * Whether a matched Salesforce account name is on the do-not-report list. A
 * secondary guard for entries added by name without a resolved phone; matched
 * after the SF lookup and before any Task is written.
 */
export function isExcludedByName(
  list: DoNotReportList,
  name: string | null | undefined,
): boolean {
  const n = normalizeName(name);
  return n !== "" && list.names.has(n);
}
