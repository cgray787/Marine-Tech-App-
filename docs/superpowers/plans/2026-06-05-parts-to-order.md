# Parts-to-Order System — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the parts a technician enters in the mobile service form into a new `parts` table, and surface them on the admin dashboard in a grouped, highlighted "Parts to Order" section with a Need-to-order ⇄ Ordered toggle and real-time updates.

**Architecture:** New `public.parts` table (org-scoped, RLS, org_id set server-side by trigger). Mobile `handleSubmitOnline` inserts parts after the service report is saved (reusing the existing `uploadPhoto` helper); offline path mirrors the existing checklist-item queue. Dashboard server-fetches parts grouped Customer→Boat and renders a client toggle that flips status; the existing RealtimeRefresh keeps it live.

**Tech Stack:** Supabase (Postgres + RLS), React Native/Expo (mobile), Next.js 16 (dashboard), vitest (web unit test).

**Spec:** `docs/superpowers/specs/2026-06-05-parts-to-order-design.md`

**Known constants / reuse:**
- Supabase project ref: `ikfcnqdrlvhvlyhiuphs`
- JBY org id: `e22d5492-3ec1-4d5c-9118-b2eba8880586`
- Reuse mobile `uploadPhoto(uri, bucket, reportId, category)` → returns public URL or null (`mobile/app/(tabs)/service.tsx:453`). Bucket: `"report-photos"`.
- Mobile `Part` type (`mobile/app/(tabs)/service.tsx:154`): `{ name, qty, partNum, ordered, photo?, supplier, url }`.
- Existing helper `public.current_profile_id()`; we add `public.current_profile_org()`.

**Working branch:** commit directly to `main` (repo workflow). Push after each task.

---

## File Structure

- `supabase/migrations/025_parts.sql` — parts table, `current_profile_org()`, RLS, org-assign trigger.
- `mobile/app/(tabs)/service.tsx` — add `description` to `Part` + UI; persist parts on submit (online); offline collect.
- `mobile/lib/offline-db.ts` — `pending_parts` table + `savePendingParts`.
- `mobile/lib/sync-service.ts` — replay `parts` on sync.
- `lib/dashboard/parts.ts` — pure `groupPartsByCustomerBoat()` helper (web).
- `__tests__/dashboard/parts.test.ts` — vitest unit test for the helper.
- `app/dashboard/page.tsx` — fetch parts, render section + KPI card, add `parts` to realtime.
- `components/dashboard/parts-to-order.tsx` — client component: grouped render + status toggle.

---

## Task 1: Migration — `parts` table + RLS + org trigger

**Files:** Create `supabase/migrations/025_parts.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 025_parts.sql
-- Parts a technician needs ordered for a service job. Surfaced on the dashboard
-- "Parts to Order" section. org_id is set server-side (cannot be client-supplied).

create table if not exists public.parts (
  id                 uuid primary key default gen_random_uuid(),
  service_report_id  uuid references public.service_reports(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete set null,
  customer_id        uuid references public.customers(id) on delete set null,
  boat_id            uuid references public.boats(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  org_id             uuid references public.organizations(id) on delete set null,
  name               text not null,
  part_number        text,
  quantity           integer not null default 1,
  description        text,
  supplier           text,
  url                text,
  photo_url          text,
  status             text not null default 'need_to_order'
                       check (status in ('need_to_order','ordered')),
  ordered_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists parts_status_idx on public.parts (status);
create index if not exists parts_customer_idx on public.parts (customer_id);
create index if not exists parts_org_idx on public.parts (org_id);

-- Caller's org (SECURITY DEFINER so RLS policies can use it without recursion).
create or replace function public.current_profile_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where auth_id = auth.uid();
$$;

-- Assign org_id from the inserting tech's profile; never trust a client value.
create or replace function public.set_part_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.org_id := public.current_profile_org();
  return new;
end;
$$;

drop trigger if exists set_part_org_before_insert on public.parts;
create trigger set_part_org_before_insert
  before insert on public.parts
  for each row execute function public.set_part_org();

alter table public.parts enable row level security;

-- Read: anyone in the same org (admins included via their own org).
drop policy if exists parts_select on public.parts;
create policy parts_select on public.parts
  for select to authenticated
  using (org_id = public.current_profile_org() or public.is_admin());

-- Insert: the authenticated tech creates parts as themselves (org set by trigger).
drop policy if exists parts_insert on public.parts;
create policy parts_insert on public.parts
  for insert to authenticated
  with check (created_by = public.current_profile_id());

-- Update (status toggle): same-org users or admins.
drop policy if exists parts_update on public.parts;
create policy parts_update on public.parts
  for update to authenticated
  using (org_id = public.current_profile_org() or public.is_admin())
  with check (org_id = public.current_profile_org() or public.is_admin());

-- Delete (edit-mode re-sync from mobile): the creating tech or an admin.
drop policy if exists parts_delete on public.parts;
create policy parts_delete on public.parts
  for delete to authenticated
  using (created_by = public.current_profile_id() or public.is_admin());

revoke all on function public.current_profile_org() from public, anon;
grant execute on function public.current_profile_org() to authenticated;
```

