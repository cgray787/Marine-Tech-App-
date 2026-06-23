// quo-activity-log — daily Quo (OpenPhone) → Salesforce activity logger.
//
// For a given calendar day (default: prior day in America/Los_Angeles), pull the
// JBY inbox's texts + calls, group them per counterpart phone, match each to a
// single existing SF Person Account, apply a service-thread guard, build one
// chronological digest per client, and write an idempotent SF Task
// ("Quo activity — YYYY-MM-DD") on the account's Person Contact.
//
// Why an edge function (not a cloud routine): routines have no Salesforce egress;
// this runs server-side with the SF refresh token from Vault. See
// docs/superpowers/specs/2026-06-23-quo-salesforce-activity-log-design.md.
//
// Secrets (Vault, via the service-role-only RPC `quo_activity_secrets`):
//   sf_refresh_token, sf_sync_secret (shared with salesforce-sync), quo_api_key.
// Auth: shared secret header `x-sync-secret` vs the Vault sync secret.
// Deployed with verify_jwt=false.
//
// Body (all optional): { date?: 'YYYY-MM-DD', dryRun?: boolean, onlyPhones?: string[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAccountByPhoneQuery,
  buildExistingTaskQuery,
  buildTaskBody,
  pickUniqueAccount,
  type PersonAccountMatch,
} from "./salesforce.ts";
import {
  type ActivityItem,
  buildDigest,
  dayWindowUtc,
  idempotencySubject,
  last10,
  priorDayInTz,
  QuoClient,
  serviceThreadGuard,
  taskSubtype,
} from "./quo.ts";
import {
  anyRedacted,
  type Brand,
  classifyBrand,
  grayYachtsSummary,
  redactItems,
} from "./brand-filter.ts";

// Non-sensitive config (overridable via env). Mirrors salesforce-sync.
const SF_CLIENT_ID = Deno.env.get("SF_CLIENT_ID") ?? "PlatformCLI";
const SF_CLIENT_SECRET = Deno.env.get("SF_CLIENT_SECRET") ?? "";
const SF_INSTANCE_URL = Deno.env.get("SF_INSTANCE_URL") ?? "https://jeffbrownyachts.my.salesforce.com";
const SF_OWNER_ID = Deno.env.get("SF_OWNER_ID") ?? "005TS000008FD5BYAW"; // Connor
const API_VERSION = "v60.0";

// Connor's Quo (OpenPhone) inbox.
const QUO_PHONE = Deno.env.get("QUO_PHONE") ?? "+14256718474";
const QUO_PHONE_NUMBER_ID = Deno.env.get("QUO_PHONE_NUMBER_ID") ?? "PNqp3WHVBR";

const TIMEZONE = Deno.env.get("QUO_TIMEZONE") ?? "America/Los_Angeles";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Secrets {
  sf_refresh_token: string;
  sf_sync_secret: string;
  quo_api_key: string;
}

interface RequestBody {
  date?: string;
  dryRun?: boolean;
  onlyPhones?: string[];
}

interface ClientResult {
  phone: string;
  itemCount: number;
  matchedAccount?: { id: string; name: string | null };
  skipped?: string;
  action?: "created" | "updated";
  digest?: string; // populated on dryRun (or on matched write)
  // JBY-only filter outcome (see brand-filter.ts): the conversation's brand and
  // how the filter treated it before writing to Salesforce.
  brand?: Brand;
  filter?: "full" | "redacted" | "summary-only";
}

async function getAccessToken(refreshToken: string): Promise<{ accessToken: string; instanceUrl: string }> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: SF_CLIENT_ID,
    refresh_token: refreshToken,
  });
  if (SF_CLIENT_SECRET) params.set("client_secret", SF_CLIENT_SECRET);

  const res = await fetch(`${SF_INSTANCE_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`SF token fetch failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, instanceUrl: json.instance_url ?? SF_INSTANCE_URL };
}

