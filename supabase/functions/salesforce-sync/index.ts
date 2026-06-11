// Database-webhook handler — triggered AFTER INSERT on public.customers (JBY org,
// not-yet-linked). Creates or links a Salesforce Person Account and writes the
// id/url/synced_at back to the customer row.
//
// Secrets: this account's Supabase plan blocks setting Edge Function env-secrets,
// so the two sensitive values (Salesforce OAuth refresh token + the shared sync
// secret) are read from Vault via the service-role-only RPC `salesforce_sync_secrets`.
// Non-sensitive Salesforce config stays as env-defaulted constants below.
//
// Auth: shared secret header `x-sync-secret` (compared to the Vault sync secret).
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

// Non-sensitive Salesforce config (overridable via env; PlatformCLI has no secret).
const SF_CLIENT_ID = Deno.env.get("SF_CLIENT_ID") ?? "PlatformCLI";
const SF_CLIENT_SECRET = Deno.env.get("SF_CLIENT_SECRET") ?? "";
const SF_INSTANCE_URL = Deno.env.get("SF_INSTANCE_URL") ?? "https://jeffbrownyachts.my.salesforce.com";
const SF_RECORD_TYPE_ID = Deno.env.get("SF_RECORD_TYPE_ID") ?? "0123h000000ANsqAAG";
const SF_OWNER_ID = Deno.env.get("SF_OWNER_ID") ?? "005TS000008FD5BYAW";
const JBY_ORG_ID = Deno.env.get("JBY_ORG_ID") ?? "e22d5492-3ec1-4d5c-9118-b2eba8880586";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_VERSION = "v60.0";

interface SyncSecrets {
  refresh_token: string;
  sync_secret: string;
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
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch the two runtime secrets from Vault (service-role-only RPC).
  const { data: secrets, error: secretsError } = await supabase.rpc("salesforce_sync_secrets");
  if (secretsError || !secrets) {
    console.error("salesforce-sync: failed to load secrets:", secretsError?.message);
    return new Response("misconfigured", { status: 500 });
  }
  const { refresh_token: refreshToken, sync_secret: syncSecret } = secrets as SyncSecrets;

  // Auth: shared secret
  if (req.headers.get("x-sync-secret") !== syncSecret) {
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

  if (!refreshToken || refreshToken === "PENDING") {
    console.error("salesforce-sync: refresh token not seeded yet");
    return new Response(JSON.stringify({ ok: false, error: "refresh token not seeded" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { accessToken, instanceUrl } = await getAccessToken(refreshToken);
    let accountId = await findExisting(instanceUrl, accessToken, record.phone, record.email);
    if (!accountId) {
      accountId = await createPersonAccount(instanceUrl, accessToken, record);
    }

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