- [ ] **Step 2: Apply via Supabase MCP**

`mcp__supabase__apply_migration` with `project_id="ikfcnqdrlvhvlyhiuphs"`, `name="parts"`, SQL above. Expected: `{"success":true}`.

- [ ] **Step 3: Verify table + policies**

`mcp__supabase__execute_sql`:
```sql
select count(*) from public.parts;
select polname from pg_policies where tablename='parts';
```
Expected: count 0; policies `parts_select, parts_insert, parts_update, parts_delete`.

- [ ] **Step 4: Verify org-trigger sets org_id (rolled back)**

`mcp__supabase__execute_sql` (uses a real JBY tech auth_id `b7fb6de2-636e-4419-aae1-1b5a01ec3e8f`, profile `a02cc359-9cb5-49f0-880f-dd86f9236134`):
```sql
do $$
declare r uuid;
begin
  perform set_config('request.jwt.claims','{"sub":"b7fb6de2-636e-4419-aae1-1b5a01ec3e8f"}', true);
  insert into public.parts (created_by, name, org_id)
  values ('a02cc359-9cb5-49f0-880f-dd86f9236134','ZZ test part','00000000-0000-0000-0000-000000000000')
  returning org_id into r;
  raise exception 'ORG_NOW=%', r;
end $$;
```
Expected: error `ORG_NOW=e22d5492-3ec1-4d5c-9118-b2eba8880586` (spoofed org overridden; rolled back).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/025_parts.sql
git commit -m "feat(db): parts table + RLS + org-assign trigger for parts-to-order"
git push origin main
```

---

## Task 2: Mobile — add `description` to the part entry

**Files:** Modify `mobile/app/(tabs)/service.tsx`

- [ ] **Step 1: Add `description` to the `Part` type** (`mobile/app/(tabs)/service.tsx:154`)

```ts
  type Part = {
    name: string;
    qty: number;
    partNum: string;
    ordered: boolean;
    photo?: string;
    supplier: string;
    url: string;
    description: string;
  };
```

- [ ] **Step 2: Default `description` when a new part is added**

Find the add-new-part `setParts((prev) => [ ... ])` block (around `mobile/app/(tabs)/service.tsx:1583`). In the new part object literal, add `description: "",` alongside the other defaults (e.g. next to `supplier: "", url: "",`). If the new-part object is built elsewhere too, add it there as well so the field is always present.

- [ ] **Step 3: Add a description input in the expanded part editor**

In the expanded part editor (where `supplier`/`url` inputs render, inside the `parts.map`), add a multiline input below the existing fields:

```tsx
                  <Text style={styles.inputLabel}>Description / details</Text>
                  <TextInput
                    style={[styles.input, { height: 70, textAlignVertical: "top" }]}
                    placeholder="What's wrong / what's needed, location on the boat, etc."
                    placeholderTextColor={colors.textSecondary + "80"}
                    value={part.description}
                    onChangeText={(t) =>
                      setParts((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, description: t } : p))
                      )
                    }
                    multiline
                  />
