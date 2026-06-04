# Auto-link New Clients to Salesforce — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically create (or link to an existing) Salesforce Person Account whenever a new JBY client is added in the Marine Tech app, and record the SF id + URL on the `customers` row.

**Architecture:** Postgres `AFTER INSERT` trigger on `public.customers` → `pg_net` async POST → Supabase Edge Function `salesforce-sync` → Salesforce REST API (refresh-token OAuth) → write back `salesforce_account_id` / `salesforce_url` / `salesforce_synced_at`. The DB-layer trigger covers mobile, web, and offline-synced inserts uniformly and never blocks the client insert.

**Tech Stack:** Supabase (Postgres, pg_net, Vault, Edge Functions/Deno), Salesforce REST API v60.0, Salesforce CLI (`sf`, org alias `jby`) for one-time secret seeding.

**Spec:** `docs/superpowers/specs/2026-06-04-salesforce-client-autolink-design.md`

**Known constants:**
- Supabase project ref: `ikfcnqdrlvhvlyhiuphs`
- Edge Function URL: `https://ikfcnqdrlvhvlyhiuphs.supabase.co/functions/v1/salesforce-sync`
- JBY org id (`public.organizations`): `e22d5492-3ec1-4d5c-9118-b2eba8880586`
- SF Person/Family RecordTypeId: `0123h000000ANsqAAG`
- SF Owner (Connor) Id: `005TS000008FD5BYAW`
- SF API version: `v60.0`

