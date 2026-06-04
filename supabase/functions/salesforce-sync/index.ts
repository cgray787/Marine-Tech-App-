// Database-webhook handler — triggered AFTER INSERT on public.customers (JBY org,
// not-yet-linked). Creates or links a Salesforce Person Account and writes the
// id/url/synced_at back to the customer row. Auth: shared secret header.
//
// Payload (Supabase webhook shape):
//   { "type":"INSERT", "table":"customers", "schema":"public", "record": { ...row... } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildDedupQuery,
  buildPersonAccountBody,
  buildSalesforceUrl,
  type CustomerRecord,
} from "./salesforce.ts";

const SF_CLIENT_ID = Deno.env.get("SF_CLIENT_ID")!;
const SF_CLIENT_SECRET = Deno.env.get("SF_CLIENT_SECRET") ?? "";
const SF_REFRESH_TOKEN = Deno.env.get("SF_REFRESH_TOKEN")!;
const SF_INSTANCE_URL = Deno.env.get("SF_INSTANCE_URL")!;
const SF_RECORD_TYPE_ID = Deno.env.get("SF_RECORD_TYPE_ID")!;
const SF_OWNER_ID = Deno.env.get("SF_OWNER_ID")!;
const SF_SYNC_SECRET = Deno.env.get("SF_SYNC_SECRET")!;
const JBY_ORG_ID = Deno.env.get("JBY_ORG_ID") ?? "e22d5492-3ec1-4d5c-9118-b2eba8880586";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_VERSION = "v60.0";

async function getAccessToken(): Promise<{ accessToken: string; instanceUrl: string }> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: SF_CLIENT_ID,
    refresh_token: SF_REFRESH_TOKEN,
  });
  if (SF_CLIENT_SECRET) params.set("client_secret", SF_CLIENT_SECRET);

  const res = await fetch(`${SF_INSTANCE_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`token fetch failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, instanceUrl: json.instance_url ?? SF_INSTANCE_URL };
}

async function findExisting(
  instanceUrl: string,
  accessToken: string,
  phone: string | null,
  email: string | null,
): Promise<string | null> {
  const soql = buildDedupQuery(phone, email);
  if (!soql) return null;
  const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`dedup query failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.records?.[0]?.Id ?? null;
}

async function createPersonAccount(
  instanceUrl: string,
  accessToken: string,
  record: CustomerRecord,
): Promise<string> {
  const body = buildPersonAccountBody(record, {
    recordTypeId: SF_RECORD_TYPE_ID,
    ownerId: SF_OWNER_ID,
  });
  const res = await fetch(`${instanceUrl}/services/data/${API_VERSION}/sobjects/Account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create account failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.id as string;
}

Deno.serve(async (req) => {
  // Auth: shared secret
  if (req.headers.get("x-sync-secret") !== SF_SYNC_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let record: CustomerRecord;
  try {
    const payload = await req.json();
    record = payload.record as CustomerRecord;
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  // Defensive gate (the trigger already filters these).
  if (!record?.id || record.org_id !== JBY_ORG_ID || record.salesforce_account_id) {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { accessToken, instanceUrl } = await getAccessToken();
    let accountId = await findExisting(instanceUrl, accessToken, record.phone, record.email);
    if (!accountId) {
      accountId = await createPersonAccount(instanceUrl, accessToken, record);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase
      .from("customers")
      .update({
        salesforce_account_id: accountId,
        salesforce_url: buildSalesforceUrl(instanceUrl, accountId),
        salesforce_synced_at: new Date().toISOString(),
      })
      .eq("id", record.id);
    if (error) throw new Error(`writeback failed: ${error.message}`);

    return new Response(JSON.stringify({ ok: true, accountId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Log and return 200 so pg_net does not retry-storm; the null
    // salesforce_account_id marks this row for a later retry/backfill.
    console.error("salesforce-sync error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
