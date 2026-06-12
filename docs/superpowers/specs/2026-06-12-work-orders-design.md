# Work Orders — Design

**Date:** 2026-06-12
**Status:** Approved by Connor (brainstorm session 2026-06-12)
**Scope:** Web dashboard (marinetech.grayyachts.com) only. Mobile app and grayyachts.com portal mirror are out of scope for v1.

## Purpose

A native Work Orders module in the admin dashboard, modeled on JBY's Salesforce "teamMarine Service" work orders (reference: WO-4505 screenshots in this session). A work order is a formal, priced, customer-facing document anchored to a **client profile**: one or more job sections, each with line items; margins on parts (hidden from customer); stacked named taxes; optional credit-card fee; payment tracking with balance due; and a printable JBY-branded customer copy. Money data is structured so it can map onto QuickBooks invoices in a later phase.

**Access:** Owner (Connor) + managers (Derik) create/edit. Viewers (Tommy) read-only. Enforced in RLS and UI, consistent with the migration-027 role system.

## Data model (next migration: `033_work_orders.sql`)

### `price_levels`
Named rate cards, mirroring SF "Price Level" (e.g. "Seattle – Standard Pricing", "Sausalito Emergency Rate", "Slip Per Foot / Month Seattle").

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| org_id | uuid | |
| name | text | |
| rate | numeric(10,2) | dollars |
| unit | text | `hour` \| `foot` |
| active | bool default true | |

Seed: "Seattle – Standard Pricing" $175/hour (+ rows Connor adds via settings UI).

### `job_templates`
Lightweight Add Jobs catalog (v1 decision: seeded small, grows via "Save as template").

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| org_id | uuid | |
| name | text | e.g. "Engine Service 100 Hour 300 HP V8 2025" |
| description | text | |
| notes_to_tech | text | |
| default_hours | numeric(6,2) | nullable |
| default_price_level_id | uuid fk | nullable |
| active | bool default true | |

Seed ~15 from the screenshots: 100-hr engine services (200 HP V6 / 250 R V8 / 300 HP V8 / 350 HP L6 / 350-400 HP V10 / 450 R V8 @ 2.50 hrs), 300-hr equivalents (@ 5.00 hrs), Axopar Ceramic Coat 28/37 (20 / 28 hrs), Travel Fee, Install Transducer, Boat Wash, Bottom Cleaning over/under 40 ft.

### `wo_settings` (one row per org)
| column | type | notes |
|---|---|---|
| org_id | uuid pk | |
| shop_supplies_amount | numeric(10,2) default 75.00 | auto-line per job |
| default_margin_pct | numeric(5,2) default 25.00 | |
| default_cc_fee_pct | numeric(5,2) default 3.00 | |
| default_taxes | jsonb | `[{"name":"Seattle Sales Tax","rate_pct":10.35}]` — editable presets |

### `work_orders`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| wo_number | int unique | from sequence starting 1001; displayed "WO-1001" |
| org_id / location_id | uuid | location drives letterhead branch block |
| customer_id | uuid fk, **required** | anchors WO to client profile |
| boat_id | uuid fk, nullable | fills boat info block (HIN, reg/stock, engines + hours) |
| job_id | uuid fk jobs, nullable | optional link to an ops job |
| status | text | `draft` → `approved` → `completed` → `invoiced` |
| service_advisor | uuid fk profiles | defaults to creator |
| wo_date | date default today | |
| default_margin_pct | numeric(5,2) | copied from settings, editable |
| taxes | jsonb | `[{"name","rate_pct"}]` picked from presets, stackable |
| cc_fee_pct | numeric(5,2) nullable | null = fee off |
| printed_notes | text | customer-visible on PDF |
| internal_notes | text | never printed |
| created_by, created_at, updated_at, approved_at, completed_at, invoiced_at | | |

### `work_order_jobs` (sections within a WO — mirrors SF "Job Information")
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| work_order_id | uuid fk cascade | |
| position | int | display order |
| title | text | e.g. "Install Transducer" |
| description | text | |
| notes_to_tech / cause / correction | text | service-writing trio |
| customer_status | text | `estimate` \| `approved` — ESTIMATE renders on the section header |
| job_status | text | `open` \| `awaiting_customer` \| `in_progress` \| `done` |
| job_type | text | `frh` \| `flat` \| `per_foot` |
| price_level_id | uuid fk | labor rate source |
| hours | numeric(6,2) | for `frh` |
| flat_price | numeric(10,2) | for `flat` |
| boat_length_ft | numeric(5,1) | for `per_foot` |
| labor_taxable | bool default true | |
| assigned_tech | uuid fk profiles, nullable | |

The **labor line is computed**, not hand-entered: `frh` = hours × price-level rate; `flat` = flat_price; `per_foot` = boat_length_ft × price-level rate. Adding a job auto-inserts a Shop Supplies line (amount from settings); the editor's "Remove Shop Supplies" toggle deletes it.

