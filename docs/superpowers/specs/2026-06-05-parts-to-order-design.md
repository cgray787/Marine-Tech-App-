# Parts-to-Order System — Design

**Date:** 2026-06-05
**Status:** Approved (brainstorm complete) — building Phase 1
**Author:** Connor Gray + Claude

## Goal

When a technician adds parts to a service job in the mobile app, those parts
should surface on the admin dashboard in a dedicated **Parts to Order** section —
grouped by customer and boat, highlighted, with a per-part **Need to order ⇄
Ordered** toggle — so Connor has one organized place to see and track every part
he needs to order, updating in real time.

## Key finding

The mobile service form (`mobile/app/(tabs)/service.tsx`) **already** has a rich
"Parts Needed" section. Each part already captures: `name`, `qty`, `partNum`,
`ordered` (bool), `photo` (local URI), `supplier`, `url`. **But these entries are
never persisted** — the submit handlers (`handleSubmitOnline` /
`handleSubmitOffline`) don't write them anywhere. This feature's core is to
persist them and surface them.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Statuses | **Need to order / Ordered** (2 states, toggle button). |
| Ordered parts | Move to a collapsed **"Ordered"** sub-list (keep the record). |
| Alerts | All of: dashboard badge+highlight, email, push — **phased** (see below). |

## Scope — phased

- **Phase 1 (this build):** `parts` table + RLS, mobile persistence (incl. a new
  per-part **description** field + photo upload to storage), and the dashboard
  **Parts to Order** section with grouping, highlight, toggle, Ordered sub-list,
  count badge + KPI card, real-time updates. This is the full in-app workflow and
  the primary alert.
- **Phase 2 (fast follow):** **email** to Connor when a tech adds a new
  need-to-order part. Requires wiring an email provider (e.g. Resend) + API key.
  DB trigger → edge function, same pattern as `salesforce-sync`.
- **Phase 3 (later):** **push** notifications. The mobile push subsystem was
  removed earlier (token registration gone), so this is a larger rebuild. Deferred.

## Architecture (Phase 1)

### Data model — migration `025_parts.sql`

```
public.parts
  id                 uuid pk default gen_random_uuid()
  service_report_id  uuid references service_reports(id) on delete cascade
  job_id             uuid references jobs(id) on delete set null
  customer_id        uuid references customers(id) on delete set null
  boat_id            uuid references boats(id) on delete set null
  created_by         uuid references profiles(id) on delete set null   -- the tech
  org_id             uuid references organizations(id) on delete set null
  name               text not null
  part_number        text
  quantity           integer not null default 1
  description        text
  supplier           text
  url                text
  photo_url          text
  status             text not null default 'need_to_order'
                       check (status in ('need_to_order','ordered'))
  ordered_at         timestamptz
  created_at         timestamptz not null default now()
```

- Index on `(status)` and `(customer_id)` for the dashboard query.
- `org_id` set server-side by a `BEFORE INSERT` trigger from the inserting tech's
  profile (mirrors `set_customer_tenant`), so it can't be spoofed and tenancy is
  reliable.
- **RLS** (enable): authenticated users may `select`/`insert`/`update` parts where
  `org_id` = their profile's `org_id`; `is_admin()` override. Status toggle is an
  `update`; techs insert their org's parts.

### Mobile — persist parts on submit

- Extend the `Part` type + the "Parts Needed" UI with a **`description`** field
  (a short multiline note — the "detailed area" of the part).
- Upload each part's `photo` (local URI) to the existing report-photos storage
  bucket (reuse the report-photo upload flow), capturing the public URL.
- After the `service_reports` row is created/updated, insert one `parts` row per
  entry: map `partNum→part_number`, `qty→quantity`, `photo→photo_url`,
  `ordered→status` (`true`→`ordered` else `need_to_order`), and set
  `service_report_id`, `job_id`, `customer_id`, `boat_id`, `created_by`.
- **Edit mode:** delete existing `parts` for the report, then re-insert from state
  (same approach the form already uses for checklist items + photos).
- Applies to both `handleSubmitOnline` and the offline/sync path.

### Dashboard — "Parts to Order" section

- Server fetch in `app/dashboard/page.tsx`: parts joined to `customers(name)` +
  `boats(name, make_model)`, split into `need_to_order` and `ordered`.
- New full-width section below the Recent Reports/Jobs grid:
  - Grouped **Customer → Boat → parts**; parts rendered in a **highlighted**
    (gold/amber) card. Each part shows name, part #, qty, description, supplier
    (linked if `url`), and a photo thumbnail.
  - Per-part **toggle button** "Need to order" ⇄ "Ordered" (client component →
    `supabase.update({status, ordered_at})`).
  - Collapsed **"Ordered"** sub-list below the to-order group.
  - Header **count badge** "Parts to Order · N", plus a **5th KPI card**
    ("Parts to Order") in the top stats row.
- Add `parts` to the existing `RealtimeRefresh` tables so the section updates live.

## Error handling

- Mobile: persisting parts is best-effort relative to the report — if a part
  insert fails, surface the error but the report/job still saved. (Parts are
  additive.)
- Dashboard toggle: optimistic update with revert on error; show an inline error.

## Out of scope (Phase 1)

- Email + push alerts (Phases 2–3).
- Editing/deleting individual parts from the dashboard (only status toggle in v1).
- Parts inventory / quantities-on-hand / reorder thresholds.
- Surfacing parts in the PDF (separate, the report PDF already lists `parts_used`).

## Testing

- DB: insert a part as a tech (org_id auto-set), confirm RLS visibility + status
  toggle by admin; non-org user can't see it.
- Mobile: submit a service report with parts → confirm `parts` rows created with
  correct fields + photo URL; edit the report → parts re-sync.
- Dashboard: parts appear grouped + highlighted; toggle moves a part to Ordered;
  count badge + KPI update; realtime reflects a new part without refresh.