**Working branch:** commit directly to `main` (matches the repo's established workflow). Push after each task.

---

## File Structure

- `supabase/migrations/020_customers_salesforce_synced_at.sql` — adds `salesforce_synced_at`.
- `supabase/migrations/021_customers_salesforce_sync_trigger.sql` — enables `pg_net`, creates the trigger function + trigger (reads shared secret from Vault).
- `supabase/functions/salesforce-sync/salesforce.ts` — pure, unit-tested helpers (name split, SOQL build, body build, URL build).
- `supabase/functions/salesforce-sync/salesforce_test.ts` — Deno tests for the helpers.
- `supabase/functions/salesforce-sync/index.ts` — HTTP handler / orchestration (I/O only).
- `app/dashboard/customers/customer-list.tsx` — set `org_id`/`location_id` on web Add-Customer insert.

---

## Task 1: Migration — `salesforce_synced_at` column

**Files:**
- Create: `supabase/migrations/020_customers_salesforce_synced_at.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 020_customers_salesforce_synced_at.sql
-- Observability for the Salesforce auto-link: records when a customer was last
-- pushed to Salesforce. A null salesforce_account_id still means "not synced".

alter table public.customers
  add column if not exists salesforce_synced_at timestamptz;

comment on column public.customers.salesforce_synced_at is
  'When this customer was last synced to Salesforce by the salesforce-sync edge function';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with `project_id="ikfcnqdrlvhvlyhiuphs"`, `name="customers_salesforce_synced_at"`, and the SQL body above.
Expected: `{"success":true}`.

- [ ] **Step 3: Verify the column exists**

Use `mcp__supabase__execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='customers' and column_name='salesforce_synced_at';
```
Expected: one row, `timestamp with time zone`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/020_customers_salesforce_synced_at.sql
git commit -m "feat(db): add customers.salesforce_synced_at for SF sync observability"
git push origin main
```

---

## Task 2: Pure Salesforce helpers (TDD)

**Files:**
- Create: `supabase/functions/salesforce-sync/salesforce.ts`
- Test: `supabase/functions/salesforce-sync/salesforce_test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/salesforce-sync/salesforce_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  splitName,
  buildDedupQuery,
  buildPersonAccountBody,
  buildSalesforceUrl,
} from "./salesforce.ts";

Deno.test("splitName: first + last", () => {
  assertEquals(splitName("Ron Wood"), { firstName: "Ron", lastName: "Wood" });
});

Deno.test("splitName: three parts -> last is remainder", () => {
  assertEquals(splitName("Mary Jane Watson"), { firstName: "Mary", lastName: "Jane Watson" });
});

Deno.test("splitName: single word -> lastName only", () => {
  assertEquals(splitName("Cher"), { lastName: "Cher" });
});

Deno.test("splitName: empty -> Unknown", () => {
  assertEquals(splitName("   "), { lastName: "Unknown" });
});

Deno.test("buildDedupQuery: phone + email", () => {
  assertEquals(
    buildDedupQuery("+15551234567", "a@b.com"),
    "SELECT Id FROM Account WHERE IsPersonAccount = true AND (Phone = '+15551234567' OR PersonEmail = 'a@b.com') LIMIT 1",
  );
});

Deno.test("buildDedupQuery: email only", () => {
  assertEquals(
    buildDedupQuery(null, "a@b.com"),
    "SELECT Id FROM Account WHERE IsPersonAccount = true AND (PersonEmail = 'a@b.com') LIMIT 1",
  );
});

Deno.test("buildDedupQuery: nothing to match -> null", () => {
  assertEquals(buildDedupQuery(null, null), null);
  assertEquals(buildDedupQuery("  ", ""), null);
});

Deno.test("buildDedupQuery: escapes single quotes", () => {
  assertEquals(
    buildDedupQuery(null, "o'neil@b.com"),
    "SELECT Id FROM Account WHERE IsPersonAccount = true AND (PersonEmail = 'o\\'neil@b.com') LIMIT 1",
  );
});

Deno.test("buildPersonAccountBody: full record", () => {
  const body = buildPersonAccountBody(
    { id: "x", name: "Ron Wood", email: "r@w.com", phone: "+1555", address: "1 Dock Rd", org_id: "o", salesforce_account_id: null },
    { recordTypeId: "RT", ownerId: "OW" },
  );
  assertEquals(body, {
    RecordTypeId: "RT",
    LastName: "Wood",
    OwnerId: "OW",
    Type: "Customer",
    PersonLeadSource: "Marine Tech App",
    FirstName: "Ron",
    Phone: "+1555",
    PersonEmail: "r@w.com",
    PersonMailingStreet: "1 Dock Rd",
  });
});

Deno.test("buildPersonAccountBody: omits empty optional fields", () => {
  const body = buildPersonAccountBody(
    { id: "x", name: "Cher", email: null, phone: "  ", address: "", org_id: "o", salesforce_account_id: null },
    { recordTypeId: "RT", ownerId: "OW" },
  );
  assertEquals(body, {
    RecordTypeId: "RT",
    LastName: "Cher",
    OwnerId: "OW",
    Type: "Customer",
    PersonLeadSource: "Marine Tech App",
  });
});

Deno.test("buildSalesforceUrl: strips trailing slash", () => {
  assertEquals(
    buildSalesforceUrl("https://x.my.salesforce.com/", "001ABC"),
    "https://x.my.salesforce.com/lightning/r/Account/001ABC/view",
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && deno test supabase/functions/salesforce-sync/salesforce_test.ts`
Expected: FAIL — `Module not found "./salesforce.ts"`.

- [ ] **Step 3: Write the helper module**

```ts
// supabase/functions/salesforce-sync/salesforce.ts
// Pure helpers for the salesforce-sync edge function. No I/O — unit-tested.

export interface CustomerRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  org_id: string | null;
  salesforce_account_id: string | null;
}

export interface SalesforceConfig {
  recordTypeId: string;
  ownerId: string;
}

export function splitName(fullName: string): { firstName?: string; lastName: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { lastName: "Unknown" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { lastName: trimmed };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() };
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function buildDedupQuery(phone: string | null, email: string | null): string | null {
  const clauses: string[] = [];
  if (phone && phone.trim()) clauses.push(`Phone = '${escapeSoql(phone.trim())}'`);
  if (email && email.trim()) clauses.push(`PersonEmail = '${escapeSoql(email.trim())}'`);
  if (clauses.length === 0) return null;
  return `SELECT Id FROM Account WHERE IsPersonAccount = true AND (${clauses.join(" OR ")}) LIMIT 1`;
}

export function buildPersonAccountBody(
  c: CustomerRecord,
  cfg: SalesforceConfig,
): Record<string, unknown> {
  const { firstName, lastName } = splitName(c.name);
  const body: Record<string, unknown> = {
    RecordTypeId: cfg.recordTypeId,
    LastName: lastName,
    OwnerId: cfg.ownerId,
    Type: "Customer",
    PersonLeadSource: "Marine Tech App",
  };
  if (firstName) body.FirstName = firstName;
  if (c.phone && c.phone.trim()) body.Phone = c.phone.trim();
  if (c.email && c.email.trim()) body.PersonEmail = c.email.trim();
  if (c.address && c.address.trim()) body.PersonMailingStreet = c.address.trim();
  return body;
}

export function buildSalesforceUrl(instanceUrl: string, accountId: string): string {
  return `${instanceUrl.replace(/\/$/, "")}/lightning/r/Account/${accountId}/view`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && deno test supabase/functions/salesforce-sync/salesforce_test.ts`
Expected: PASS — all tests ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/salesforce-sync/salesforce.ts supabase/functions/salesforce-sync/salesforce_test.ts
git commit -m "feat(sf-sync): pure helpers for name split, dedup SOQL, account body, url"
git push origin main
```

---

## Task 3: Edge Function orchestration (`index.ts`)

**Files:**
- Create: `supabase/functions/salesforce-sync/index.ts`

- [ ] **Step 1: Write the handler**

```ts
// supabase/functions/salesforce-sync/index.ts
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
```

- [ ] **Step 2: Type-check the function**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && deno check supabase/functions/salesforce-sync/index.ts`
Expected: no errors (helpers resolve; types align).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/salesforce-sync/index.ts
git commit -m "feat(sf-sync): edge function orchestration (token, dedup, create, writeback)"
git push origin main
```

---

## Task 4: Seed Salesforce secrets + deploy the function

> This task seeds secrets from the local `sf` CLI and deploys. No secret values
> are committed to git.

**Files:** none committed (operational).

- [ ] **Step 1: Confirm the `sf` CLI is authed to JBY**

Run: `sf org display --target-org jby`
Expected: shows Connected Status `Connected` and an instance URL like `https://jeffbrownyachts.my.salesforce.com`.
If it errors with `No org with alias 'jby'`, run: `sf org login web --instance-url https://jeffbrownyachts.my.salesforce.com --alias jby --set-default` (Connor completes the browser login), then retry.

- [ ] **Step 2: Extract the OAuth credentials**

Run: `sf org display --target-org jby --verbose --json`
From the JSON, read `result.sfdxAuthUrl`, which has the form
`force://<clientId>:<clientSecret>:<refreshToken>@<instanceHost>`.
Parse it into: `SF_CLIENT_ID`, `SF_CLIENT_SECRET` (may be empty → the segment between the two colons is blank), `SF_REFRESH_TOKEN`, and `SF_INSTANCE_URL` = `https://<instanceHost>`.
(Also read `result.instanceUrl` as a cross-check for `SF_INSTANCE_URL`.)

- [ ] **Step 3: Generate the shared secret**

Run: `openssl rand -hex 32`
Save the output as the value for `SF_SYNC_SECRET` (used by both the edge function and the DB trigger).

- [ ] **Step 4: Set the Edge Function secrets**

Run (substituting the parsed values; `SF_CLIENT_SECRET` may be an empty string):
```bash
cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app"
npx supabase secrets set --project-ref ikfcnqdrlvhvlyhiuphs \
  SF_CLIENT_ID="<clientId>" \
  SF_CLIENT_SECRET="<clientSecret>" \
  SF_REFRESH_TOKEN="<refreshToken>" \
  SF_INSTANCE_URL="https://jeffbrownyachts.my.salesforce.com" \
  SF_RECORD_TYPE_ID="0123h000000ANsqAAG" \
  SF_OWNER_ID="005TS000008FD5BYAW" \
  SF_SYNC_SECRET="<openssl-output>" \
  JBY_ORG_ID="e22d5492-3ec1-4d5c-9118-b2eba8880586"
```
Expected: `Finished supabase secrets set.`
If the CLI is not logged in (`Access token not provided`), set `SUPABASE_ACCESS_TOKEN` first (Connor's Supabase PAT is on the Notion "API keys" page — fetch id `31e94413-d4ac-80a0-ac0c-c991763a22e0`), then re-run.

- [ ] **Step 5: Store the shared secret in Supabase Vault (for the trigger)**

Use `mcp__supabase__execute_sql` with `project_id="ikfcnqdrlvhvlyhiuphs"` (substitute the same `<openssl-output>`):
```sql
select vault.create_secret('<openssl-output>', 'sf_sync_secret',
  'Shared secret the customers->salesforce trigger sends to the salesforce-sync edge function');
```
Expected: returns a uuid (the secret id).
If a secret named `sf_sync_secret` already exists, instead run:
```sql
select vault.update_secret(
  (select id from vault.secrets where name='sf_sync_secret'),
  '<openssl-output>');
```

- [ ] **Step 6: Deploy the edge function (no JWT verification)**

Use `mcp__supabase__deploy_edge_function` with `project_id="ikfcnqdrlvhvlyhiuphs"`, `name="salesforce-sync"`, `verify_jwt=false`, and both files (`index.ts` as entrypoint + `salesforce.ts`).
Expected: deploy success; the function appears in `mcp__supabase__list_edge_functions`.

- [ ] **Step 7: Smoke-test the token + auth path**

Run (substitute `<openssl-output>`):
```bash
curl -s -X POST "https://ikfcnqdrlvhvlyhiuphs.supabase.co/functions/v1/salesforce-sync" \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: <openssl-output>" \
  -d '{"type":"INSERT","table":"customers","schema":"public","record":{"id":"00000000-0000-0000-0000-000000000000","name":"_","email":null,"phone":null,"address":null,"org_id":"not-jby","salesforce_account_id":null}}'
```
Expected: `{"skipped":true}` (proves the secret is accepted and the org gate works — no SF call made).
Then test a bad secret:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://ikfcnqdrlvhvlyhiuphs.supabase.co/functions/v1/salesforce-sync" \
  -H "Content-Type: application/json" -H "x-sync-secret: wrong" -d '{}'
```
Expected: `401`.

---

## Task 5: Trigger migration (`pg_net` → edge function)

**Files:**
- Create: `supabase/migrations/021_customers_salesforce_sync_trigger.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 021_customers_salesforce_sync_trigger.sql
-- On INSERT of a JBY, not-yet-linked customer, fire an async pg_net POST to the
-- salesforce-sync edge function. Async => never blocks/fails the client insert.
-- The shared secret is read from Vault (not stored in this migration).

create extension if not exists pg_net;

create or replace function public.sync_customer_to_salesforce()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  sync_secret text;
begin
  -- Gate: only Jeff Brown Yachts org, only rows not already linked.
  if new.org_id is distinct from 'e22d5492-3ec1-4d5c-9118-b2eba8880586'::uuid then
    return new;
  end if;
  if new.salesforce_account_id is not null then
    return new;
  end if;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'sf_sync_secret'
  limit 1;

  perform net.http_post(
    url := 'https://ikfcnqdrlvhvlyhiuphs.supabase.co/functions/v1/salesforce-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', coalesce(sync_secret, '')
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', row_to_json(new)
    )
  );

  return new;
end;
$$;

drop trigger if exists customer_salesforce_sync on public.customers;
create trigger customer_salesforce_sync
  after insert on public.customers
  for each row
  execute function public.sync_customer_to_salesforce();
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with `project_id="ikfcnqdrlvhvlyhiuphs"`, `name="customers_salesforce_sync_trigger"`, and the SQL above.
Expected: `{"success":true}`.

- [ ] **Step 3: Verify the trigger exists**

Use `mcp__supabase__execute_sql`:
```sql
select tgname from pg_trigger where tgrelid = 'public.customers'::regclass and not tgisinternal;
```
Expected: includes `customer_salesforce_sync`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/021_customers_salesforce_sync_trigger.sql
git commit -m "feat(db): trigger to async-sync new JBY customers to Salesforce via pg_net"
git push origin main
```

---

## Task 6: Web — set `org_id`/`location_id` on Add-Customer

> Without `org_id`, web-created clients fall outside the JBY-org gate. Mobile
> (`mobile/app/client/new.tsx`) already sets these from the profile; mirror it.

**Files:**
- Modify: `app/dashboard/customers/customer-list.tsx`

- [ ] **Step 1: Confirm the current insert lacks org fields**

Read `app/dashboard/customers/customer-list.tsx` around `handleAddCustomer`. Confirm the `supabase.from("customers").insert({...})` includes only `name/email/phone/address/notes`.

- [ ] **Step 2: Fetch the logged-in profile's org/location and include them**

Replace the customer insert block in `handleAddCustomer` with:

```tsx
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let orgId: string | null = null;
    let locationId: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, org_id, location_id")
        .eq("auth_id", user.id)
        .single();
      orgId = profile?.org_id ?? null;
      locationId = profile?.location_id ?? null;
    }

    const { error: insertError } = await supabase.from("customers").insert({
      name: customerName,
      email: customerEmail || null,
      phone: customerPhone || null,
      address: customerAddress || null,
      notes: customerNotes || null,
      org_id: orgId,
      location_id: locationId,
    });