### `work_order_lines` (non-labor lines, belong to a job section)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| work_order_job_id | uuid fk cascade | |
| kind | text | `part` \| `shop_supplies` \| `shipping` \| `flat_service` \| `other` |
| item_code | text | part number |
| description | text | |
| qty | numeric(8,2) default 1 | |
| unit_cost | numeric(10,2) | parts: **your cost**; other kinds: customer price |
| margin_pct | numeric(5,2) nullable | null → WO default for `part`, 0 for other kinds; any line can override |
| taxable | bool default true | |
| position | int | |

### `work_order_payments`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| work_order_id | uuid fk cascade | |
| paid_on | date | |
| method | text | e.g. "Wire Transfer ACH" |
| note | text | e.g. "payment for Transducer only" |
| amount | numeric(10,2) | |
| recorded_by | uuid | |

### RLS
- SELECT: org members (viewer included), location-scoped the same way jobs/customers are.
- INSERT/UPDATE/DELETE: owner, admin, or manager (manager within own location) — mirrors migration-027 patterns. Viewer blocked.
- `price_levels`, `job_templates`, `wo_settings`: SELECT all org members; writes owner/admin/manager.

## Money math (single source: `lib/work-orders/totals.ts`)

1. **Labor per job** — by job_type as above.
2. **Line customer price** = qty × unit_cost × (1 + effective_margin/100). Effective margin: `part` → line override ?? WO default; other kinds → line override ?? 0. Cost and margin never appear in any customer-facing view.
3. **Job subtotal** = labor + its lines. **WO subtotal** = Σ job subtotals.
4. **Charges rollup** (mirrors SF Customer Charges box): Total Labor / Total Parts / Shop Supplies / Shipping & Handling / Other — grouped by line kind (`flat_service` and `other` both roll up under "Other"; rows render only for categories present).
5. **Taxes**: each `{name, rate_pct}` applies to the taxable base (taxable lines + labor where labor_taxable). Each tax renders as its own row.
6. **Credit Card Fee** (if cc_fee_pct set): pct × (subtotal + taxes), rendered as "Credit Card Fee (3.00%)".
7. **Amount Due** = subtotal + taxes + fee. **Amount Paid** = Σ payments. **Balance Due** = due − paid.
8. **Profit (internal)** = Σ margin dollars across lines — shown to owner/manager only.

All math in cents-safe arithmetic (round half-up at each rendered figure). Unit tests cover: margin defaulting/override, multi-tax stacking, fee on/off, per-foot labor, non-taxable lines, balance after partial payments.

## UI

- **Sidebar**: "Work Orders" entry between Jobs and Reports.
- **List** `/dashboard/work-orders`: table (WO#, date, client, boat, status badge, Amount Due, Balance Due), status filter, New Work Order button, realtime refresh. Balance > 0 on completed/invoiced WOs highlighted.
- **Editor** `/dashboard/work-orders/[id]`:
  - Header: customer picker (required), boat picker (filtered to customer's boats), service advisor, date, status action buttons (Approve / Complete / Mark Invoiced, with timestamps).
  - Job sections: numbered, orange header bar w/ title + advisor + ESTIMATE tag (visual nod to the SF layout). "Add Jobs" opens the template picker (quick search, multi-select, preset hours/price level, plus a blank ad-hoc row). Each job opens an edit sheet with the full Job Information field set. "Save as template" button on any job.
  - Lines per job: add part / shipping / flat service / other; shop supplies auto-present unless removed; inline qty/cost/margin/taxable edits.
  - Right rail: Customer Charges box (rollup, taxes, fee, Amount Due / Paid / Balance), tax preset picker, default margin, CC fee toggle, internal Profit readout, Add Payment + payment history, printed notes + internal notes.
  - Viewer (Tommy) sees everything read-only except cost/margin/profit columns, which are hidden for viewers.
- **Client profile**: Work Orders card on `/dashboard/customers/[id]` — their WOs w/ status + balance, link to create one pre-filled.
- **Print** `/dashboard/work-orders/[id]/print`: customer copy — JBY logo + branch letterhead (from location), "Work Order" + red WO-number, date, service advisor, Customer Information block, Boat Information block (boat, HIN, reg/stock #, P/S engines + hours), numbered job sections with customer-priced lines and per-section subtotals, Customer Charges box, payments + Balance Due, Printed Notes. **Never shows:** unit costs, margin, profit, internal notes. Uses the existing `print-button.tsx` pattern.
- **Settings** `/dashboard/work-orders/settings` (owner/manager): CRUD price levels, job templates, tax presets, shop-supplies amount, default margin/fee.

## Out of scope (later phases)

- QuickBooks integration ("Send to QuickBooks") — schema is shaped for QB invoice mapping (lines with qty/rate/amount, named taxes, payments).
- Email/text the WO to the customer from the app.
- Full Salesforce catalog import.
- Mobile app screens and the grayyachts.com portal mirror of this section.
- Customer e-signature / online approval.

## Testing

- Unit tests for `totals.ts` (the only nontrivial logic).
- Manual verification on deploy: create WO → add templated + ad-hoc jobs → parts w/ margin → stack two taxes → CC fee → partial payment → print view → verify viewer read-only and hidden costs.