```
(Match the surrounding `styles.input` / `styles.inputLabel` names already used in that block; if they differ, reuse whatever the adjacent supplier/url inputs use.)

- [ ] **Step 4: Verify it compiles**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app/mobile" && npx tsc --noEmit`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/(tabs)/service.tsx
git commit -m "feat(mobile): add description field to service-form part entries"
git push origin main
```

---

## Task 3: Mobile — persist parts on online submit (new + edit)

**Files:** Modify `mobile/app/(tabs)/service.tsx`

- [ ] **Step 1: Add a `persistParts` helper inside the component** (place it next to `uploadPhoto`, ~`mobile/app/(tabs)/service.tsx:486`)

```ts
  // Insert the current `parts` into the parts table for a saved report.
  // Edit mode: caller deletes existing rows first, then this re-inserts.
  async function persistParts(reportId: string, jobId: string) {
    if (!profile || parts.length === 0) return;
    for (const part of parts) {
      let photoUrl: string | null = null;
      if (part.photo) {
        photoUrl = await uploadPhoto(part.photo, "report-photos", reportId, "part");
      }
      const { error } = await supabase.from("parts").insert({
        service_report_id: reportId,
        job_id: jobId,
        customer_id: customerId || null,
        boat_id: boatId || null,
        created_by: profile.id,
        name: part.name,
        part_number: part.partNum || null,
        quantity: part.qty || 1,
        description: part.description || null,
        supplier: part.supplier || null,
        url: part.url || null,
        photo_url: photoUrl,
        status: part.ordered ? "ordered" : "need_to_order",
        ordered_at: part.ordered ? new Date().toISOString() : null,
      });
      if (error) {
        console.error("Part insert error:", error.message);
        Alert.alert("Parts warning", `A part ("${part.name}") couldn't be saved: ${error.message}`);
      }
    }
  }
```

- [ ] **Step 2: Call it in the EDIT branch (existing report)** — after the checklist/photos re-sync, where `reportId = editReportId;` and existing children are cleared (`mobile/app/(tabs)/service.tsx:622-626`). Add a parts delete next to the existing deletes, then persist after the report is saved:

In the block that does:
```ts
        await supabase.from("checklist_items").delete().eq("report_id", reportId);
        await supabase.from("report_photos").delete().eq("report_id", reportId);
```
add:
```ts
        await supabase.from("parts").delete().eq("service_report_id", reportId);
```
Then, just before the EDIT branch finishes inserting checklist/photos (after `reportId` and `jobId` are both known — i.e. at the end of the `isEditing` branch where the report exists), call:
```ts
        await persistParts(reportId, jobId);
```

- [ ] **Step 3: Call it in the NEW branch** — after the new `service_reports` insert returns `report.id` and checklist/photos are inserted (`mobile/app/(tabs)/service.tsx:~671` onward). After `reportId`/`jobId` are set, add:
```ts
      await persistParts(reportId, jobId);
```
(Place it alongside the other child inserts so it runs once per submit.)

- [ ] **Step 4: Verify it compiles**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app/mobile" && npx tsc --noEmit`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/(tabs)/service.tsx
git commit -m "feat(mobile): persist service-form parts to parts table on submit (online)"
git push origin main
```

---

## Task 4: Dashboard — Parts to Order section

**Files:**
- Create `lib/dashboard/parts.ts`
- Create (test) `__tests__/dashboard/parts.test.ts`
- Create `components/dashboard/parts-to-order.tsx`
- Modify `app/dashboard/page.tsx`

- [ ] **Step 1: Write the failing test for the grouping helper**

```ts
// __tests__/dashboard/parts.test.ts
import { describe, it, expect } from "vitest";
import { groupPartsByCustomerBoat, type PartRow } from "@/lib/dashboard/parts";

const base: Omit<PartRow, "id" | "name"> = {
  customer_id: "c1", boat_id: "b1", customer_name: "Ron Wood", boat_name: "Axopar 28",
  part_number: null, quantity: 1, description: null, supplier: null, url: null,
  photo_url: null, status: "need_to_order", ordered_at: null,
};

