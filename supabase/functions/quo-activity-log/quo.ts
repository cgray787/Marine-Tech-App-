// Pure helpers + OpenPhone (Quo) REST client for the quo-activity-log edge function.
//
// Quo IS the OpenPhone API (Quo = OpenPhone rebrand). Base URL
// https://api.openphone.com/v1 ; auth header is the RAW api key with NO "Bearer"
// prefix (`Authorization: <key>` — confirmed by OpenPhone's authentication docs).
//
// The "pure" helpers (no I/O) are unit-tested in quo_test.ts. The QuoClient at the
// bottom does network I/O and is exercised manually via the function's dryRun path.

// ---------------------------------------------------------------------------
// Domain types (a normalized view of Quo activity, independent of the raw API)
// ---------------------------------------------------------------------------

export type Direction = "incoming" | "outgoing";

export interface ActivityItem {
  kind: "text" | "call";
  /** ISO 8601 timestamp the item occurred (createdAt). */
  at: string;
  /** Direction relative to the OpenPhone (Quo) number. */
  direction: Direction;
  /** The counterpart (client) phone in E.164, as best we can resolve it. */
  counterpart: string;
  /** Text body (texts only). */
  text?: string;
  /** Call duration in seconds (calls only). */
  durationSec?: number;
  /** Call transcript snippet, if available (calls only). */
  transcript?: string;
  /** Call status, e.g. "completed", "no-answer" (calls only). */
  callStatus?: string;
}

// ---------------------------------------------------------------------------
// Phone matching — digits-only last 10
// ---------------------------------------------------------------------------

/**
 * Reduce any phone string to its last 10 digits (US-style match key). Strips all
 * non-digits, then a leading "1" country code, then keeps the final 10. Returns
 * "" when there aren't enough digits to form a key.
 */
export function last10(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
}

/** True when two phone numbers share the same last-10-digit key. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = last10(a);
  const kb = last10(b);
  return ka !== "" && ka === kb;
}

// ---------------------------------------------------------------------------
// Service-thread guard
// ---------------------------------------------------------------------------

// Conservative term lists. The guard only suppresses a day when EVERY text in it
// looks service/parts-related AND NONE of them look sales-related. When unsure
// (no signal either way, or any sales signal), we log it.
const SERVICE_TERMS = [
  "part", "parts", "repair", "warranty", "invoice", "oil", "service", "haul",
];
const SALES_TERMS = [
  "buy", "sell", "offer", "showing", "price", "listing", "interested", "looking",
];

function matchesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  // Word-boundary-ish match so "part" doesn't fire on "apartment".
  return terms.some((t) => new RegExp(`\\b${t}\\b`, "i").test(lower));
}

export interface GuardResult {
  /** True = skip this client's day as service/parts-only. */
  skip: boolean;
  reason?: string;
}

/**
 * Decide whether a day's items are clearly service/parts-only and should be
 * skipped. Calls always count as a sales signal (we can't read intent from a call
 * the way we can from text), so any call keeps the day. Conservative by design:
 * only skips when there is at least one service-term text, every text item is a
 * service-term hit, and no text contains a sales term, and there are no calls.
 */
export function serviceThreadGuard(items: ActivityItem[]): GuardResult {
  if (items.length === 0) return { skip: true, reason: "no items" };

  // A call is a sales-relevant touch we can't classify from text alone — keep.
  if (items.some((i) => i.kind === "call")) return { skip: false };

  const texts = items.filter((i) => i.kind === "text" && (i.text ?? "").trim() !== "");
  if (texts.length === 0) return { skip: false }; // empty/photo-only texts — don't suppress

  let anyService = false;
  for (const t of texts) {
    const body = t.text ?? "";
    if (matchesAny(body, SALES_TERMS)) return { skip: false }; // any sales signal => log
    if (matchesAny(body, SERVICE_TERMS)) anyService = true;
    else return { skip: false }; // a text with no service term => not clearly service-only
  }
  if (anyService) return { skip: true, reason: "service/parts-only thread" };
  return { skip: false };
}

// ---------------------------------------------------------------------------
// Digest builder
// ---------------------------------------------------------------------------

