# Work Orders Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native Work Orders module in the web dashboard — priced, customer-facing work orders with job sections, line items, margins, stacked taxes, CC fee, payments, print view, and a template catalog — per `docs/superpowers/specs/2026-06-12-work-orders-design.md`.

**Architecture:** New migration `033_work_orders.sql` (6 tables + RLS + seeds), a pure money-math module `lib/work-orders/totals.ts` (unit-tested, the only nontrivial logic), and App-Router pages under `app/dashboard/work-orders/` following existing dashboard conventions: server components fetch via `requireAdmin()`, client components mutate with the browser Supabase client + `router.refresh()`, `RealtimeRefresh` for live updates.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, Supabase (RLS), Radix Dialog, vitest.

**Conventions to follow (from codebase):**
- Server page: `const { supabase, profile } = await requireAdmin();` then parallel fetches.
- Mutations: `"use client"` components, `createClient()` from `@/lib/supabase/client`, then `router.refresh()`. No server actions.
- Write gating for THIS module: `role === "admin" || role === "manager"` (NOT `canWrite()` — that includes tech). Viewers see everything except unit costs / margin / profit.
- Styling: `rounded-xl border border-border-line bg-card-bg`, gold accent `text-gold`, badges via `statusColor()`.
- Migrations are applied with `mcp__supabase__apply_migration` (name without `.sql`), then the same SQL is committed to `supabase/migrations/`.
- Commit after every task; push to origin main at the end of every task (per Connor's always-push rule).

---

### Task 1: Migration `033_work_orders.sql` — schema, RLS, seeds

**Files:**
- Create: `supabase/migrations/033_work_orders.sql`

- [ ] **Step 1: Write the migration file** with exactly this content:

```sql
-- 033_work_orders.sql
-- Work Orders module: price levels, job templates, settings, work orders,
-- job sections, lines, payments. Spec: docs/superpowers/specs/2026-06-12-work-orders-design.md
-- Writes: admin + manager only (NOT tech). Reads: admins all, others location-scoped.

create sequence if not exists public.work_order_number_seq start 1001;

create table public.price_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  name text not null,
  rate numeric(10,2) not null default 0,
  unit text not null default 'hour' check (unit in ('hour','foot')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.job_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  name text not null,
  description text,
  notes_to_tech text,
  default_hours numeric(6,2),
  default_price_level_id uuid references public.price_levels(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.wo_settings (
  org_id uuid primary key references public.orgs(id),
  shop_supplies_amount numeric(10,2) not null default 75.00,
  default_margin_pct numeric(5,2) not null default 25.00,
  default_cc_fee_pct numeric(5,2) not null default 3.00,
  default_taxes jsonb not null default '[{"name":"WA Sales Tax","rate_pct":10.35}]'::jsonb
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  wo_number int unique not null default nextval('public.work_order_number_seq'),
  org_id uuid not null references public.orgs(id),
  location_id uuid references public.locations(id),
  customer_id uuid not null references public.customers(id) on delete restrict,
  boat_id uuid references public.boats(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','approved','completed','invoiced')),
  service_advisor uuid references public.profiles(id),
  wo_date date not null default current_date,
  default_margin_pct numeric(5,2) not null default 25.00,
  taxes jsonb not null default '[]'::jsonb,
  cc_fee_pct numeric(5,2),
  printed_notes text,
  internal_notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  invoiced_at timestamptz
);
create index work_orders_customer_idx on public.work_orders(customer_id);
create index work_orders_status_idx on public.work_orders(status);

create table public.work_order_jobs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  position int not null default 0,
  title text not null,
  description text,
  notes_to_tech text,
  cause text,
  correction text,
  customer_status text not null default 'estimate' check (customer_status in ('estimate','approved')),
  job_status text not null default 'open' check (job_status in ('open','awaiting_customer','in_progress','done')),
  job_type text not null default 'frh' check (job_type in ('frh','flat','per_foot')),
  price_level_id uuid references public.price_levels(id) on delete set null,
  hours numeric(6,2),
  flat_price numeric(10,2),
  boat_length_ft numeric(5,1),
  labor_taxable boolean not null default true,
  assigned_tech uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index wo_jobs_wo_idx on public.work_order_jobs(work_order_id);

create table public.work_order_lines (
  id uuid primary key default gen_random_uuid(),
  work_order_job_id uuid not null references public.work_order_jobs(id) on delete cascade,
  kind text not null check (kind in ('part','shop_supplies','shipping','flat_service','other')),
  item_code text,
  description text,
  qty numeric(8,2) not null default 1,
  unit_cost numeric(10,2) not null default 0,
  margin_pct numeric(5,2),
  taxable boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index wo_lines_job_idx on public.work_order_lines(work_order_job_id);

create table public.work_order_payments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  paid_on date not null default current_date,
  method text,
  note text,
  amount numeric(10,2) not null,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index wo_payments_wo_idx on public.work_order_payments(work_order_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Helper: only admin + manager may write work-order data (viewer and tech
-- are read-only here; pricing/margins are office business).
create or replace function public.wo_can_edit() returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles
    where auth_id = auth.uid() and role in ('admin','manager')
  );
$$;
revoke all on function public.wo_can_edit() from public, anon;
grant execute on function public.wo_can_edit() to authenticated;

alter table public.price_levels enable row level security;
alter table public.job_templates enable row level security;
alter table public.wo_settings enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_jobs enable row level security;
alter table public.work_order_lines enable row level security;
alter table public.work_order_payments enable row level security;

-- Reference data: all authenticated org members read; admin/manager write.
do $$
declare t text;
begin
  foreach t in array array['price_levels','job_templates','wo_settings'] loop
    execute format('create policy %I_read on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.wo_can_edit()) with check (public.wo_can_edit())', t, t);
  end loop;
end $$;

-- Work orders: admins read all; everyone else reads own-location WOs.
create policy wo_read on public.work_orders for select to authenticated
  using (public.is_admin() or location_id = public.current_profile_location());
create policy wo_write on public.work_orders for all to authenticated
  using (public.wo_can_edit()) with check (public.wo_can_edit());

-- Children follow the parent WO's visibility.
create policy wo_jobs_read on public.work_order_jobs for select to authenticated
  using (exists (select 1 from public.work_orders w where w.id = work_order_id
    and (public.is_admin() or w.location_id = public.current_profile_location())));
create policy wo_jobs_write on public.work_order_jobs for all to authenticated
  using (public.wo_can_edit()) with check (public.wo_can_edit());

create policy wo_lines_read on public.work_order_lines for select to authenticated
  using (exists (select 1 from public.work_order_jobs j join public.work_orders w on w.id = j.work_order_id
    where j.id = work_order_job_id
    and (public.is_admin() or w.location_id = public.current_profile_location())));
create policy wo_lines_write on public.work_order_lines for all to authenticated
  using (public.wo_can_edit()) with check (public.wo_can_edit());

create policy wo_payments_read on public.work_order_payments for select to authenticated
  using (exists (select 1 from public.work_orders w where w.id = work_order_id
    and (public.is_admin() or w.location_id = public.current_profile_location())));
create policy wo_payments_write on public.work_order_payments for all to authenticated
  using (public.wo_can_edit()) with check (public.wo_can_edit());

-- ── Seeds ────────────────────────────────────────────────────────────────
do $$
declare
  v_org uuid;
  v_pl uuid;
begin
  select id into v_org from public.orgs limit 1;
  if v_org is null then return; end if;

  insert into public.wo_settings (org_id) values (v_org) on conflict do nothing;

  insert into public.price_levels (org_id, name, rate, unit)
  values (v_org, 'Seattle - Standard Pricing', 175.00, 'hour')
  returning id into v_pl;

  insert into public.job_templates (org_id, name, description, default_hours, default_price_level_id) values
    (v_org, 'Engine Service 100 Hour 200 HP V6 2025', 'Single - 100 Hour - 200 HP V6 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 250 R V8 2025', 'Single - 100 Hour - 250 R V8 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 300 HP V8 2025', 'Single - 100 Hour - 300 HP V8 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 350 HP L6 2025', 'Single - 100 Hour - 350 HP L6 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 350/400 HP V10 2025', 'Single - 100 Hour 350/450 HP V10 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 100 Hour 450 R V8 2025', 'Single - 100 Hour - 450 R V8 Engine Service', 2.50, v_pl),
    (v_org, 'Engine Service 300 Hour 200 HP V6 2025', 'Single - 300 Hour - 200 HP V6 Engine Service', 5.00, v_pl),
    (v_org, 'Engine Service 300 Hour 250 R V8 2025', 'Single - 300 Hour - 250R V8 Engine Service', 5.00, v_pl),
    (v_org, 'Engine Service 300 Hour 300 HP V8 2025', 'Single - 300 Hour - 300HP V8 Engine Service', 5.00, v_pl),
    (v_org, 'Engine Service 300 Hour 350 HP L6 2025', 'Single - 300 Hour - 350 HP L6 Engine Service', 5.00, v_pl),
    (v_org, '28 Axopar Ceramic Coat', 'Top side Ceramic Coat applied to boat - 28', 20.00, v_pl),
    (v_org, '37 Axopar Ceramic Coat', 'Top side Ceramic Coat applied to boat - 37', 28.00, v_pl),
    (v_org, 'Travel Fee', 'Travel to/from vessel', 2.00, v_pl),
    (v_org, 'Install Transducer', 'Transducer install', 8.00, v_pl),
    (v_org, 'Boat Wash', 'Exterior boat wash', 1.00, v_pl);
end $$;
```

- [ ] **Step 2: Apply to prod** via `mcp__supabase__apply_migration` (project `ikfcnqdrlvhvlyhiuphs`, name `033_work_orders`, query = file contents).

- [ ] **Step 3: Verify** with `mcp__supabase__execute_sql`:
```sql
SELECT (SELECT count(*) FROM job_templates) AS templates,
       (SELECT count(*) FROM price_levels) AS levels,
       (SELECT count(*) FROM wo_settings) AS settings;
```
Expected: `templates=15, levels=1, settings=1`.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/033_work_orders.sql
git commit -m "feat(wo): work orders schema, RLS, seeds (migration 033)"
```

---

### Task 2: Types + money math (TDD)

**Files:**
- Create: `lib/work-orders/types.ts`
- Create: `lib/work-orders/totals.ts`
- Test: `__tests__/work-orders/totals.test.ts`

- [ ] **Step 1: Create `lib/work-orders/types.ts`** — DB row types used across the module:

```ts
export type WOStatus = "draft" | "approved" | "completed" | "invoiced";
export type JobType = "frh" | "flat" | "per_foot";
export type LineKind = "part" | "shop_supplies" | "shipping" | "flat_service" | "other";
export type CustomerStatus = "estimate" | "approved";
export type WOJobStatus = "open" | "awaiting_customer" | "in_progress" | "done";

export interface TaxEntry { name: string; rate_pct: number; }

export interface PriceLevel {
  id: string; name: string; rate: number; unit: "hour" | "foot"; active: boolean;
}

export interface JobTemplate {
  id: string; name: string; description: string | null; notes_to_tech: string | null;
  default_hours: number | null; default_price_level_id: string | null; active: boolean;
}

export interface WOSettings {
  org_id: string; shop_supplies_amount: number; default_margin_pct: number;
  default_cc_fee_pct: number; default_taxes: TaxEntry[];
}

export interface WOLine {
  id: string; work_order_job_id: string; kind: LineKind; item_code: string | null;
  description: string | null; qty: number; unit_cost: number; margin_pct: number | null;
  taxable: boolean; position: number;
}

export interface WOJob {
  id: string; work_order_id: string; position: number; title: string;
  description: string | null; notes_to_tech: string | null; cause: string | null;
  correction: string | null; customer_status: CustomerStatus; job_status: WOJobStatus;
  job_type: JobType; price_level_id: string | null; hours: number | null;
  flat_price: number | null; boat_length_ft: number | null; labor_taxable: boolean;
  assigned_tech: string | null;
  price_levels?: PriceLevel | null;            // joined
  work_order_lines?: WOLine[];                 // joined
  profiles?: { full_name: string } | null;     // joined assigned tech
}

export interface WOPayment {
  id: string; work_order_id: string; paid_on: string; method: string | null;
  note: string | null; amount: number;
}

export interface WorkOrderFull {
  id: string; wo_number: number; status: WOStatus; customer_id: string;
  boat_id: string | null; location_id: string | null; service_advisor: string | null;
  wo_date: string; default_margin_pct: number; taxes: TaxEntry[];
  cc_fee_pct: number | null; printed_notes: string | null; internal_notes: string | null;
  approved_at: string | null; completed_at: string | null; invoiced_at: string | null;
  customers?: { id: string; name: string; email: string | null; phone: string | null } | null;
  boats?: { id: string; name: string; make_model: string | null; year: number | null; hin: string | null } | null;
  profiles?: { full_name: string } | null;     // joined advisor
  work_order_jobs?: WOJob[];
  work_order_payments?: WOPayment[];
  locations?: { name: string } | null;
}
```

- [ ] **Step 2: Write the failing test** `__tests__/work-orders/totals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeTotals, laborForJob, linePrice, type TotalsJob } from "@/lib/work-orders/totals";

