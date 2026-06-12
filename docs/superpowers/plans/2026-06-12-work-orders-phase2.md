# Work Orders Phase 2 — Branded PDF + QuickBooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Branch: `feat/wo-phase2`.

**Goal:** (1) "Download PDF" — a branded, customer-facing PDF of any work order generated in the browser; (2) QuickBooks Online integration — one-time "Connect to QuickBooks" OAuth in WO settings + per-WO "Send to QuickBooks" creating a QBO **Invoice** (decision: invoice only, no payments push).

**Architecture:** PDF via `@react-pdf/renderer`, lazy-loaded client-side (no Worker/server rendering needed); document component in `lib/work-orders/pdf.tsx` consuming the same `WorkOrderFull` + `computeTotals` data as the print view; `public/jby-logo.png` (committed) for branding. QuickBooks via Next.js route handlers running on the CF Worker: OAuth2 (authorize → token exchange → refresh rotation) with tokens stored server-side-only in a `qb_connections` table (RLS deny-all; accessed via service-role client); invoice export route maps WO → QBO Invoice. Client UI only ever talks to our own `/api/quickbooks/*` routes.

**Env/secrets:** `INTUIT_CLIENT_ID`, `INTUIT_CLIENT_SECRET`, `QB_ENV` (`sandbox`|`production`), `QB_REDIRECT_URI` (`https://marinetech.grayyachts.com/api/quickbooks/callback`). Until set, the settings card shows "QuickBooks app not configured" — everything else ships dark. `SUPABASE_SERVICE_ROLE_KEY` already exists as a CF secret.

---

### Task A: Branded PDF download

**Files:** Create `lib/work-orders/pdf.tsx` (Document component + `woFileName()`), `app/dashboard/work-orders/[id]/download-pdf-button.tsx`; Modify `[id]/editor.tsx` + `[id]/print/page.tsx` (add button), `[id]/print/page.tsx` (also add the round logo to the header center, like the SF letterhead); `package.json` (`@react-pdf/renderer`).

- Document layout mirrors the print view (Task 7) exactly: letterhead block + centered round logo (`public/jby-logo.png` — in the PDF component import the PNG via URL `/jby-logo.png` at runtime in browser; for the Node sample-render pass a file path prop), red WO number, customer/boat blocks, amber job bars, customer-price line tables (REUSE `laborForJob`/`laborDisplay`/`linePrice`/`computeTotals` — NO new math), Customer Charges box, payments, printed notes. NEVER: costs, margin, profit, internal notes.
- Button: "Download PDF" (editor header + print page, all roles incl. viewer); `const { pdf } = await import("@react-pdf/renderer")` on click → `pdf(<WorkOrderPdf .../>).toBlob()` → anchor download `WO-1001 — Jeff Brown Yachts.pdf`. Disable + "Generating…" while running.
- Sample: a small Node script (NOT committed) renders a demo WO to `/tmp/sample-wo.pdf` for the user to inspect.
- Verify: tsc/tests/lint; `npm run build` (ensure the lazy import keeps @react-pdf out of the server bundle — build must succeed on OpenNext).

### Task B1: Migration `034_quickbooks.sql`

```sql
create table public.qb_connections (
  org_id uuid primary key references public.organizations(id),
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  company_name text,
  connected_by uuid references public.profiles(id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.qb_connections enable row level security; -- NO policies: service-role only

alter table public.work_orders
  add column quickbooks_invoice_id text,
  add column quickbooks_synced_at timestamptz;
```
Apply via Supabase MCP + commit. (The pre-Sausalito location-scoping migration becomes 035 — update the CLAUDE.md note.)

### Task B2: OAuth plumbing

**Files:** `lib/quickbooks/server.ts`, `app/api/quickbooks/{connect,callback,status,disconnect}/route.ts`, settings card `app/dashboard/work-orders/settings/quickbooks-card.tsx` (+ wire into settings-client).

- `lib/quickbooks/server.ts`: env access, base URLs (`https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`, API base `https://quickbooks.api.intuit.com` or sandbox), `adminClient()` (service-role supabase), `getConnection()`, `refreshIfNeeded()` (rotates BOTH tokens, persists before returning — Intuit refresh tokens rotate), `qbFetch(path, init)` w/ auto-refresh-on-401, `requireDashboardRole(req)` helper that validates the caller's Supabase session cookie and role ∈ {admin, manager} (reuse `@/lib/supabase/server` createClient).
- `connect`: role-gated; 32-byte random `state` in an httpOnly cookie; redirect to `https://appcenter.intuit.com/connect/oauth2?client_id=…&scope=com.intuit.quickbooks.accounting&redirect_uri=…&response_type=code&state=…`.
- `callback`: verify state vs cookie; exchange code (Basic auth id:secret); fetch CompanyInfo for `company_name`; upsert `qb_connections` (org_id from the caller's profile); redirect `/dashboard/work-orders/settings?qb=connected` (or `?qb=error&msg=…`).
- `status` (GET, any dashboard role): `{ configured, connected, companyName }`.
- `disconnect` (POST, role-gated): call Intuit revoke endpoint, delete row.
- Settings card: shows Connect button (green Intuit-style), or "Connected to {company} ✓" + Disconnect; or "Not configured — add INTUIT_CLIENT_ID/SECRET" when `!configured`.

### Task B3: Invoice export

**Files:** `app/api/quickbooks/export/route.ts`, `lib/quickbooks/invoice.ts` (pure payload builder + unit tests `__tests__/work-orders/qb-invoice.test.ts`), editor button `[id]/quickbooks-button.tsx` wired into editor header.

- `buildInvoicePayload(wo, totals, itemRefs)` (PURE, tested): DocNumber `WO-{n}`, TxnDate, CustomerRef, CustomerMemo = printed_notes; one line per job labor (`Labor — {title}`, amount `laborForJob`) + one line per WO line (description, qty, customer unit price via `linePrice`/qty, amount `linePrice`) + CC-fee line when set; `TxnTaxDetail: { TotalTax }` override from `totals` tax sum; line ItemRefs: labor lines → "Labor" item, others → "Parts & Materials" item, fee → "Service Fees".
- Export route (POST `{ workOrderId }`, role-gated): load WO via service role + `fetchWorkOrderFull`-equivalent select; find-or-create QBO Customer by DisplayName (= customer name; on create include email/phone); find-or-create the 3 Items (Service type; IncomeAccountRef = first Income account via `query Account where AccountType='Income'`); POST Invoice; persist `quickbooks_invoice_id`/`quickbooks_synced_at`; return `{ invoiceId, qboUrl }` (`https://qbo.intuit.com/app/invoice?txnId={id}` or sandbox url).
- Button: visible canEdit; states: "Send to QuickBooks" → loading → on success swap to "View in QuickBooks ↗" link + small "Re-send" action; disabled w/ tooltip when status endpoint says not connected; errors shown inline.
- Tests: payload builder — WO-4505-shape fixture asserts line amounts, DocNumber, tax override, fee line presence/absence.

### Task C: Gate + deploy
tsc/tests/lint/build; merge → main; `npm run deploy`; set CF secrets when Connor supplies them (`npx wrangler secret put INTUIT_CLIENT_ID` etc.); update CLAUDE.md (api routes, migration 034, 035 note) + memory; hand Connor the 5-minute Intuit app checklist (app on developer.intuit.com → redirect URI `https://marinetech.grayyachts.com/api/quickbooks/callback` → copy keys).