```

- [ ] **Step 3: Type-check the web app**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && npx tsc --noEmit`
Expected: `EXIT=0` / no errors.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/customers/customer-list.tsx
git commit -m "fix(web): tag web-created customers with org_id/location_id from profile"
git push origin main
```

---

## Task 7: End-to-end verification

> Live test against Salesforce. Use a clearly-fake test client and clean up
> afterward (both the app row and any SF record created).

- [ ] **Step 1: Insert a JBY test client that will CREATE a new SF account**

Use `mcp__supabase__execute_sql`:
```sql
insert into public.customers (name, email, phone, address, org_id, created_by)
values ('ZZ SF Test One', 'zz-sftest-one@example.com', '+15550000001', '1 Test Dock',
        'e22d5492-3ec1-4d5c-9118-b2eba8880586',
        (select id from public.profiles where org_id='e22d5492-3ec1-4d5c-9118-b2eba8880586' limit 1))
returning id;
```
Note the returned `id`.

- [ ] **Step 2: Wait ~5s, then confirm writeback**

Use `mcp__supabase__execute_sql` (substitute the id):
```sql
select salesforce_account_id, salesforce_url, salesforce_synced_at
from public.customers where id = '<id>';
```
Expected: all three populated; `salesforce_url` like `https://jeffbrownyachts.my.salesforce.com/lightning/r/Account/001.../view`.
If still null, check function logs via `mcp__supabase__get_logs` (service `edge-function`) and fix before continuing.