const rate175 = { rate: 175, unit: "hour" as const };

function job(over: Partial<TotalsJob> = {}): TotalsJob {
  return {
    job_type: "frh", hours: 8, flat_price: null, boat_length_ft: null,
    rate: 175, rate_unit: "hour", labor_taxable: true, lines: [], ...over,
  };
}

describe("laborForJob", () => {
  it("frh = hours x rate", () => expect(laborForJob(job())).toBe(1400));
  it("flat = flat_price", () =>
    expect(laborForJob(job({ job_type: "flat", flat_price: 1850 }))).toBe(1850));
  it("per_foot = length x rate", () =>
    expect(laborForJob(job({ job_type: "per_foot", boat_length_ft: 28, rate: 10 }))).toBe(280));
  it("missing inputs => 0", () =>
    expect(laborForJob(job({ hours: null }))).toBe(0));
});

describe("linePrice", () => {
  it("part uses default margin when line margin null", () =>
    expect(linePrice({ kind: "part", qty: 1, unit_cost: 1386.24, margin_pct: null, taxable: true }, 25)).toBe(1732.8));
  it("line margin overrides default", () =>
    expect(linePrice({ kind: "part", qty: 1, unit_cost: 100, margin_pct: 0, taxable: true }, 25)).toBe(100));
  it("non-part kinds get no default margin", () =>
    expect(linePrice({ kind: "shipping", qty: 1, unit_cost: 51.98, margin_pct: null, taxable: true }, 25)).toBe(51.98));
  it("non-part respects explicit margin", () =>
    expect(linePrice({ kind: "other", qty: 2, unit_cost: 50, margin_pct: 10, taxable: true }, 25)).toBe(110));
});