/**
 * Format an ISO timestamp as a "9:14a" / "2:05p" wall-clock time in the given IANA
 * timezone. Pure (uses Intl, deterministic given the same tz).
 */
export function formatTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  let hour = "", minute = "", dayPeriod = "";
  for (const p of parts) {
    if (p.type === "hour") hour = p.value;
    else if (p.type === "minute") minute = p.value;
    else if (p.type === "dayPeriod") dayPeriod = p.value;
  }
  const ap = dayPeriod.toLowerCase().startsWith("p") ? "p" : "a";
  return `${hour}:${minute}${ap}`;
}

/** "4m12s" / "0m45s" / "" for a duration in seconds. */
export function formatDuration(sec: number | undefined): string {
  if (sec === undefined || sec === null || sec < 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${String(s).padStart(2, "0")}s`;
}

/** Short label for the counterpart used in digest lines (first name if we have it). */
function counterpartLabel(name: string | null): string {
  if (!name || !name.trim()) return "Them";
  const trimmed = name.trim();
  const idx = trimmed.indexOf(" ");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

/**
 * Build the chronological daily digest for one client. Lines look like:
 *   9:14a  You → Charlie: hey, that 34 still available?
 *   9:20a  ← Charlie: yep, can show it Saturday
 *   2:05p  Call (outbound, 4m12s): <transcript snippet>
 */
export function buildDigest(
  items: ActivityItem[],
  opts: { name: string | null; timeZone: string },
): string {
  const label = counterpartLabel(opts.name);
  const sorted = [...items].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const lines = sorted.map((i) => {
    const t = formatTime(i.at, opts.timeZone);
    if (i.kind === "text") {
      const body = (i.text ?? "").replace(/\s+/g, " ").trim() || "(no text)";
      return i.direction === "outgoing"
        ? `${t}  You → ${label}: ${body}`
        : `${t}  ← ${label}: ${body}`;
    }
    // call
    const dir = i.direction === "outgoing" ? "outbound" : "inbound";
    const dur = formatDuration(i.durationSec);
    const meta = [dir, dur].filter(Boolean).join(", ");
    const snippet = i.transcript ? `: ${i.transcript.replace(/\s+/g, " ").trim()}` : "";
    return `${t}  Call (${meta})${snippet}`;
  });
  return lines.join("\n");
}

/** "Quo activity — YYYY-MM-DD" — the idempotency marker / SF Task Subject. */
export function idempotencySubject(date: string): string {
  return `Quo activity — ${date}`;
}

/** TaskSubtype is "Call" when the day is call-only, else "Task". */
export function taskSubtype(items: ActivityItem[]): "Call" | "Task" {
  const hasText = items.some((i) => i.kind === "text");
  const hasCall = items.some((i) => i.kind === "call");
  return hasCall && !hasText ? "Call" : "Task";
}

// ---------------------------------------------------------------------------
// Date-window helpers
// ---------------------------------------------------------------------------

/**
 * Given a target calendar date (YYYY-MM-DD) and an IANA timezone, return the
 * UTC ISO instants [createdAfter, createdBefore) bounding that local day.
 * createdAfter = local 00:00:00, createdBefore = next local 00:00:00.
 */
export function dayWindowUtc(
  date: string,
  timeZone: string,
): { createdAfter: string; createdBefore: string } {
  const start = localMidnightToUtc(date, timeZone);
  // next day's local midnight
  const next = new Date(start.getTime() + 36 * 60 * 60 * 1000); // +36h lands safely in next day
  const nextDate = isoDateInTz(next, timeZone);
  const end = localMidnightToUtc(nextDate, timeZone);
  return { createdAfter: start.toISOString(), createdBefore: end.toISOString() };
}

/**
 * The prior calendar day (YYYY-MM-DD) in the given timezone, relative to `now`.
 */
export function priorDayInTz(now: Date, timeZone: string): string {
  const today = isoDateInTz(now, timeZone);
  const start = localMidnightToUtc(today, timeZone);
  const yesterday = new Date(start.getTime() - 12 * 60 * 60 * 1000); // -12h lands in prior day
  return isoDateInTz(yesterday, timeZone);
}

/** Format a Date as YYYY-MM-DD as it reads in the given timezone. */
export function isoDateInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  let y = "", m = "", day = "";
  for (const p of parts) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") day = p.value;
  }
  return `${y}-${m}-${day}`;
}

/**
 * Convert "local midnight on YYYY-MM-DD in timeZone" to the corresponding UTC
 * Date. Works by computing the tz offset at that instant via Intl.
 */
function localMidnightToUtc(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  // Guess: treat the wall-clock midnight as if it were UTC, then correct by the
  // zone's offset at that moment.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetMs = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs);
}

/**
 * The offset (ms) of `timeZone` from UTC at instant `d`: positive east of UTC.
 * e.g. America/Los_Angeles in summer => -7h => -25200000.
 */
function tzOffsetMs(d: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(d);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // Hour can come back as 24 for midnight in some runtimes; normalize.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUtc - d.getTime();
}

// ---------------------------------------------------------------------------
// OpenPhone (Quo) REST client — network I/O
// ---------------------------------------------------------------------------

const QUO_BASE = "https://api.openphone.com/v1";

export interface QuoConversation {
  id: string;
  participants: string[]; // E.164, excludes the OpenPhone number
}

export interface QuoMessage {
  id: string;
  to: string[];
  from: string;
  text: string;
  direction: Direction;
  createdAt: string;
}

export interface QuoCall {
  id: string;
  direction: Direction;
  status: string;
  duration: number;
  createdAt: string;
  participants: string[];
}

export class QuoClient {
  constructor(
    private apiKey: string,
    private phoneNumberId: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async get(path: string, params: Record<string, string | string[]>): Promise<any> {
    const url = new URL(`${QUO_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v);
      }
    }
    const res = await this.fetchImpl(url.toString(), {
      headers: { Authorization: this.apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Quo GET ${path} failed: ${res.status} ${body}`);
    }
    return await res.json();
  }

  /** Walk conversations for this inbox active in the window; returns distinct counterpart phones. */
  async listCounterpartPhones(createdAfter: string, createdBefore: string): Promise<string[]> {
    const seen = new Set<string>();
    let pageToken: string | undefined;
    // Conversations are sorted newest-activity first. We filter by updatedAfter so
    // we capture threads touched in the window even if created earlier.
    do {
      const params: Record<string, string> = {
        phoneNumbers: this.phoneNumberId,
        maxResults: "100",
        updatedAfter: createdAfter,
      };
      if (pageToken) params.pageToken = pageToken;
      const json = await this.get("/conversations", params);
      for (const c of (json.data ?? []) as QuoConversation[]) {
        for (const p of c.participants ?? []) seen.add(p);
      }
      pageToken = json.nextPageToken ?? undefined;
    } while (pageToken);
    return [...seen];
  }

  async listMessages(participant: string, createdAfter: string, createdBefore: string): Promise<QuoMessage[]> {
    return await this.paginate<QuoMessage>("/messages", participant, createdAfter, createdBefore);
  }

  async listCalls(participant: string, createdAfter: string, createdBefore: string): Promise<QuoCall[]> {
    return await this.paginate<QuoCall>("/calls", participant, createdAfter, createdBefore);
  }

  private async paginate<T>(
    path: string,
    participant: string,
    createdAfter: string,
    createdBefore: string,
  ): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    do {
      const params: Record<string, string | string[]> = {
        phoneNumberId: this.phoneNumberId,
        participants: [participant],
        createdAfter,
        createdBefore,
        maxResults: "100",
      };
      if (pageToken) (params as Record<string, string>).pageToken = pageToken;
      const json = await this.get(path, params);
      out.push(...((json.data ?? []) as T[]));
      pageToken = json.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  /** Fetch a call transcript and return a single-string snippet, or undefined. */
  async callTranscriptSnippet(callId: string, maxChars = 280): Promise<string | undefined> {
    try {
      const json = await this.get(`/call-transcripts/${callId}`, {});
      const dialogue = json?.data?.dialogue;
      if (!Array.isArray(dialogue) || dialogue.length === 0) return undefined;
      const text = dialogue
        .map((seg: { content?: string }) => (seg.content ?? "").trim())
        .filter(Boolean)
        .join(" ");
      if (!text) return undefined;
      return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
    } catch {
      // Transcripts only exist for recorded+processed calls; 404 is normal.
      return undefined;
    }
  }
}
