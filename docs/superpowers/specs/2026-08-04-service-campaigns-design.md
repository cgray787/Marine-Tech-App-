# Service Campaigns — Design

**Date:** 2026-08-04
**Status:** Phase 1 implemented (schema + web Create Job). Phases 2–4 specified, not built.

## Problem

Jeff Brown Yachts is an Axopar dealer running Mercury power. Both manufacturers issue
service campaigns — Axopar calls them Service Campaigns, Mercury calls them service
bulletins / warranty claims — and the dealer must perform them on affected hulls and
file for reimbursement. Today none of this lives in Marine Tech. It is tracked in two
separate manufacturer portals and in memory.

Three properties make a campaign behave unlike a normal job:

1. **Per-vessel and one-time.** Done once on a given boat, never again. A regular job repeats.
2. **The time is published, not estimated.** Axopar states *Compensated Work Hours*;
   Mercury pays labor codes. Actual time may differ, and the gap is the number worth seeing.
3. **They arrive from outside.** You receive them and work a list until every affected
   boat is covered.

The useful question is therefore never "what campaigns exist" but **"which of my boats
still need one"** — and, after the fact, **"prove we did it."**

## The two manufacturers are not the same shape

This is the central design constraint, taken from the real portal screens.

| | Axopar | Mercury |
|---|---|---|
| Unit of work | Boat Service Task | Warranty claim |
| Identifies a vessel by | **HIN** (`FI-AXO9C148I425`) | **Engine serial** (`ENG 3B458751`) |
| Time | Compensated Work Hours (`0.5`) | Labor codes (`CA12 .5` + `CA18 .5`) |
| Narrative | Issue + Introduction | Conditions Found |
| Also carries | Priority, Task Status | Part/Fail code, part numbers, engine hours, claim number |

Forcing both into one identical form would drop exactly the fields needed to file.
Each catalog form mirrors the portal it is transcribed from, so there is no mental
translation while copying. Field labels use the manufacturers' vocabulary, not ours —
"Compensated Work Hours", "Conditions Found", "Part Code / Fail Code".

`boats` stored `engine_make` and `engine_model` but no serial, so Mercury campaigns
could not be matched to a hull at all. Migration 043 adds
`engine_serial_port` / `engine_serial_starboard`.

## Architecture

### Two tables, one split

- **`service_campaigns`** — the catalog. Mutable; maintained as bulletins arrive.
- **`campaign_log`** — the permanent record. One row per campaign per boat.

One answers "what still needs doing" and may churn. The other answers "what did we do"
and must never move.

### Why the log freezes a copy

`campaign_log` stores its own copy of the campaign code, title, revision, instructions
and compensated hours rather than only referencing `service_campaigns`. If it were a
pure reference, a manufacturer revising a bulletin next year would silently rewrite
what our records claim we did on every boat already finished. Manufacturers revise
bulletins routinely. The snapshot is written by the `campaign_log_freeze` trigger at
insert, so the frozen text always comes from the database and cannot be spoofed by a
client.

### Append-only

`campaign_log_immutable` rejects any update that changes a snapshot column or the
row's subject. Only `status`, `conditions_found`, `actual_hours`, `engine_hours`,
`claim_number`, `claim_status`, `completed_at` and `completed_by` may change. There is
**no DELETE policy on the table at all**. A record entered in error is corrected by
adding an entry, never by erasing one — a history that can be quietly changed is not
evidence, and evidence is the point.

### Anchored to the hull, carrying the owner

A campaign is performed on a boat, not a person. The log's durable anchor is
`boat_id`, with `customer_id` recording who owned it at the time, so a sold Axopar
carries its history to the new owner. It also stores `boat_hin`, `boat_name` and
`customer_name` as plain text: `boats.customer_id` CASCADEs from `customers`, so a
single "delete client" would otherwise take the audit trail with it. Every FK on
`campaign_log` is `ON DELETE SET NULL`.

### Conservative matching

`campaignAppliesToBoat` returns false rather than guessing when data is missing or
ambiguous — notably when two Mercury serials have different prefixes, even if one is
numerically larger. A missed suggestion is recoverable, since the tech still sees the
full list; a wrong auto-match puts a campaign against the wrong hull and pollutes a
permanent record.

## Surfaces

| Surface | Create / edit | History |
|---|---|---|
| Web dashboard | Two checkboxes in SERVICES; each opens a drawer to add multiple campaigns | Block on client page and each boat |
| Mobile | **No catalog.** Campaigns arrive attached to the boat | Read-only list on boat and job |
| Portal | No create flow, mirroring paperwork blocks | Owner sees completed campaigns and dates, never instructions |

**The tech never picks a campaign.** Selection is an office task. Removing the catalog
from the field app is the single biggest simplification: someone on a swim platform in
the rain should be reading instructions and shooting photos, not browsing a bulletin list.

**Instructions become a checklist on mobile only.** On a phone a wall of text gets
skimmed, whereas ticked steps survive interruption — which is the normal case on a dock.
On the web the same content is a scrollable panel.

**Photos** reuse `report_photos` (nullable `report_id`, new `campaign_log_id` and
`job_id`), so campaign photos ride the existing `report-photos` bucket, upload path and
`expo-sqlite` offline queue rather than standing up a second photo system.

**Completion is gated** on at least one photo and a written finding — the two things
whose absence gets a claim rejected. `completionBlocker()` is the single source of that
rule and is unit-tested.

## Implementation status

### Phase 1 — built

- Migration `043_service_campaigns.sql`: both tables, engine serial columns,
  `report_photos` extension, freeze + immutability triggers, location-scoped RLS.
- `lib/campaigns/constants.ts` — shared `SERVICE_TYPE_OPTIONS`, previously duplicated
  in `create-job-form.tsx` and `job-editor.tsx`. Both now import it.
- `lib/campaigns/matching.ts` — matching, compensated-hours math, completion gate,
  hours variance. 41 unit tests.
- `lib/campaigns/queries.ts` — catalog reads, attach-to-job, backfill, entry updates.
- `components/campaigns/CampaignDrawer.tsx` — the drawer in the SERVICES list.
- Wired into Create Job; campaigns attach after the job row exists.

### Phase 2 — not built

Settings catalog page (`/dashboard/work-orders/settings`), with the two
manufacturer-specific entry forms and the **apply-to-boats** step that creates one
task per affected boat and allows marking any as already completed (backfill).

### Phase 3 — not built

Mobile: campaigns on the job detail, the working screen (checklist, camera, findings,
hours), offline queue integration.

### Phase 4 — not built

History blocks on client and boat pages, portal read-only mirror, campaigns on the
work-order PDF, compensated-vs-actual variance report.

## Open decisions

1. **Claim tracking.** `claim_number` and `claim_status` exist on the table but nothing
   writes them yet. Confirm whether the log should track a claim through to *paid*.
2. **Photo gate hard or soft.** Currently specified as hard. Could be a warning the
   tech may override.
3. **Seeding.** Whether to load currently-tracked campaigns or ship an empty catalog.

## Known issues

- `create-job-form.tsx` carries 14 pre-existing `react-hooks/rules-of-hooks` lint
  errors on `main`; this change adds a 15th `useState` in the same block. Not a
  regression in kind, but the file wants a separate fix.
- Migration numbered **043** deliberately: prod has applied `040_quo_activity_secrets_rpc`
  and `041_quo_activity_log_cron`, and two open draft PRs both claim 040/041/042.