describe("computeTotals — WO-4505 shape", () => {
  // Job 1: Install Transducer 8h@175 + part (cost 1386.24, 25% => 1732.80)
  //        + shop supplies 75 + shipping 51.98. Job 2: Travel 2h@175.
  const jobs: TotalsJob[] = [
    job({
      lines: [
        { kind: "part", qty: 1, unit_cost: 1386.24, margin_pct: null, taxable: true },
        { kind: "shop_supplies", qty: 1, unit_cost: 75, margin_pct: null, taxable: true },
        { kind: "shipping", qty: 1, unit_cost: 51.98, margin_pct: null, taxable: true },
      ],
    }),
    job({ hours: 2 }),
  ];

  it("rolls up charges by category and computes due/paid/balance", () => {
    const t = computeTotals({
      jobs, default_margin_pct: 25,
      taxes: [{ name: "Sales Tax", rate_pct: 7.5 }],
      cc_fee_pct: 3, payments: [1915.61],
    });
    expect(t.totalLabor).toBe(1750);
    expect(t.totalParts).toBe(1732.8);
    expect(t.shopSupplies).toBe(75);
    expect(t.shipping).toBe(51.98);
    expect(t.subtotal).toBe(3609.78);
    expect(t.taxLines).toEqual([{ name: "Sales Tax", rate_pct: 7.5, amount: 270.73 }]);
    expect(t.ccFee).toBe(116.42);          // 3% of (subtotal + tax)
    expect(t.amountDue).toBe(3996.93);
    expect(t.amountPaid).toBe(1915.61);
    expect(t.balanceDue).toBe(2081.32);
    expect(t.profit).toBe(346.56);         // 1732.80 - 1386.24
  });

  it("stacks multiple taxes on the same base", () => {
    const t = computeTotals({
      jobs: [job({ hours: 1 })], default_margin_pct: 25,
      taxes: [{ name: "WA", rate_pct: 6.5 }, { name: "Seattle", rate_pct: 3.85 }],
      cc_fee_pct: null, payments: [],
    });
    expect(t.taxLines.map((x) => x.amount)).toEqual([11.38, 6.74]);
    expect(t.amountDue).toBe(193.12);
  });

  it("excludes non-taxable lines and non-taxable labor from the tax base", () => {
    const t = computeTotals({
      jobs: [job({
        labor_taxable: false, hours: 1,
        lines: [{ kind: "other", qty: 1, unit_cost: 100, margin_pct: null, taxable: false }],
      })],
      default_margin_pct: 25, taxes: [{ name: "Tax", rate_pct: 10 }],
      cc_fee_pct: null, payments: [],
    });
    expect(t.subtotal).toBe(275);
    expect(t.taxLines[0].amount).toBe(0);
  });

  it("no cc fee when pct is null, fee row when set", () => {
    const base = { jobs: [job({ hours: 1 })], default_margin_pct: 0, taxes: [], payments: [] };
    expect(computeTotals({ ...base, cc_fee_pct: null }).ccFee).toBe(0);
    expect(computeTotals({ ...base, cc_fee_pct: 3 }).ccFee).toBe(5.25);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npm test -- __tests__/work-orders/totals.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `lib/work-orders/totals.ts`:**

```ts
// Pure money math for work orders. The ONLY place totals are computed —
// editor, list, and print all call computeTotals so figures always agree.
import type { JobType, LineKind, TaxEntry } from "./types";

export interface TotalsLine {
  kind: LineKind; qty: number; unit_cost: number;
  margin_pct: number | null; taxable: boolean;
}

export interface TotalsJob {
  job_type: JobType; hours: number | null; flat_price: number | null;
  boat_length_ft: number | null; rate: number; rate_unit: "hour" | "foot";
  labor_taxable: boolean; lines: TotalsLine[];
}

export interface TotalsInput {
  jobs: TotalsJob[]; default_margin_pct: number; taxes: TaxEntry[];
  cc_fee_pct: number | null; payments: number[];
}

export interface TaxLineOut extends TaxEntry { amount: number; }

export interface WOTotals {
  totalLabor: number; totalParts: number; shopSupplies: number;
  shipping: number; other: number; subtotal: number;
  taxLines: TaxLineOut[]; ccFee: number; amountDue: number;
  amountPaid: number; balanceDue: number; profit: number;
  jobSubtotals: number[];
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function laborForJob(j: TotalsJob): number {
  if (j.job_type === "flat") return round2(j.flat_price ?? 0);
  if (j.job_type === "per_foot") return round2((j.boat_length_ft ?? 0) * j.rate);
  return round2((j.hours ?? 0) * j.rate); // frh
}

export function effectiveMargin(line: Pick<TotalsLine, "kind" | "margin_pct">, defaultMargin: number): number {
  if (line.margin_pct != null) return line.margin_pct;
  return line.kind === "part" ? defaultMargin : 0;
}

export function linePrice(line: TotalsLine, defaultMargin: number): number {
  const m = effectiveMargin(line, defaultMargin);
  return round2(line.qty * line.unit_cost * (1 + m / 100));
}

export function computeTotals(input: TotalsInput): WOTotals {
  const buckets: Record<"part" | "shop_supplies" | "shipping" | "other", number> =
    { part: 0, shop_supplies: 0, shipping: 0, other: 0 };
  let totalLabor = 0, taxableBase = 0, profit = 0;
  const jobSubtotals: number[] = [];

  for (const j of input.jobs) {
    const labor = laborForJob(j);
    totalLabor = round2(totalLabor + labor);
    if (j.labor_taxable) taxableBase += labor;
    let jobTotal = labor;
    for (const l of j.lines) {
      const price = linePrice(l, input.default_margin_pct);
      const bucket = l.kind === "flat_service" ? "other" : l.kind === "part" ? "part" : l.kind === "shop_supplies" ? "shop_supplies" : l.kind === "shipping" ? "shipping" : "other";
      buckets[bucket] = round2(buckets[bucket] + price);
      if (l.taxable) taxableBase += price;
      profit += price - l.qty * l.unit_cost;
      jobTotal += price;
    }
    jobSubtotals.push(round2(jobTotal));
  }

  const subtotal = round2(totalLabor + buckets.part + buckets.shop_supplies + buckets.shipping + buckets.other);
  const taxLines: TaxLineOut[] = input.taxes.map((t) => ({ ...t, amount: round2(taxableBase * t.rate_pct / 100) }));
  const taxTotal = taxLines.reduce((s, t) => s + t.amount, 0);
  const ccFee = input.cc_fee_pct != null ? round2((subtotal + taxTotal) * input.cc_fee_pct / 100) : 0;
  const amountDue = round2(subtotal + taxTotal + ccFee);
  const amountPaid = round2(input.payments.reduce((s, p) => s + p, 0));

  return {
    totalLabor, totalParts: buckets.part, shopSupplies: buckets.shop_supplies,
    shipping: buckets.shipping, other: buckets.other, subtotal, taxLines, ccFee,
    amountDue, amountPaid, balanceDue: round2(amountDue - amountPaid),
    profit: round2(profit), jobSubtotals,
  };
}

export const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
```

- [ ] **Step 5: Run tests** — `npm test -- __tests__/work-orders/totals.test.ts` → all PASS. If a rounding expectation fails, fix the TEST only if hand-math agrees with the implementation (round at each rendered figure).

- [ ] **Step 6: Commit**
```bash
git add lib/work-orders/types.ts lib/work-orders/totals.ts __tests__/work-orders/totals.test.ts
git commit -m "feat(wo): work order types + unit-tested money math"
```

---

### Task 3: Shared fetch helpers + adapter from DB rows to totals input

**Files:**
- Create: `lib/work-orders/queries.ts`
- Test: `__tests__/work-orders/queries.test.ts`

- [ ] **Step 1: Create `lib/work-orders/queries.ts`:**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkOrderFull, WOJob } from "./types";
import type { TotalsInput, TotalsJob } from "./totals";

export const WO_FULL_SELECT = `
  id, wo_number, status, customer_id, boat_id, location_id, service_advisor,
  wo_date, default_margin_pct, taxes, cc_fee_pct, printed_notes, internal_notes,
  approved_at, completed_at, invoiced_at,
  customers:customer_id ( id, name, email, phone ),
  boats:boat_id ( id, name, make_model, year, hin ),
  profiles:service_advisor ( full_name ),
  locations:location_id ( name ),
  work_order_jobs (
    id, work_order_id, position, title, description, notes_to_tech, cause, correction,
    customer_status, job_status, job_type, price_level_id, hours, flat_price,
    boat_length_ft, labor_taxable, assigned_tech,
    price_levels:price_level_id ( id, name, rate, unit, active ),
    profiles:assigned_tech ( full_name ),
    work_order_lines ( id, work_order_job_id, kind, item_code, description, qty, unit_cost, margin_pct, taxable, position )
  ),
  work_order_payments ( id, work_order_id, paid_on, method, note, amount )
`;

export async function fetchWorkOrderFull(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("work_orders").select(WO_FULL_SELECT).eq("id", id).single();
  if (error) throw error;
  const wo = data as unknown as WorkOrderFull;
  wo.work_order_jobs?.sort((a, b) => a.position - b.position);
  wo.work_order_jobs?.forEach((j) => j.work_order_lines?.sort((a, b) => a.position - b.position));
  return wo;
}

/** Adapter: joined DB rows -> pure totals input. */
export function toTotalsInput(wo: WorkOrderFull): TotalsInput {
  const jobs: TotalsJob[] = (wo.work_order_jobs ?? []).map((j: WOJob) => ({
    job_type: j.job_type,
    hours: j.hours == null ? null : Number(j.hours),
    flat_price: j.flat_price == null ? null : Number(j.flat_price),
    boat_length_ft: j.boat_length_ft == null ? null : Number(j.boat_length_ft),
    rate: Number(j.price_levels?.rate ?? 0),
    rate_unit: j.price_levels?.unit ?? "hour",
    labor_taxable: j.labor_taxable,
    lines: (j.work_order_lines ?? []).map((l) => ({
      kind: l.kind, qty: Number(l.qty), unit_cost: Number(l.unit_cost),
      margin_pct: l.margin_pct == null ? null : Number(l.margin_pct),
      taxable: l.taxable,
    })),
  }));
  return {
    jobs,
    default_margin_pct: Number(wo.default_margin_pct),
    taxes: wo.taxes ?? [],
    cc_fee_pct: wo.cc_fee_pct == null ? null : Number(wo.cc_fee_pct),
    payments: (wo.work_order_payments ?? []).map((p) => Number(p.amount)),
  };
}
```

- [ ] **Step 2: Test the adapter** (numeric strings from Postgres → numbers) in `__tests__/work-orders/queries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toTotalsInput } from "@/lib/work-orders/queries";
import { computeTotals } from "@/lib/work-orders/totals";
import type { WorkOrderFull } from "@/lib/work-orders/types";

it("adapts joined rows (numeric strings) into totals input", () => {
  const wo = {
    id: "w1", wo_number: 1001, status: "draft", customer_id: "c1", boat_id: null,
    location_id: null, service_advisor: null, wo_date: "2026-06-12",
    default_margin_pct: "25" as unknown as number,
    taxes: [{ name: "Tax", rate_pct: 10 }], cc_fee_pct: null,
    printed_notes: null, internal_notes: null, approved_at: null, completed_at: null, invoiced_at: null,
    work_order_jobs: [{
      id: "j1", work_order_id: "w1", position: 0, title: "T", description: null,
      notes_to_tech: null, cause: null, correction: null, customer_status: "estimate",
      job_status: "open", job_type: "frh", price_level_id: "p1",
      hours: "2" as unknown as number, flat_price: null, boat_length_ft: null,
      labor_taxable: true, assigned_tech: null,
      price_levels: { id: "p1", name: "Std", rate: "175" as unknown as number, unit: "hour", active: true },
      work_order_lines: [{
        id: "l1", work_order_job_id: "j1", kind: "part", item_code: null, description: null,
        qty: "1" as unknown as number, unit_cost: "100" as unknown as number,
        margin_pct: null, taxable: true, position: 0,
      }],
    }],
    work_order_payments: [{ id: "pay1", work_order_id: "w1", paid_on: "2026-06-12", method: null, note: null, amount: "50" as unknown as number }],
  } as unknown as WorkOrderFull;

  const t = computeTotals(toTotalsInput(wo));
  expect(t.totalLabor).toBe(350);
  expect(t.totalParts).toBe(125);
  expect(t.amountDue).toBe(522.5);
  expect(t.balanceDue).toBe(472.5);
});
```

- [ ] **Step 3: Run** `npm test -- __tests__/work-orders/` → PASS.

- [ ] **Step 4: Commit** — `git add lib/work-orders/queries.ts __tests__/work-orders/queries.test.ts && git commit -m "feat(wo): full-tree fetch + totals adapter"`

---

### Task 4: Sidebar entry, status colors, list page, New WO

**Files:**
- Modify: `app/dashboard/sidebar.tsx` (navItems array + icon case)
- Modify: `lib/utils.ts` (`statusColor`)
- Create: `app/dashboard/work-orders/page.tsx`
- Create: `app/dashboard/work-orders/wo-list.tsx`

- [ ] **Step 1: Sidebar** — in `navItems` insert after the Jobs entry:
```ts
{ label: "Work Orders", href: "/dashboard/work-orders", icon: "wrench" },
```
and add to `NavIcon`'s switch:
```tsx
case "wrench":
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
    </svg>
  );
```

- [ ] **Step 2: `statusColor`** in `lib/utils.ts` — add before `default`:
```ts
case "draft":
  return "bg-slate-500/15 text-slate-300 border-slate-500/30";
case "invoiced":
  return "bg-gold-muted text-gold border-gold/30";
```
(`approved`/`completed` already exist.)

- [ ] **Step 3: List page** `app/dashboard/work-orders/page.tsx` (server):

```tsx
import { requireAdmin } from "@/lib/admin";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { WOList, type WOListRow } from "./wo-list";

export default async function WorkOrdersPage() {
  const { supabase, profile } = await requireAdmin();
  const [{ data: rows }, { data: customers }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_number, status, wo_date, default_margin_pct, taxes, cc_fee_pct, customers:customer_id(name), boats:boat_id(name), work_order_jobs(job_type, hours, flat_price, boat_length_ft, labor_taxable, price_levels:price_level_id(rate, unit), work_order_lines(kind, qty, unit_cost, margin_pct, taxable)), work_order_payments(amount)")
      .order("wo_number", { ascending: false }),
    supabase.from("customers").select("id, name").order("name"),
  ]);
  const canEdit = profile.role === "admin" || profile.role === "manager";
  return (
    <div>
      <RealtimeRefresh tables={["work_orders", "work_order_jobs", "work_order_lines", "work_order_payments"]} />
      <WOList rows={(rows ?? []) as unknown as WOListRow[]} customers={customers ?? []} canEdit={canEdit} profileId={profile.id} />
    </div>
  );
}
```

- [ ] **Step 4: `wo-list.tsx`** (client) — header + status filter chips (All / Draft / Approved / Completed / Invoiced), table (WO# `WO-{n}`, date via `formatDate`, client, boat, status badge via `statusColor`, Amount Due, Balance Due — both via `computeTotals(toTotalsInput(row as never))` reusing the adapter by shaping the select to match), each row `Link` → `/dashboard/work-orders/{id}`. "New Work Order" button (visible when `canEdit`): opens a small Radix Dialog with a customer `<select>` (required) then:

```ts
const { data: settings } = await supabase.from("wo_settings").select("*").single();
const { data: me } = await supabase.from("profiles").select("id, location_id, org_id").eq("id", profileId).single();
const { data: created, error } = await supabase.from("work_orders").insert({
  org_id: me!.org_id, location_id: me!.location_id, customer_id: chosenCustomerId,
  service_advisor: profileId, created_by: profileId,
  default_margin_pct: settings?.default_margin_pct ?? 25,
  taxes: settings?.default_taxes ?? [], cc_fee_pct: null,
}).select("id").single();
if (!error) router.push(`/dashboard/work-orders/${created!.id}`);
```
Balance > 0 on completed/invoiced rows renders the Balance cell in `text-red-400`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npm run dev`, open `/dashboard/work-orders`, create a WO for a test client, land on (as-yet 404) editor URL. That 404 is expected until Task 5.

