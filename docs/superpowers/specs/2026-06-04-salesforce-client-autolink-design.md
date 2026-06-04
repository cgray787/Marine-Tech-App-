# Auto-link new clients to Salesforce — Design

**Date:** 2026-06-04
**Status:** Approved (brainstorm complete)
**Author:** Connor Gray + Claude

## Goal

Every new client (`customers` row) created in the Marine Tech app — from the
mobile app, the web dashboard, or an offline mutation that syncs later — should
automatically be created in (or linked to) Jeff Brown Yachts' Salesforce as a
Person Account, and the app's `customers` row should record the Salesforce
account id + deep-link URL.

Today the `customers.salesforce_account_id` / `salesforce_url` columns
(migration 016) exist but are only populated out-of-band by the `quo-to-sf`
skill running on Connor's Mac. New clients added in the app never reach
Salesforce.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Duplicate handling | **Link to existing** — match by phone, then email; only create new if no match. |
| Which clients sync | **JBY org only** — gate on `org_id = <JBY org>` so the app stays sellable to other shops. |
| SF categorization | Person Account, `Type='Customer'`, `PersonLeadSource='Marine Tech App'`, `OwnerId=` Connor. |
| Auth approach | **A — reuse the Salesforce CLI's OAuth refresh token** (no Salesforce-admin setup; seed secrets from `sf` CLI). |

## Architecture

### Trigger (uniform entry point)

A Postgres `AFTER INSERT` trigger on `public.customers` calls `pg_net.http_post`
to the `salesforce-sync` Edge Function.

- **Fires when:** `NEW.org_id = <JBY org uuid>` AND `NEW.salesforce_account_id IS NULL`.
- **Why the DB layer:** catches inserts from mobile, web, and offline-sync in
  one place — no duplicated logic across the two client apps.
- **Why `pg_net`:** the HTTP call is async/fire-and-forget, so it never blocks
  or fails the client insert. The customer always saves locally even if
  Salesforce is unreachable.
- The trigger sends the standard Supabase webhook payload shape:
  `{ "type": "INSERT", "table": "customers", "schema": "public", "record": { …full row… } }`.

### Edge Function `salesforce-sync`