- [ ] **Step 3: Confirm the record exists in Salesforce**

Run (substitute the SF id from Step 2):
```bash
sf data get record --target-org jby --sobject Account --record-id <salesforce_account_id> \
  --json | python3 -c "import json,sys;r=json.load(sys.stdin)['result'];print(r['FirstName'],r['LastName'],r.get('PersonEmail'),r.get('Type'),r.get('PersonLeadSource'))"
```
Expected: `ZZ SF Test One zz-sftest-one@example.com Customer Marine Tech App`.

- [ ] **Step 4: Test the DEDUP path (link, not duplicate)**

Insert a second app client whose email matches the one just created:
```sql
insert into public.customers (name, email, phone, address, org_id, created_by)
values ('ZZ SF Test One Dupe', 'zz-sftest-one@example.com', null, null,
        'e22d5492-3ec1-4d5c-9118-b2eba8880586',
        (select id from public.profiles where org_id='e22d5492-3ec1-4d5c-9118-b2eba8880586' limit 1))
returning id;
```
Wait ~5s, then:
```sql
select id, salesforce_account_id from public.customers
where email='zz-sftest-one@example.com' order by created_at;
```
Expected: BOTH rows have the **same** `salesforce_account_id` (the dupe linked to the existing SF account; no new account created).