- [ ] **Step 6: Commit** — `git commit -am "feat(wo): sidebar tab, list page, create work order"`

---

### Task 5: Editor — header, status flow, Customer Charges rail, notes, taxes, fee, payments

**Files:**
- Create: `app/dashboard/work-orders/[id]/page.tsx`
- Create: `app/dashboard/work-orders/[id]/editor.tsx`
- Create: `app/dashboard/work-orders/[id]/charges-rail.tsx`

- [ ] **Step 1: Server page** `[id]/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/admin";
import { fetchWorkOrderFull } from "@/lib/work-orders/queries";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { notFound } from "next/navigation";
import { WOEditor } from "./editor";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireAdmin();
  let wo;
  try { wo = await fetchWorkOrderFull(supabase, id); } catch { notFound(); }
  const [{ data: customers }, { data: boats }, { data: priceLevels }, { data: templates }, { data: settings }, { data: staff }] = await Promise.all([
    supabase.from("customers").select("id, name, email, phone").order("name"),
    supabase.from("boats").select("id, name, make_model, customer_id").order("name"),
    supabase.from("price_levels").select("*").eq("active", true).order("name"),
    supabase.from("job_templates").select("*").eq("active", true).order("name"),
    supabase.from("wo_settings").select("*").single(),
    supabase.from("profiles").select("id, full_name").in("role", ["admin", "manager", "tech"]).eq("status", "active").order("full_name"),
  ]);
  const canEdit = profile.role === "admin" || profile.role === "manager";
  const isViewer = profile.role === "viewer";
  return (
    <div>
      <RealtimeRefresh tables={["work_orders", "work_order_jobs", "work_order_lines", "work_order_payments"]} />
      <WOEditor wo={wo} customers={customers ?? []} boats={boats ?? []} priceLevels={priceLevels ?? []}
        templates={templates ?? []} settings={settings} staff={staff ?? []} canEdit={canEdit} hideCosts={isViewer} />
    </div>
  );
}
```