Deno function, deployed to project `ikfcnqdrlvhvlyhiuphs`, with
`verify_jwt = false` and a shared-secret header (`SF_SYNC_SECRET`) for auth
(since `pg_net` from the trigger can't easily mint a Supabase JWT).

Flow:

1. **Validate** the `x-sync-secret` header against `SF_SYNC_SECRET`. Reject otherwise.
2. **Parse** the customer record from the payload. Defensive re-check: skip if
   not JBY org or `salesforce_account_id` already set.
3. **Get Salesforce access token** — POST to
   `{SF_INSTANCE_URL}/services/oauth2/token` with
   `grant_type=refresh_token`, `client_id=SF_CLIENT_ID`,
   `client_secret=SF_CLIENT_SECRET` (may be empty for the CLI's `PlatformCLI`
   connected app), `refresh_token=SF_REFRESH_TOKEN`. Response gives
   `access_token` + `instance_url`.
4. **Dedup** — SOQL:
   `SELECT Id FROM Account WHERE IsPersonAccount = true AND (Phone = :phone OR PersonEmail = :email) LIMIT 1`
   (phone normalized; skip a clause if that field is empty). If a match is found,
   reuse its `Id` (link, don't create).
5. **Else create** a Person Account — POST
   `{instance}/services/data/v60.0/sobjects/Account` with:
   - `RecordTypeId = SF_RECORD_TYPE_ID` (`0123h000000ANsqAAG`)
   - `FirstName` / `LastName` split from `customers.name` (see Name splitting)
   - `Phone`, `PersonEmail`
   - `PersonMailingStreet = customers.address` (single free-text field; not parsed)
   - `Type = 'Customer'`, `PersonLeadSource = 'Marine Tech App'`
   - `OwnerId = SF_OWNER_ID` (`005TS000008FD5BYAW`)
6. **Write back** via the service-role Supabase client:
   `UPDATE customers SET salesforce_account_id = :id,
   salesforce_url = '{instance}/lightning/r/Account/{id}/view',
   salesforce_synced_at = now() WHERE id = :record_id`.
7. **Log** outcome; return 200 (even on a handled no-op) so `pg_net` doesn't retry-storm.

### Name splitting

Salesforce Person Accounts require `LastName`.

- Split `name` on the first whitespace: `FirstName = first token`,
  `LastName = remainder`.
- Single-word name → `LastName = name`, omit `FirstName`.
- Empty/whitespace name → should not happen (app requires a name), but fall back
  to `LastName = 'Unknown'` defensively.

### Secrets (Supabase Edge Function secrets)

Seeded by Claude from `sf org display --verbose --target-org jby --json`
(`sfdxAuthUrl` = `force://<clientId>:<clientSecret>:<refreshToken>@<instanceUrl>`):

- `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_REFRESH_TOKEN`, `SF_INSTANCE_URL`
- `SF_RECORD_TYPE_ID = 0123h000000ANsqAAG`
- `SF_OWNER_ID = 005TS000008FD5BYAW`
- `SF_SYNC_SECRET` = a generated random string (also referenced in the trigger).

### Schema — migration `020_customers_salesforce_synced_at.sql`

```sql
alter table public.customers
  add column if not exists salesforce_synced_at timestamptz;
```

A null `salesforce_account_id` continues to mean "not synced," so failures are
visible and retryable; `salesforce_synced_at` records when the sync last ran.

### Web org_id fix (required for gating)

`app/dashboard/customers/customer-list.tsx` `handleAddCustomer` currently inserts
only `name/email/phone/address/notes` — it does **not** set `org_id` /
`location_id` (mobile's `client/new.tsx` does). Without `org_id`, web-created
clients fall outside the JBY-org gate and would never sync. Fix: set
`org_id` / `location_id` from the logged-in profile, matching mobile.

## Error handling

- Trigger uses async `pg_net` → client insert never blocked or failed.
- Token fetch fails / SF down / dup-query error → function logs the error,
  returns 200, leaves `salesforce_account_id` null. The client row is intact.
- Retry story (MVP): a null `salesforce_account_id` marks an unsynced client; a
  future backfill or manual re-trigger picks it up. No automatic retry queue in v1.

## Out of scope (future work)

- **Backfill** of existing JBY clients lacking an SF link (one-off script later).
- **Boats → SF vessel records.**
- **Two-way sync** (SF edits flowing back into the app).
- Automatic retry queue / dead-letter handling.

**Known limitation (dedup race):** dedup is read-then-write with no distributed
lock. Two customers with the same phone/email inserted within the same instant
(e.g. a future bulk import) could each see "no match" and both create a Person
Account, producing an SF duplicate. Not a concern for one-at-a-time manual adds;
revisit if/when a bulk-import path is added.

## As-built note (2026-06-04)

Shipped and verified end-to-end. One deviation from the design above:

- **Auth/secret storage changed from Edge Function env-secrets to Supabase Vault.**
  The available Supabase token could not set Edge Function secrets ("account does
  not have the necessary privileges"). Instead, the two sensitive values
  (Salesforce OAuth refresh token + the shared sync secret) live in **Vault**, and
  the function reads them via the service-role-only RPC `salesforce_sync_secrets()`
  (migration `022`). Non-sensitive config (client id `PlatformCLI`, instance URL,
  RecordType/Owner ids, JBY org id) are env-defaulted constants in the function.
- The refresh token was seeded into Vault over HTTPS (via a temporary,
  sync-secret-guarded RPC that was dropped afterward) so it never transited a
  plaintext log.
- Auth approach A still holds (the CLI's `PlatformCLI` OAuth refresh token); only
  where the secret is *stored* changed.
- Migrations as-built: `020` (`salesforce_synced_at`), `021` (pg_net trigger +
  `revoke` on the trigger fn), `022` (`salesforce_sync_secrets` RPC).

## Testing

End-to-end (no good unit-test seam for the live SF call):

1. Insert a JBY test customer via SQL → confirm a Person Account is created in
   SF and `salesforce_account_id` / `salesforce_url` / `salesforce_synced_at`
   are written back.
2. Insert a customer whose phone/email matches an existing SF Person Account →
   confirm it **links** to the existing record (no duplicate created).
3. Insert a customer in a non-JBY org → confirm the trigger does **not** fire.
4. Clean up all test records (app rows + any SF records created).