describe("groupPartsByCustomerBoat", () => {
  it("groups parts under customer then boat", () => {
    const groups = groupPartsByCustomerBoat([
      { ...base, id: "p1", name: "Impeller" },
      { ...base, id: "p2", name: "Zinc" },
      { ...base, id: "p3", name: "Filter", boat_id: "b2", boat_name: "Tender" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].customerName).toBe("Ron Wood");
    expect(groups[0].boats).toHaveLength(2);
    expect(groups[0].boats[0].parts.map((p) => p.name)).toEqual(["Impeller", "Zinc"]);
  });

  it("buckets a missing customer under 'Unassigned'", () => {
    const groups = groupPartsByCustomerBoat([
      { ...base, id: "p1", name: "Bolt", customer_id: null, customer_name: null },
    ]);
    expect(groups[0].customerName).toBe("Unassigned");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && npx vitest run __tests__/dashboard/parts.test.ts`
Expected: FAIL — cannot find `@/lib/dashboard/parts`.

- [ ] **Step 3: Implement the helper**

```ts
// lib/dashboard/parts.ts
export type PartStatus = "need_to_order" | "ordered";

export type PartRow = {
  id: string;
  name: string;
  customer_id: string | null;
  boat_id: string | null;
  customer_name: string | null;
  boat_name: string | null;
  part_number: string | null;
  quantity: number;
  description: string | null;
  supplier: string | null;
  url: string | null;
  photo_url: string | null;
  status: PartStatus;
  ordered_at: string | null;
};

export type BoatGroup = { boatId: string; boatName: string; parts: PartRow[] };
export type CustomerGroup = { customerId: string; customerName: string; boats: BoatGroup[] };

export function groupPartsByCustomerBoat(parts: PartRow[]): CustomerGroup[] {
  const customers = new Map<string, CustomerGroup>();
  for (const p of parts) {
    const cId = p.customer_id ?? "__none__";
    const cName = p.customer_name ?? "Unassigned";
    let c = customers.get(cId);
    if (!c) {
      c = { customerId: cId, customerName: cName, boats: [] };
      customers.set(cId, c);
    }
    const bId = p.boat_id ?? "__none__";
    const bName = p.boat_name ?? "No boat";
    let b = c.boats.find((x) => x.boatId === bId);
    if (!b) {
      b = { boatId: bId, boatName: bName, parts: [] };
      c.boats.push(b);
    }
    b.parts.push(p);
  }
  return Array.from(customers.values());
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && npx vitest run __tests__/dashboard/parts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the client section component**

```tsx
// components/dashboard/parts-to-order.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  groupPartsByCustomerBoat,
  type PartRow,
} from "@/lib/dashboard/parts";

export function PartsToOrder({ parts }: { parts: PartRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showOrdered, setShowOrdered] = useState(false);

  const toOrder = parts.filter((p) => p.status === "need_to_order");
  const ordered = parts.filter((p) => p.status === "ordered");
  const groups = groupPartsByCustomerBoat(toOrder);

  async function setStatus(id: string, status: "need_to_order" | "ordered") {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("parts")
      .update({
        status,
        ordered_at: status === "ordered" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    setBusyId(null);
    if (!error) router.refresh();
  }

  return (
    <div className="mt-6 rounded-xl border border-border-line bg-card-bg">
      <div className="flex items-center justify-between border-b border-border-line px-6 py-4">
        <h2 className="font-semibold text-text-primary">
          Parts to Order{" "}
          <span className="ml-1 rounded-full bg-gold-muted px-2 py-0.5 text-xs font-medium text-gold">
            {toOrder.length}
          </span>
        </h2>
        {ordered.length > 0 && (
          <button
            onClick={() => setShowOrdered((v) => !v)}
            className="text-sm text-gold hover:text-gold-hover"
          >
            {showOrdered ? "Hide" : "Show"} ordered ({ordered.length})
          </button>
        )}
      </div>

      <div className="p-4">
        {toOrder.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-text-secondary">
            No parts to order right now.
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((c) => (
              <div key={c.customerId}>
                <p className="mb-2 text-sm font-semibold text-text-primary">
                  {c.customerName}
                </p>
                {c.boats.map((b) => (
                  <div key={b.boatId} className="mb-3">
                    <p className="mb-1.5 text-xs uppercase tracking-wide text-text-secondary">
                      {b.boatName}
                    </p>
                    <div className="space-y-2">
                      {b.parts.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-gold/40 bg-gold-muted px-4 py-3"
                        >
                          <div className="flex items-start gap-3">
                            {p.photo_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.photo_url}
                                alt={p.name}
                                className="h-12 w-12 rounded object-cover"
                              />
                            )}
                            <div>
                              <p className="text-sm font-medium text-gold">
                                {p.quantity > 1 ? `${p.quantity}× ` : ""}
                                {p.name}
                                {p.part_number ? ` · #${p.part_number}` : ""}
                              </p>
                              {p.description && (
                                <p className="mt-0.5 text-xs text-text-secondary">
                                  {p.description}
                                </p>
                              )}
                              {p.supplier && (
                                <p className="mt-0.5 text-xs text-text-secondary">
                                  {p.url ? (
                                    <a
                                      href={p.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-gold hover:underline"
                                    >
                                      {p.supplier}
                                    </a>
                                  ) : (
                                    p.supplier
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setStatus(p.id, "ordered")}
                            disabled={busyId === p.id}
                            className="shrink-0 rounded-lg border border-gold px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold/20 disabled:opacity-50"
                          >
                            Need to order
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {showOrdered && ordered.length > 0 && (
          <div className="mt-5 border-t border-border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Ordered
            </p>
            <div className="space-y-2">
              {ordered.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-line px-4 py-2"
                >
                  <p className="text-sm text-text-secondary line-through">
                    {p.customer_name ?? "Unassigned"} · {p.boat_name ?? "No boat"} ·{" "}
                    {p.name}
                  </p>
                  <button
                    onClick={() => setStatus(p.id, "need_to_order")}
                    disabled={busyId === p.id}
                    className="shrink-0 rounded-lg border border-border-line px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
                  >
                    Ordered
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire the dashboard page** (`app/dashboard/page.tsx`)

(a) Add the import near the top:
```tsx
import { PartsToOrder } from "@/components/dashboard/parts-to-order";
import type { PartRow } from "@/lib/dashboard/parts";
```

(b) Add a parts fetch to the `Promise.all([...])` array (append before the closing `]`):
```tsx
    supabase
      .from("parts")
      .select("id, name, customer_id, boat_id, part_number, quantity, description, supplier, url, photo_url, status, ordered_at, customers:customer_id(name), boats:boat_id(name)")
      .order("created_at", { ascending: false }),
```
and add `{ data: partsRaw }` as the matching destructured entry at the end of the destructure list.

(c) Normalize the joined rows into `PartRow[]` just before `return (`:
```tsx
  const partsList: PartRow[] = (partsRaw ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    customer_id: p.customer_id,
    boat_id: p.boat_id,
    customer_name: ((p.customers as unknown) as { name: string } | null)?.name ?? null,
    boat_name: ((p.boats as unknown) as { name: string } | null)?.name ?? null,
    part_number: p.part_number,
    quantity: p.quantity,
    description: p.description,
    supplier: p.supplier,
    url: p.url,
    photo_url: p.photo_url,
    status: p.status,
    ordered_at: p.ordered_at,
  }));
  const partsToOrderCount = partsList.filter((p) => p.status === "need_to_order").length;
```

(d) Add a 5th KPI card to the `stats` array:
```tsx
    {
      label: "Parts to Order",
      value: partsToOrderCount,
      color: "text-gold",
      bg: "bg-gold-muted",
    },
```
and change the stats grid to 5 columns: `lg:grid-cols-4` → `lg:grid-cols-5` on the stats `<div>` (`app/dashboard/page.tsx:82`).

(e) Add `parts` to RealtimeRefresh (`app/dashboard/page.tsx:73`):
```tsx
      <RealtimeRefresh tables={["jobs", "service_reports", "pdi_reports", "parts"]} />
```

(f) Render the section after the Recent Activity grid (just before the final closing `</div>` of the page):
```tsx
      <PartsToOrder parts={partsList} />
```

- [ ] **Step 7: Typecheck + run web tests**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && npx tsc --noEmit && npx vitest run __tests__/dashboard/parts.test.ts`
Expected: tsc `EXIT=0`; vitest 2 passed.

- [ ] **Step 8: Commit**

```bash
git add lib/dashboard/parts.ts __tests__/dashboard/parts.test.ts components/dashboard/parts-to-order.tsx app/dashboard/page.tsx
git commit -m "feat(dashboard): Parts to Order section (grouped, toggle, KPI, realtime)"
git push origin main
```

---

## Task 5: Mobile — offline parts persistence

**Files:**
- Modify `mobile/lib/offline-db.ts`
- Modify `mobile/lib/sync-service.ts`
- Modify `mobile/app/(tabs)/service.tsx`

- [ ] **Step 1: Add a `pending_parts` table + saver in `offline-db.ts`**

In the schema-creation block (next to `pending_checklist_items`, ~`mobile/lib/offline-db.ts:44`):
```sql
    CREATE TABLE IF NOT EXISTS pending_parts (
      id TEXT PRIMARY KEY,
      report_id TEXT,
      name TEXT,
      part_number TEXT,
      quantity INTEGER,
      description TEXT,
      supplier TEXT,
      url TEXT,
      photo_uri TEXT,
      ordered INTEGER
    );
```
Add an exported saver (mirror `savePendingChecklistItems`):
```ts
export async function savePendingParts(
  offlineReportId: string,
  parts: {
    name: string; partNum: string; quantity: number; description: string;
    supplier: string; url: string; photoUri: string | null; ordered: boolean;
  }[]
) {
  const db = await getDb();
  for (const p of parts) {
    const id = `part_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.runAsync(
      `INSERT INTO pending_parts (id, report_id, name, part_number, quantity, description, supplier, url, photo_uri, ordered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, offlineReportId, p.name, p.partNum, p.quantity, p.description, p.supplier, p.url, p.photoUri, p.ordered ? 1 : 0]
    );
    await db.runAsync(
      `INSERT INTO sync_queue (table_name, record_id, action, payload) VALUES (?, ?, ?, ?)`,
      ["parts", id, "insert", JSON.stringify({ _offline_report_id: offlineReportId, ...p })]
    );
  }
}
```
(Match the exact `getDb`/`runAsync` accessors and `sync_queue` column names used by the adjacent savers in this file.)

- [ ] **Step 2: Add a `parts` replay case in `sync-service.ts`**

In the `switch` over `table_name` (next to the `checklist_items` case, ~`mobile/lib/sync-service.ts:173`), add:
```ts
      case "parts": {
        const realReportId = payload._offline_report_id
          ? idMap.get(payload._offline_report_id) ?? payload._offline_report_id
          : payload.report_id;
        if (payload._offline_report_id && !idMap.has(payload._offline_report_id)) {
          return { ok: false, error: `Parent report ${payload._offline_report_id} not yet synced` };
        }
        let photoUrl: string | null = null;
        if (payload.photoUri) {
          photoUrl = await uploadPhotoToStorage(payload.photoUri, "report-photos", realReportId);
        }
        const { error } = await supabase.from("parts").insert({
          service_report_id: realReportId,
          name: payload.name,
          part_number: payload.partNum || null,
          quantity: payload.quantity || 1,
          description: payload.description || null,
          supplier: payload.supplier || null,
          url: payload.url || null,
          photo_url: photoUrl,
          status: payload.ordered ? "ordered" : "need_to_order",
          ordered_at: payload.ordered ? new Date().toISOString() : null,
          created_by: payload.tech_id ?? null,
        });
        if (error) {
          console.error("[Sync] Part insert error:", error);
          return { ok: false, error: error.message };
        }
        return { ok: true };
      }
```
(Use the file's existing photo-upload helper — the function at `mobile/lib/sync-service.ts:31`; match its real name and signature. `created_by` may be omitted if the sync context lacks a tech id — leave null; the dashboard still groups by customer/boat which come via service_report_id linkage on read. NOTE: parts insert RLS requires `created_by = current_profile_id()`; during sync the user IS the tech, so set `created_by` to the tech's profile id if available in the sync payload — include `tech_id` in the queued payload in Step 3.)

- [ ] **Step 3: Save parts in `handleSubmitOffline`** (`mobile/app/(tabs)/service.tsx:488`)

After `savePendingReport({...})` resolves and returns the offline report id (capture its return value as `offlineReportId`), add:
```ts
      await savePendingParts(offlineReportId, parts.map((p) => ({
        name: p.name, partNum: p.partNum, quantity: p.qty || 1, description: p.description || "",
        supplier: p.supplier || "", url: p.url || "", photoUri: p.photo ?? null, ordered: p.ordered,
        tech_id: profile.id,
      })));
```
Add `import { savePendingParts } from "@/lib/offline-db";` (or extend the existing offline-db import). If `savePendingReport` doesn't currently return the offline id, capture the id it generates (inspect its implementation) and thread it through; include `tech_id` in each queued part payload so sync can set `created_by`.

- [ ] **Step 4: Verify compile**

Run: `cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app/mobile" && npx tsc --noEmit`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/offline-db.ts mobile/lib/sync-service.ts mobile/app/(tabs)/service.tsx
git commit -m "feat(mobile): queue + sync service-form parts when submitted offline"
git push origin main
```

---

## Task 6: End-to-end verification (online path)

- [ ] **Step 1: Insert a part as a tech (simulated), confirm it surfaces**

`mcp__supabase__execute_sql` — create a part tied to an existing JBY customer/boat via a real service_report, OR directly:
```sql
insert into public.parts (created_by, customer_id, name, part_number, quantity, description, status)
values ('a02cc359-9cb5-49f0-880f-dd86f9236134',
        (select id from public.customers where org_id='e22d5492-3ec1-4d5c-9118-b2eba8880586' limit 1),
        'ZZ Test Impeller','IMP-123',2,'Raw water pump impeller','need_to_order')
returning id;
```
(Note: org_id auto-set by trigger only fires under a JWT; for a service-role insert set org_id explicitly:)
```sql
update public.parts set org_id='e22d5492-3ec1-4d5c-9118-b2eba8880586' where name='ZZ Test Impeller';
```

- [ ] **Step 2: Confirm on the dashboard**

Open `https://marine-tech-dashboard.connorgray41.workers.dev/dashboard` → the "Parts to Order" section shows the test part under its customer/boat, highlighted; KPI card shows ≥1. Click **Need to order** → it moves to the Ordered sub-list.

- [ ] **Step 3: Clean up**

```sql
delete from public.parts where name = 'ZZ Test Impeller';
```

- [ ] **Step 4: Deploy the dashboard**

```bash
cd "/Users/connorgray/Desktop/Claude OS/marine-tech-app" && npm run deploy
```
Expected: `Deployed marine-tech-dashboard`.

---

## Self-Review notes

- **Spec coverage:** parts table + RLS + org trigger (Task 1); description field (Task 2); online persistence incl. photo + edit re-sync (Task 3); dashboard grouped/highlighted section + toggle + Ordered sub-list + count badge + KPI + realtime (Task 4); offline path (Task 5); e2e + deploy (Task 6). Email/push explicitly Phase 2/3 (out of scope here).
- **Type consistency:** `PartRow` (lib/dashboard/parts.ts) is the single shared type used by the helper, test, component, and page normalization. Mobile `Part` gains `description` (Task 2) used by Tasks 3 & 5.
- **Known follow-ups to confirm during execution:** exact `styles.input` names in the mobile part editor (Task 2 Step 3); `savePendingReport` return value / offline id threading and the sync-service upload-helper name (Task 5) — verify against the real files before finalizing those edits.
```