- [ ] **Step 2: `editor.tsx`** (client root). Layout: `lg:grid lg:grid-cols-[1fr_360px] gap-6`. Left: header card + job sections (Task 6). Right: `<ChargesRail/>`. Header card contains:
  - Title row: `WO-{wo_number}` + status badge + Print link (`/dashboard/work-orders/{id}/print`).
  - Customer select (required), Boat select (options filtered `boats.filter(b => b.customer_id === wo.customer_id)`), Service Advisor select (staff), Date input — each patches via a shared helper then `router.refresh()`:
```ts
async function patchWO(fields: Record<string, unknown>) {
  const supabase = createClient();
  const { error } = await supabase.from("work_orders")
    .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", wo.id);
  if (error) setError(error.message); else router.refresh();
}
```
  - Status actions (canEdit only), the same advance pattern as `ReportStatusActions`: Draft→`Approve` sets `{status:"approved", approved_at: now}`; Approved→`Mark Completed` sets `{status:"completed", completed_at: now}`; Completed→`Mark Invoiced` sets `{status:"invoiced", invoiced_at: now}`; plus a subtle "back to draft" link while Approved. Delete WO button (canEdit, `confirm()` first) deletes the WO (children cascade) and routes to the list.

- [ ] **Step 3: `charges-rail.tsx`** — props `{ wo, totals, canEdit, hideCosts, settings }` where editor computes `totals = computeTotals(toTotalsInput(wo))` once and passes it down. Renders, in order, inside `rounded-xl border border-border-line bg-card-bg`:
  1. **Customer Charges** rows (skip zero rows): Total Labor / Total Parts / Shop Supplies / Shipping & Handling / Other, then one row per `totals.taxLines` ("{name} ({rate}%)"), CC fee row when on, bold **Amount Due**, then Amount Paid and **Balance Due** (red when > 0). All via `fmtUSD`.
  2. **Margin & fee controls** (canEdit): number input default margin % → `patchWO({default_margin_pct})`; CC fee: checkbox + % input → `patchWO({cc_fee_pct: on ? pct : null})`.
  3. **Taxes**: list current `wo.taxes` with ✕ remove; "Add tax" select fed from `settings.default_taxes` plus a custom name+% mini-form; writes the whole array via `patchWO({taxes})`.
  4. **Profit** (hidden when `hideCosts`): `fmtUSD(totals.profit)` with subtle styling.
  5. **Payments**: history list (date, method, note, amount) each with ✕ (canEdit); "Add Payment" Radix Dialog → insert into `work_order_payments` `{work_order_id, paid_on, method, note, amount, recorded_by}`; balance updates on refresh.
  6. **Printed notes** + **Internal notes** textareas (canEdit) saved on blur via `patchWO`.