async function sfQuery(instanceUrl: string, accessToken: string, soql: string): Promise<any> {
  const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`SF query failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function findAccountByPhone(
  instanceUrl: string,
  accessToken: string,
  last10Key: string,
): Promise<{ account?: PersonAccountMatch; skip?: string }> {
  const soql = buildAccountByPhoneQuery(last10Key);
  if (!soql) return { skip: "phone could not be normalized to 10 digits" };
  const json = await sfQuery(instanceUrl, accessToken, soql);
  const candidates = (json.records ?? []) as PersonAccountMatch[];
  return pickUniqueAccount(candidates, last10Key);
}

async function findExistingTaskId(
  instanceUrl: string,
  accessToken: string,
  whoId: string,
  subject: string,
): Promise<string | null> {
  const json = await sfQuery(instanceUrl, accessToken, buildExistingTaskQuery(whoId, subject));
  return json.records?.[0]?.Id ?? null;
}

async function writeTask(
  instanceUrl: string,
  accessToken: string,
  existingId: string | null,
  body: Record<string, unknown>,
): Promise<"created" | "updated"> {
  if (existingId) {
    // PATCH only the mutable Description (Subject/Who are the idempotency anchor).
    const res = await fetch(
      `${instanceUrl}/services/data/${API_VERSION}/sobjects/Task/${existingId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ Description: body.Description, Status: body.Status }),
      },
    );
    if (!res.ok) throw new Error(`SF Task PATCH failed: ${res.status} ${await res.text()}`);
    return "updated";
  }
  const res = await fetch(`${instanceUrl}/services/data/${API_VERSION}/sobjects/Task`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SF Task POST failed: ${res.status} ${await res.text()}`);
  return "created";
}

// Normalize a raw Quo message/call into an ActivityItem.
function messageToItem(m: { from: string; to: string[]; text: string; direction: string; createdAt: string }, counterpart: string): ActivityItem {
  return {
    kind: "text",
    at: m.createdAt,
    direction: m.direction === "outgoing" ? "outgoing" : "incoming",
    counterpart,
    text: m.text ?? "",
  };
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: secretsData, error: secretsError } = await supabase.rpc("quo_activity_secrets");
  if (secretsError || !secretsData) {
    console.error("quo-activity-log: failed to load secrets:", secretsError?.message);
    return new Response("misconfigured", { status: 500 });
  }
  const secrets = secretsData as Secrets;

  // Auth: shared secret header.
  if (req.headers.get("x-sync-secret") !== secrets.sf_sync_secret) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: RequestBody = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as RequestBody;
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  if (!secrets.sf_refresh_token || secrets.sf_refresh_token === "PENDING") {
    return new Response(JSON.stringify({ ok: false, error: "SF refresh token not seeded" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!secrets.quo_api_key || secrets.quo_api_key === "PENDING") {
    return new Response(JSON.stringify({ ok: false, error: "quo_api_key not seeded in Vault" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dryRun = body.dryRun === true;
  const date = body.date ?? priorDayInTz(new Date(), TIMEZONE);
  const { createdAfter, createdBefore } = dayWindowUtc(date, TIMEZONE);
  const subject = idempotencySubject(date);

  const onlyKeys = (body.onlyPhones ?? []).map(last10).filter(Boolean);

  const quo = new QuoClient(secrets.quo_api_key, QUO_PHONE_NUMBER_ID);
  const results: ClientResult[] = [];

  try {
    // 1. Discover counterpart phones active in the window.
    let phones = await quo.listCounterpartPhones(createdAfter, createdBefore);
    // Never log the inbox itself; drop blanks.
    const inboxKey = last10(QUO_PHONE);
    phones = phones.filter((p) => last10(p) && last10(p) !== inboxKey);
    if (onlyKeys.length > 0) {
      phones = phones.filter((p) => onlyKeys.includes(last10(p)));
    }
    // De-dup by last-10 key (a counterpart can appear in multiple formats).
    const byKey = new Map<string, string>();
    for (const p of phones) {
      const k = last10(p);
      if (!byKey.has(k)) byKey.set(k, p);
    }

    // SF auth once.
    const { accessToken, instanceUrl } = await getAccessToken(secrets.sf_refresh_token);

    for (const [key, phone] of byKey) {
      const result: ClientResult = { phone, itemCount: 0 };

      // 2. Pull this client's texts + calls for the window.
      const [messages, calls] = await Promise.all([
        quo.listMessages(phone, createdAfter, createdBefore),
        quo.listCalls(phone, createdAfter, createdBefore),
      ]);

      const items: ActivityItem[] = [];
      for (const m of messages) items.push(messageToItem(m, phone));
      for (const c of calls) {
        const transcript = c.duration > 0 ? await quo.callTranscriptSnippet(c.id) : undefined;
        items.push({
          kind: "call",
          at: c.createdAt,
          direction: c.direction === "outgoing" ? "outgoing" : "incoming",
          counterpart: phone,
          durationSec: c.duration,
          transcript,
          callStatus: c.status,
        });
      }
      result.itemCount = items.length;

      if (items.length === 0) {
        result.skipped = "no activity in window";
        results.push(result);
        continue;
      }

      // 3. Match to exactly one SF Person Account.
      const match = await findAccountByPhone(instanceUrl, accessToken, key);
      if (!match.account) {
        result.skipped = match.skip ?? "no match";
        results.push(result);
        continue;
      }
      result.matchedAccount = { id: match.account.Id, name: match.account.Name };

      // 4. Service-thread guard.
      const guard = serviceThreadGuard(items);
      if (guard.skip) {
        result.skipped = guard.reason ?? "service-thread guard";
        results.push(result);
        continue;
      }

      // 5. Build digest, then apply the Jeff Brown Yachts-only filter. Salesforce
      //    is JBY's CRM — Gray Yachts info never goes in. A Gray Yachts thread is
      //    reduced to a contentless counts summary; any stray Gray Yachts mention
      //    in a JBY/unknown thread is redacted out of the digest.
      const brand = classifyBrand(items);
      result.brand = brand;
      let digest: string;
      if (brand === "gray_yachts") {
        digest = grayYachtsSummary(items);
        result.filter = "summary-only";
      } else {
        const redacted = redactItems(items);
        digest = buildDigest(redacted, { name: match.account.Name, timeZone: TIMEZONE });
        result.filter = anyRedacted(items, redacted) ? "redacted" : "full";
      }
      result.digest = digest;

      // 6. Idempotent Task write (skipped on dryRun).
      if (dryRun) {
        results.push(result);
        continue;
      }

      const whoId = match.account.PersonContactId!;
      const existingId = await findExistingTaskId(instanceUrl, accessToken, whoId, subject);
      const taskBody = buildTaskBody({
        whoId,
        subject,
        description: digest,
        activityDate: date,
        ownerId: SF_OWNER_ID,
        taskSubtype: taskSubtype(items),
      });
      result.action = await writeTask(instanceUrl, accessToken, existingId, taskBody);
      results.push(result);
    }

    const summary = {
      ok: true,
      date,
      dryRun,
      timezone: TIMEZONE,
      counts: {
        clients: results.length,
        matched: results.filter((r) => r.matchedAccount).length,
        skipped: results.filter((r) => r.skipped).length,
        created: results.filter((r) => r.action === "created").length,
        updated: results.filter((r) => r.action === "updated").length,
        grayYachtsSummarized: results.filter((r) => r.filter === "summary-only").length,
        redacted: results.filter((r) => r.filter === "redacted").length,
      },
      clients: results,
    };
    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("quo-activity-log error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ ok: false, error: String(err), date, dryRun, clients: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