- [ ] **Step 5: Test the org gate (non-JBY does NOT sync)**

```sql
insert into public.customers (name, email, org_id)
values ('ZZ Non JBY', 'zz-nonjby@example.com', null) returning id;
```
Wait ~5s, then check it stayed null:
```sql
select salesforce_account_id, salesforce_synced_at from public.customers
where email='zz-nonjby@example.com';
```
Expected: both null (trigger gate skipped it).

- [ ] **Step 6: Clean up test data**

Delete the SF account(s) created (substitute the id from Step 2):
```bash
sf data delete record --target-org jby --sobject Account --record-id <salesforce_account_id>
```
Then remove the app test rows:
```sql
delete from public.customers where email in ('zz-sftest-one@example.com','zz-nonjby@example.com');
```
Expected: deletions succeed; no test data remains in either system.

- [ ] **Step 7: Final confirmation**

Confirm normal real-world flow: in the mobile app or web dashboard, add a real client and confirm within a few seconds the "View in Salesforce" link is populated on the client. (Optional manual check by Connor.)

---

## Self-Review notes

- **Spec coverage:** trigger (Task 5), edge function create+dedup+writeback (Tasks 2–3), auth via CLI refresh token (Task 4), JBY-org gate (Tasks 5 + index defensive gate), `salesforce_synced_at` (Task 1), web org_id fix (Task 6), e2e incl. dedup + gate (Task 7). Out-of-scope items (backfill, boats, two-way) intentionally absent.
- **Secrets never committed:** all SF/refresh values are set via CLI/Vault at runtime; migrations reference the Vault secret by name only.
- **Type consistency:** `CustomerRecord` / `SalesforceConfig` and helper signatures defined in Task 2 are used unchanged in Task 3.