- [ ] **Step 4: Verify** — typecheck + in dev: open created WO, change margin, add tax, add payment; Amount Due/Balance react after refresh.

- [ ] **Step 5: Commit** — `git add app/dashboard/work-orders && git commit -m "feat(wo): editor shell, status flow, customer charges rail, payments"`

---

### Task 6: Job sections — add (templates + ad-hoc), edit sheet, shop supplies auto-line, lines editor

**Files:**
- Create: `app/dashboard/work-orders/[id]/job-section.tsx`
- Create: `app/dashboard/work-orders/[id]/job-sheet.tsx`
- Create: `app/dashboard/work-orders/[id]/add-jobs-dialog.tsx`
- Modify: `app/dashboard/work-orders/[id]/editor.tsx` (render sections + Add Jobs button)

- [ ] **Step 1: `add-jobs-dialog.tsx`** — Radix Dialog listing `templates` with a search input (`filter(t => t.name.toLowerCase().includes(q))`), checkbox multi-select, preset hours/price level shown, plus one "Blank job" row with a title input. On **Done**, for each selection insert a `work_order_jobs` row:
```ts
const position = (wo.work_order_jobs?.length ?? 0) + i;
await supabase.from("work_order_jobs").insert({
  work_order_id: wo.id, position, title: t.name, description: t.description,
  notes_to_tech: t.notes_to_tech, job_type: "frh", hours: t.default_hours,
  price_level_id: t.default_price_level_id ?? defaultLevelId,
}).select("id").single();
// shop supplies auto-line:
await supabase.from("work_order_lines").insert({
  work_order_job_id: jobId, kind: "shop_supplies",
  description: "Sealant, Zip Ties, Rags, Cleaning Products, Etc.",
  qty: 1, unit_cost: settings?.shop_supplies_amount ?? 75, position: 999,
});
```
(`defaultLevelId` = first active price level.) Then `router.refresh()`.

