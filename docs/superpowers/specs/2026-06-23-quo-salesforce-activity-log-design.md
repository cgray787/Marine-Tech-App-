# Quo → Salesforce Activity Logging (daily digest)

**Date:** 2026-06-23 · **Status:** approved, building. **Decisions:** daily digest per client; texts + calls; fully auto (server-side, no approval step); existing SF accounts only; **guard ON**.

## Why an edge function (not a routine)
Cloud routines have NO Salesforce access (sandbox egress blocks Supabase + SF) — that's why the weekly Quo→SF routine only DMs a roster. A **Supabase edge function on pg_cron** runs server-side (unrestricted egress; SF refresh token already in Vault), so it's the only way to auto-write SF.

## Architecture
- **Edge function** `supabase/functions/quo-activity-log/` (Deno), mirroring `salesforce-sync/` (SF OAuth refresh → REST; `index.ts` orchestration + `salesforce.ts`/`quo.ts` pure helpers + Deno tests). `verify_jwt=false`, authed by `x-sync-secret` header.
- **Cron:** pg_cron daily ~6:13am PT (`13 13 * * *` UTC) → `pg_net` POST to the function with `{}` (= prior calendar day). **Built as a SEPARATE migration, applied LAST — only after the Ed/Charlie dry-run passes.**
- **Secrets (Vault):** reuse `sf_refresh_token` + `sf_sync_secret`; ADD `quo_api_key` (OpenPhone key — value on Connor's Notion "API keys" page). New RPC `quo_activity_secrets()` (service-role only, mirrors `salesforce_sync_secrets()`) returns all three.

## Run logic (per invocation)
Body params (all optional): `{ date?: 'YYYY-MM-DD', dryRun?: boolean, onlyPhones?: string[] }`. Default date = **prior calendar day** in `America/Los_Angeles`.
1. **Pull Quo** (OpenPhone API, inbox `+14256718474`, window = that day): messages (texts) + calls (with duration + transcript if available). Group by the counterpart phone (the client), capturing per item: time, direction (You→ / ←Them), text / call meta.
2. **Match to existing SF Person Account** by phone — normalize digits-only **last 10**, compare to `Phone` + `PersonMobilePhone`. **Guard:** log ONLY when exactly **one** account matches; 0 or >1 → skip (record skip reason). Existing accounts only — never create.
3. **Service-thread guard:** skip a client's day if the conversation is clearly service/parts-only (all items match service terms — part/parts/repair/warranty/invoice/oil/service/haul — and none match sales terms — buy/sell/offer/showing/price/listing/interested/looking). Conservative: when unsure, log it.
4. **Build digest** (one per client/day): chronological lines, e.g.
   `9:14a  You → Charlie: ...` / `9:20a  ← Charlie: ...` / `2:05p  Call (outbound, 4m12s): <transcript snippet>`.
4b. **Jeff Brown Yachts-only filter (`brand-filter.ts` — added 2026-06-23 per Connor).** Salesforce is JBY's CRM; Gray Yachts is Connor's separate brokerage and its info must NEVER land in SF. An isolated filter module classifies each conversation's brand from its text (the Touch-1 greeting: "…with Jeff Brown Yachts" → `jby`; "…with Gray Yachts" / grayyachts.com|.media and no JBY signal → `gray_yachts`; neither → `unknown`). Then: a **`gray_yachts`** thread is reduced to a **contentless summary** (counts only — "Client contact logged (N texts, M calls). Details omitted — non-JBY.", no message bodies, no brand, no details); a **`jby`/`unknown`** thread keeps the full digest but every message body that mentions Gray Yachts is **redacted** wholesale (`[redacted — non-JBY]`) before the digest is built. The run summary reports each client's `brand` + `filter` (`full`|`redacted`|`summary-only`). (Implemented as a dedicated, isolated filter module inside the same job — not a literal second cron — which is the sound way to get the "separate filter agent" Connor asked for.)

5. **Write SF Task (idempotent):** Subject = `Quo activity — <YYYY-MM-DD>` (the idempotency marker). Query SF for an existing Task on that account's `PersonContactId` (`WhoId`) with that Subject → if found **PATCH** Description; else **POST** new. Fields: `WhoId=PersonContactId`, `Subject`, `Description=digest`, `ActivityDate=<day>`, `Status='Completed'`, `OwnerId=005TS000008FD5BYAW` (Connor), `TaskSubtype='Call'` if call-only else `'Task'`. Skip writes entirely when `dryRun`.
6. **Return** a JSON summary: per client → matched account / skipped(reason) / task created|updated; counts. (dryRun returns the would-write digests without touching SF.)

## Testing (before any cron)
Deploy the function with **no cron**. Invoke manually:
- `{dryRun:true, onlyPhones:['<Ed>','<Charlie>']}` → inspect the digests it would write.
- then `{dryRun:false, onlyPhones:['<Ed>','<Charlie>']}` → verify the two Tasks in Salesforce look right (match what Connor logged for Ed/Charlie by hand).
Ed's phone = `+17609693009` (Edward Houghton / "Ed Paquette"). Charlie's = look up in Quo/SF. Only after Connor approves those two → apply the cron migration.

## Out of scope
Emails (texts+calls only), creating accounts (existing only), non-JBY org, real-time (daily batch). **Gray Yachts business detail is explicitly excluded from Salesforce** (see step 4b).