- [ ] **Step 2: `job-section.tsx`** — one card per job, ordered by position. Header bar styled after the SF look: `bg-gold/80 text-[#0a0f1a] font-semibold` row with `{index+1} {title}`, right side `{assigned tech name ?? "TBD"}` and an `ESTIMATE` chip when `customer_status === "estimate"`; click opens the job sheet. Body table — columns Item / Description / Unit Price / Qty / Total:
  - First row is the computed **Labor** line (read-only): unit = price level rate (or flat/per-foot), qty = hours/length/1, total = `laborForJob`. When `hideCosts` is false this is identical anyway (labor has no hidden cost).
  - Then editable line rows: item_code, description, qty, unit_cost (label flips: "Cost" for parts when `!hideCosts`, "Price" otherwise), margin % input (parts default placeholder = WO default; hidden entirely when `hideCosts`), taxable checkbox, computed line total via `linePrice`, ✕ delete. Edits patch `work_order_lines` then refresh.
  - "Add Item" row (canEdit): kind select (Part / Shipping & Handling / Flat Service / Other / Shop Supplies), then inserts with sane defaults and the next `position`.
  - Job subtotal row (`totals.jobSubtotals[index]`).
  - "Remove Shop Supplies" small toggle: deletes/re-adds the auto shop-supplies line for this job.

- [ ] **Step 3: `job-sheet.tsx`** — Radix Dialog mirroring SF Job Information: title, description, Notes to Tech, Cause, Correction (textareas), Price Level select, Job Type select (`frh`/`flat`/`per_foot` labeled FRH / Flat Rate / Per Foot), conditional inputs (Hours when frh; Flat $ when flat; Boat length ft when per_foot), labor taxable checkbox, Assigned Tech select, Customer Status select (Estimate/Approved), Job Status select (Open / Awaiting Customer / In Progress / Done), **Save as template** button:
```ts
await supabase.from("job_templates").insert({
  org_id: orgId, name: job.title, description: job.description,
  notes_to_tech: job.notes_to_tech, default_hours: job.hours,
  default_price_level_id: job.price_level_id,
});
```
Save patches the `work_order_jobs` row; Delete (confirm) removes job + cascade lines.

- [ ] **Step 4: Wire into `editor.tsx`** — map jobs to `<JobSection/>`, "Add Jobs" button under the last section (canEdit).

- [ ] **Step 5: Verify in dev** — add 2 templated jobs + 1 blank; labor math reacts to hours/price-level changes; part line with cost 100 & default margin 25 shows 125; remove shop supplies works; charges rail matches by hand.

- [ ] **Step 6: Commit** — `git commit -am "feat(wo): job sections, template picker, job sheet, line items"`

---

### Task 7: Print view (customer copy)

**Files:**
- Create: `app/dashboard/work-orders/[id]/print/page.tsx`
- Create: `lib/work-orders/letterhead.ts`

- [ ] **Step 1: `letterhead.ts`** — branch blocks keyed by location name (from the WO-4505 header), with a safe default:

```ts
export interface Letterhead { company: string; lines: string[]; }
const SEATTLE: Letterhead = {
  company: "Jeff Brown Yachts Seattle",
  lines: ["2288 W. Commodore Way, Suite 110", "Seattle, WA 98199", "(619) 222-9899", "https://jeffbrownyachts.com"],
};
const DEFAULT: Letterhead = {
  company: "Jeff Brown Yachts",
  lines: ["https://jeffbrownyachts.com"],
};
export function letterheadFor(locationName: string | null | undefined): Letterhead {
  if (locationName?.toLowerCase().includes("seattle")) return SEATTLE;
  return DEFAULT;
}
```

- [ ] **Step 2: `print/page.tsx`** — server component, light theme for paper (`bg-white text-black`, wrapper `mx-auto max-w-[800px] p-8 print:p-0`), reuses `fetchWorkOrderFull` + `computeTotals`. Content, top to bottom (NO costs, margins, profit, or internal notes anywhere):
  1. Header: letterhead block left, right side `<h1>Work Order</h1>` + `WO-{n}` in red (`text-red-600`) + `Location: {location name}` + `Date` + `Service Advisor`.
  2. Customer Information table: name / phone / email.
  3. Boat Information table: boat name, make/model + year, HIN.
  4. Job sections: numbered title bar (`bg-amber-400 text-black px-3 py-1.5 font-semibold flex justify-between`) with ESTIMATE tag; item table rows = labor (Hourly Rate × hrs etc.) + each line at **customer price** (`linePrice`); per-section Subtotal.
  5. Customer Charges table (right-aligned, bordered, mirroring the SF box): category rows, tax rows, CC fee, **Amount Due**, Amount Paid, **Balance Due**.
  6. Payments table when any exist (Date / Method / Note / Amount).
  7. Printed Notes paragraph when present.
  8. `<PrintButton />` (existing component) rendered inside a `print:hidden` div, plus a back link.

- [ ] **Step 3: Verify** — open `/dashboard/work-orders/{id}/print`, Cmd+P preview: one clean page, no nav/sidebar (the print route lives outside the dashboard layout? It does NOT — it inherits `app/dashboard/layout.tsx`). Hide chrome with a `<style>{`@media print { aside, header { display:none !important } }`}</style>` block in the print page if the dashboard layout renders the sidebar around it.

- [ ] **Step 4: Commit** — `git commit -am "feat(wo): customer-facing print view with JBY letterhead"`

---

### Task 8: Client profile page + Work Orders card + list link

**Files:**
- Create: `app/dashboard/customers/[id]/page.tsx`
- Modify: `app/dashboard/customers/customer-list.tsx` (row links to the new profile page)

- [ ] **Step 1: Profile page** — server component via `requireAdmin()`: fetch customer (`id, name, email, phone`), their boats, their work orders (same select shape as the list page but `.eq("customer_id", id)`), their recent jobs (5). Layout: header card (name, phone `tel:` link, email `mailto:` link, boats chips) then **Work Orders card** — table of WO# / date / status badge / Amount Due / Balance, row-link to editor, "New Work Order" button (canEdit) that inserts a draft pre-filled with `customer_id` (same insert as Task 4 Step 4) and routes to it. Then Recent Jobs list (read-only, existing styling).

- [ ] **Step 2: Link the list** — in `customer-list.tsx`, make each customer name a `<Link href={`/dashboard/customers/${c.id}`}>` (keep all existing row actions working).

- [ ] **Step 3: Verify in dev** — navigate Clients → a client → see WOs, create one from there, customer pre-selected.

- [ ] **Step 4: Commit** — `git commit -am "feat(wo): client profile page with work orders card"`

---

### Task 9: Settings page (price levels, templates, defaults)

**Files:**
- Create: `app/dashboard/work-orders/settings/page.tsx`
- Create: `app/dashboard/work-orders/settings/settings-client.tsx`

- [ ] **Step 1: Server page** — `requireAdmin()`; redirect viewers/techs: `if (!(profile.role === "admin" || profile.role === "manager")) redirect("/dashboard/work-orders");` Fetch `price_levels` (all incl. inactive), `job_templates`, `wo_settings`, org id from profile.

- [ ] **Step 2: `settings-client.tsx`** — three cards:
  1. **Price Levels**: table name / rate / unit (hour-foot select) / active toggle, inline edits patch row; "Add price level" inserts `{org_id, name, rate, unit}`.
  2. **Job Templates**: same pattern (name, description, default hours, price level select, active); delete sets `active=false` (soft).
  3. **Defaults**: shop supplies amount, default margin %, default CC fee %, default taxes editor (name + % rows, add/remove) → update `wo_settings`.
  A small gear-icon link to this page goes in the list page header (canEdit only).

- [ ] **Step 3: Verify + commit** — `git commit -am "feat(wo): settings — price levels, templates, defaults"`

---

### Task 10: Quality gate + deploy + verification

- [ ] **Step 1:** `npm test` → all suites pass. `npx tsc --noEmit` → clean. `npm run lint` → no new errors.
- [ ] **Step 2:** Push: `git push origin main`.
- [ ] **Step 3:** Deploy: `npm run deploy` (root). Expected: wrangler prints a new version id for marinetech.grayyachts.com.
- [ ] **Step 4: Manual verification on prod** (use a real client, then delete the test WO):
  1. Work Orders tab visible; list loads.
  2. Create WO → add "Engine Service 100 Hour 300 HP V8 2025" template + blank job.
  3. Add a part line: cost $100, default margin 25 → shows $125 customer price.
  4. Stack two taxes; toggle CC fee 3%; verify Amount Due by hand against `computeTotals` expectations.
  5. Add partial payment → Balance Due drops.
  6. Approve → Complete → Invoice; badges update.
  7. Print view: no cost/margin/profit/internal notes anywhere; letterhead + red WO number render; Cmd+P is one clean page.
  8. Client profile shows the WO.
  9. Delete the test WO.
- [ ] **Step 5:** Update memory (`marine-tech-app.md` + MEMORY.md index): Work Orders shipped, spec/plan paths, settings page location, RLS helper `wo_can_edit()`.

**NOT in this plan (deliberately):** QuickBooks export, emailing WOs, SF catalog import, portal-dashboard mirror, mobile screens — phase 2 per spec. The grayyachts.com `/portal/marine-tech` dashboard does NOT get this module in v1 (flagged to Connor in the design conversation).

---

## Self-review notes

- Spec coverage: schema ✅ (T1), math+rounding ✅ (T2), adapter ✅ (T3), sidebar/list/create ✅ (T4), editor+charges+payments+taxes+fee+notes ✅ (T5), job sections/templates/3Cs/shop-supplies/save-as-template ✅ (T6), print ✅ (T7), client profile ✅ (T8), settings ✅ (T9), tests/deploy/verify ✅ (T10). Viewer cost-hiding: `hideCosts` prop (T5/T6); viewer write-block at RLS (T1) + `canEdit` gating.
- Type consistency: `TotalsJob.rate_unit` added to match test usage; `linePrice`/`laborForJob`/`computeTotals`/`fmtUSD` names used consistently across T2/T3/T5/T6/T7.
- Known judgment calls: customer deletes are `restrict`ed when WOs exist (financial records survive); CC fee = pct × (subtotal + taxes) — stated in spec; print page inherits dashboard layout → print CSS hides chrome.
