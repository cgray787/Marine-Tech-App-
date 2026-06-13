# Per-Office Login Routing (Web / Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the web admin dashboard, route every login to an office context — the Owner (Connor) picks an office or "All Offices"; single-office staff land in their one office with a badge — and let the Owner create users into offices and reassign offices, all from the Technicians page.

**Architecture:** No schema change to data tables; offices are already isolated by location-scoped RLS. A single predicate `isOrgWide(profile) = role==='admin' || isOwner(profile)` decides who sees the office picker + "All Offices". Org-wide = Connor only today (his 3 admin identities). The picker writes the existing `mt-location` cookie. One new owner-only RPC (`admin_set_user_location`) plus an owner-only server route (`/api/admin/create-office-user`, service-role) deliver office management.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, Supabase (Postgres + RLS + `@supabase/ssr`), vitest. Deployed to Cloudflare Workers via OpenNext.

**Spec:** `docs/superpowers/specs/2026-06-12-per-office-login-routing-design.md`

**Out of scope (separate plan):** Phase 2 mobile app (choose-office screen + location context + query filtering + badge).

---

## File Structure

**Create:**
- `supabase/migrations/037_admin_set_user_location.sql` — owner-only RPC to set a user's office (+ shop tier).
- `lib/admin-users.ts` — pure helper `buildOfficeUserProfile()` (profile payload rules; admin ⇒ no office).
- `app/dashboard/choose-office/page.tsx` — server component; gates non-org-wide users out.
- `app/dashboard/choose-office/office-picker.tsx` — client; office cards + All Offices, writes the cookie.
- `app/api/admin/create-office-user/route.ts` — owner-only POST; service-role creates auth user + promotes profile.
- `app/dashboard/technicians/create-office-user-form.tsx` — owner form to create a user into an office.
- `mobile/scripts/add-office-user.mjs` — CLI: create + promote in one command.
- Tests: `__tests__/owner.test.ts`, `__tests__/admin-users.test.ts`.

**Modify:**
- `lib/owner.ts` — add pure `isOrgWide(profile)`.
- `lib/location/server.ts` — `locationFilterFor()` reuses `isOrgWide` (DRY).
- `app/login/page.tsx` — post-auth redirect target → `/dashboard/choose-office`.
- `app/dashboard/layout.tsx` — fetch single-office users' own location name; pass to Sidebar.
- `app/dashboard/sidebar.tsx` — render a static office badge when the switcher is hidden.
- `app/dashboard/technicians/page.tsx` — pass locations + each user's `location_id` into controls; render the create form.
- `app/dashboard/technicians/manage-user-controls.tsx` — add Office `<select>` → `admin_set_user_location`.

**Shared constants used below:**
- JBY org id: `e22d5492-3ec1-4d5c-9118-b2eba8880586`
- Locations: Seattle `665e7a6b-968b-46a3-87a3-ec6050ab8ffc`, Sausalito `aca07f4b-2c93-471b-b2ef-a9e4428fab24`, San Diego `af0eb6a2-0866-4919-959e-940baea9205d`, Newport `3a2c83ac-2195-41c3-909a-e7495103c49b`.

---

## Task 1: Migration 037 — `admin_set_user_location` RPC

**Files:**
- Create: `supabase/migrations/037_admin_set_user_location.sql`

Mirrors `admin_set_user_role` (migration 027): `security definer`, `is_owner()` gate, refuses to act on self. Assigning a real office also sets `tier='shop'` (so the user becomes location-scoped — fixes the migration-013 invitee footgun). Passing `null` unassigns the office.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/037_admin_set_user_location.sql`:
```sql
-- 037_admin_set_user_location.sql
-- Owner-only RPC to assign a user's office (location_id). Mirrors
-- admin_set_user_role (027): is_owner() gated, refuses to act on self.
-- Assigning a real office also flips the user to tier='shop' so the
-- location-scoped RLS (017/027/028/029) actually binds them — this closes
-- the migration-013 footgun (invitees land at individual/NULL and see nothing).
-- Passing NULL unassigns the office (location stays NULL; tier untouched).

create or replace function public.admin_set_user_location(
  target_profile uuid,
  new_location uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if not public.is_owner() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if new_location is not null
     and not exists (select 1 from public.locations where id = new_location) then
    raise exception 'unknown location: %', new_location;
  end if;

  if exists (
    select 1 from public.profiles where id = target_profile and auth_id = me
  ) then
    raise exception 'cannot change your own office';
  end if;

  if new_location is null then
    update public.profiles
       set location_id = null
     where id = target_profile;
  else
    update public.profiles
       set location_id = new_location,
           tier = 'shop'
     where id = target_profile;
  end if;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

revoke all on function public.admin_set_user_location(uuid, uuid) from public, anon;
grant execute on function public.admin_set_user_location(uuid, uuid) to authenticated;
```

- [ ] **Step 2: Apply to prod via Supabase MCP** *(controller step — the dispatching session runs this with `mcp__supabase__apply_migration`, name `admin_set_user_location`, project `ikfcnqdrlvhvlyhiuphs`; subagents do not touch prod)*

Expected: migration appears in `list_migrations`.

- [ ] **Step 3: Verify owner-only + self-guard + effect via impersonation SQL**

Run via `mcp__supabase__execute_sql` (project `ikfcnqdrlvhvlyhiuphs`). (a) A non-owner manager calling it must error `forbidden`:
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_id from public.profiles where email='justin@jeffbrownyachts.com'),
                    'role','authenticated')::text, true);
-- expect: ERROR forbidden
select public.admin_set_user_location(
  (select id from public.profiles where email='sandiego.tech@jeffbrownyachts.com'),
  'aca07f4b-2c93-471b-b2ef-a9e4428fab24');
rollback;
```
Expected: `forbidden` (insufficient_privilege). If it succeeds, the gate is wrong.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/037_admin_set_user_location.sql
git commit -m "feat(db): admin_set_user_location RPC (owner-only office assignment)"
```

---

## Task 2: `isOrgWide` predicate (pure helper + reuse)

**Files:**
- Modify: `lib/owner.ts`
- Modify: `lib/location/server.ts`
- Test: `__tests__/owner.test.ts`

- [ ] **Step 1: Write the failing test**

`__tests__/owner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isOrgWide } from "@/lib/owner";

describe("isOrgWide", () => {
  it("true for an admin profile", () => {
    expect(isOrgWide({ email: "x@y.com", role: "admin" })).toBe(true);
  });
  it("true for the owner allowlist even if role is tech", () => {
    expect(isOrgWide({ email: "connorgray41@gmail.com", role: "tech" })).toBe(true);
  });
  it("false for a single-office manager", () => {
    expect(isOrgWide({ email: "justin@jeffbrownyachts.com", role: "manager" })).toBe(false);
  });
  it("false for a tech and for null", () => {
    expect(isOrgWide({ email: "t@y.com", role: "tech" })).toBe(false);
    expect(isOrgWide(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/owner.test.ts`
Expected: FAIL — `isOrgWide` is not exported.

- [ ] **Step 3: Add `isOrgWide` to `lib/owner.ts`**

Append to `lib/owner.ts` (it already exports `isOwner` + `OwnerCandidate`):
```ts
/**
 * Org-wide = sees every office + gets the office picker / "All Offices".
 * Admin role grants cross-office reach (RLS admin_all_* bypass); the Owner
 * allowlist is always org-wide regardless of role. Everyone else is bound to
 * their single profiles.location_id by RLS. Today the only admins are Connor's
 * three identities, so org-wide == Connor.
 */
export function isOrgWide(
  profile: (OwnerCandidate & { role?: string | null }) | null | undefined
): boolean {
  return profile?.role === "admin" || isOwner(profile);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/owner.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: DRY — reuse it in `lib/location/server.ts`**

In `lib/location/server.ts`, replace the inline check in `locationFilterFor` so it imports and uses `isOrgWide`:
```ts
import { isOrgWide } from "@/lib/owner";
// ...
export async function locationFilterFor(
  profile: (OwnerCandidate & { role?: string | null }) | null | undefined
): Promise<string | null> {
  return isOrgWide(profile) ? activeLocation() : null;
}
```
(Keep the existing `OwnerCandidate`/`isOwner` import line consistent — `isOwner` is no longer referenced directly here, so drop it from the import if unused to keep tsc/lint clean.)

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → Expected: no errors.
```bash
git add lib/owner.ts lib/location/server.ts __tests__/owner.test.ts
git commit -m "feat: isOrgWide predicate; reuse in locationFilterFor"
```

---

## Task 3: Choose-Office route + picker

**Files:**
- Create: `app/dashboard/choose-office/page.tsx`
- Create: `app/dashboard/choose-office/office-picker.tsx`

Org-wide users see office cards + "All Offices"; everyone else is redirected straight to `/dashboard` (instant, invisible).

- [ ] **Step 1: Create the server page**

`app/dashboard/choose-office/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { isOrgWide } from "@/lib/owner";
import { activeLocation } from "@/lib/location/server";
import { OfficePicker } from "./office-picker";

// Post-login landing for org-wide users. Single-office staff never see it.
export default async function ChooseOfficePage() {
  const { profile, supabase } = await requireAdmin();
  if (!isOrgWide(profile)) {
    redirect("/dashboard");
  }
  const [{ data: locations }, current] = await Promise.all([
    supabase.from("locations").select("id, name").order("name"),
    activeLocation(),
  ]);
  return <OfficePicker locations={locations ?? []} current={current} />;
}
```

- [ ] **Step 2: Create the client picker**

`app/dashboard/choose-office/office-picker.tsx`:
```tsx
"use client";

import { setLocationCookie } from "@/lib/location/client";

type Office = { id: string; name: string };

// Renders one card per office + an "All Offices" card. Writing null = all
// offices (matches lib/location parseLocationValue convention). Only reached
// by org-wide users (the page redirects everyone else), so All Offices is safe.
export function OfficePicker({
  locations,
  current,
}: {
  locations: Office[];
  current: string | null;
}) {
  function choose(id: string | null) {
    setLocationCookie(id);
    window.location.href = "/dashboard";
  }
  const cards: Office[] = [...locations, { id: "__all__", name: "All Offices" }];
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="anchor-bob mb-3 text-4xl text-gold">&#9875;</div>
      <h1 className="mb-1 text-2xl font-bold text-text-primary">Choose an office</h1>
      <p className="mb-8 text-sm text-text-secondary">Pick the office you’re working out of.</p>
      <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((o) => {
          const isAll = o.id === "__all__";
          const selected = isAll ? current === null : current === o.id;
          return (
            <button
              key={o.id}
              onClick={() => choose(isAll ? null : o.id)}
              className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-left transition-colors ${
                selected
                  ? "border-gold bg-gold/10"
                  : "border-border-line bg-card-bg hover:border-gold/50"
              }`}
            >
              <span className="text-2xl text-gold">{isAll ? "▣" : "⚓"}</span>
              <span className="text-base font-medium text-text-primary">{o.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. Log in as `connorgray@jeffbrownyachts.com` and visit `/dashboard/choose-office` → see 4 cards (3 offices + All Offices). Visit it as `sandiego.tech@jeffbrownyachts.com` → instant redirect to `/dashboard` (no picker).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/choose-office/
git commit -m "feat: choose-office route + picker (org-wide only)"
```

---

## Task 4: Route login → choose-office

**Files:**
- Modify: `app/login/page.tsx:118`

- [ ] **Step 1: Change the post-auth redirect**

In `app/login/page.tsx`, replace the success redirect:
```ts
// before:
window.location.href = "/dashboard";
// after:
window.location.href = "/dashboard/choose-office";
```
(Single-office users are bounced onward to `/dashboard` by the page guard, so this is one tap for the Owner and invisible to staff. Keep the hard navigation — it's required for the Supabase cookie to attach on Workers, per the existing comment.)

- [ ] **Step 2: Typecheck + manual**

Run: `npx tsc --noEmit` → no errors. Then `npm run dev`: logging in as Connor lands on the picker; logging in as a single-office tech lands directly on `/dashboard`.

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: send every login through choose-office"
```

---

## Task 5: Single-office badge in the sidebar

**Files:**
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/dashboard/sidebar.tsx`

Org-wide users keep the `LocationSwitcher`. Single-office users get a static "⚓ <Office>" badge in the same slot so they can see where they are.

- [ ] **Step 1: Provide the single-office name from the layout**

In `app/dashboard/layout.tsx`, after computing `orgWide`, fetch the badge name for non-org-wide users and pass it to `Sidebar`:
```tsx
// existing: const orgWide = profile.role === "admin" || isOwner(profile);
// (optionally swap to: import { isOrgWide } from "@/lib/owner"; const orgWide = isOrgWide(profile);)

let ownLocationName: string | null = null;
if (!orgWide && profile.location_id) {
  const { data: loc } = await supabase
    .from("locations")
    .select("name")
    .eq("id", profile.location_id)
    .single();
  ownLocationName = loc?.name ?? null;
}
```
Add `ownLocationName={ownLocationName}` to the `<Sidebar … />` props.

- [ ] **Step 2: Render the badge in the sidebar**

In `app/dashboard/sidebar.tsx`, accept `ownLocationName?: string | null` in the props type. Where the sidebar currently conditionally renders the `LocationSwitcher` (guarded by `showLocationSwitcher`), add an `else` branch:
```tsx
{showLocationSwitcher ? (
  <LocationSwitcher locations={locations} current={activeLocationId} />
) : ownLocationName ? (
  <div className="border-b border-border-line px-4 py-3">
    <span className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-text-secondary">
      Office
    </span>
    <span className="flex items-center gap-1.5 text-sm text-text-primary">
      <span className="text-gold">⚓</span> {ownLocationName}
    </span>
  </div>
) : null}
```
(Match the exact markup the sidebar already uses around the switcher; the classes above mirror `LocationSwitcher`’s container so it lines up.)

- [ ] **Step 3: Typecheck + manual**

Run: `npx tsc --noEmit` → no errors. `npm run dev`: as a San Diego tech, the sidebar shows "⚓ San Diego" and no dropdown; as Connor, the dropdown still appears.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/layout.tsx app/dashboard/sidebar.tsx
git commit -m "feat: static office badge for single-office users"
```

---

## Task 6: Reassign office from the Technicians page

**Files:**
- Modify: `app/dashboard/technicians/page.tsx`
- Modify: `app/dashboard/technicians/manage-user-controls.tsx`

Depends on Task 1's RPC.

- [ ] **Step 1: Pass locations + current office into the control**

In `app/dashboard/technicians/page.tsx`, the page already loads `locations`. Pass them and each user's `location_id` into `ManageUserControls`. At the render site (inside `techs.map`), update:
```tsx
<ManageUserControls
  profileId={tech.id}
  currentRole={tech.role}
  currentLocationId={tech.location_id ?? null}
  locations={locations ?? []}
  name={tech.full_name}
/>
```

- [ ] **Step 2: Add the Office select to the control**

In `app/dashboard/technicians/manage-user-controls.tsx`, extend the props and add an office `<select>` beside the existing Access select:
```tsx
export function ManageUserControls({
  profileId,
  currentRole,
  currentLocationId,
  locations,
  name,
}: {
  profileId: string;
  currentRole: string;
  currentLocationId: string | null;
  locations: { id: string; name: string }[];
  name: string;
}) {
  // ...existing role state...
  const [locationId, setLocationId] = useState<string>(currentLocationId ?? "");

  async function changeLocation(newLoc: string) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_user_location", {
      target_profile: profileId,
      new_location: newLoc || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setLocationId(newLoc);
    router.refresh();
  }
  // ...render: existing Access row, then:
}
```
Add the markup (below the Access row, inside the same container):
```tsx
<div className="mt-3 flex items-center justify-between gap-2">
  <label className="text-xs font-medium text-text-secondary">Office</label>
  <select
    value={locationId}
    disabled={busy}
    onChange={(e) => changeLocation(e.target.value)}
    className="rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary focus:border-gold focus:outline-none disabled:opacity-50"
  >
    <option value="">No office</option>
    {locations.map((l) => (
      <option key={l.id} value={l.id}>{l.name}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 3: Typecheck + manual**

Run: `npx tsc --noEmit` → no errors. `npm run dev` as Connor → Technicians page → change a tech's Office to Sausalito → no error; reload shows Sausalito; that tech now sees only Sausalito.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/technicians/page.tsx app/dashboard/technicians/manage-user-controls.tsx
git commit -m "feat: reassign a user's office from Technicians page"
```

---

## Task 7: Create a user into an office (route + form)

**Files:**
- Create: `lib/admin-users.ts`
- Test: `__tests__/admin-users.test.ts`
- Create: `app/api/admin/create-office-user/route.ts`
- Create: `app/dashboard/technicians/create-office-user-form.tsx`
- Modify: `app/dashboard/technicians/page.tsx`

- [ ] **Step 1: Write the failing test for the payload builder**

`__tests__/admin-users.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildOfficeUserProfile, JBY_ORG_ID } from "@/lib/admin-users";

describe("buildOfficeUserProfile", () => {
  it("office staff get shop tier + the chosen location", () => {
    const p = buildOfficeUserProfile({
      email: "a@b.com", full_name: "A B", role: "tech",
      location_id: "af0eb6a2-0866-4919-959e-940baea9205d",
    });
    expect(p).toEqual({
      email: "a@b.com", full_name: "A B", role: "tech", tier: "shop",
      status: "active", org_id: JBY_ORG_ID,
      location_id: "af0eb6a2-0866-4919-959e-940baea9205d",
    });
  });
  it("admin is org-wide: location forced to null", () => {
    const p = buildOfficeUserProfile({
      email: "c@d.com", full_name: "C D", role: "admin",
      location_id: "af0eb6a2-0866-4919-959e-940baea9205d",
    });
    expect(p.location_id).toBeNull();
  });
  it("rejects an office-staff role with no location", () => {
    expect(() =>
      buildOfficeUserProfile({ email: "e@f.com", full_name: "E F", role: "tech", location_id: null })
    ).toThrow(/office is required/i);
  });
  it("rejects an unknown role", () => {
    expect(() =>
      buildOfficeUserProfile({ email: "g@h.com", full_name: "G H", role: "owner", location_id: null })
    ).toThrow(/invalid role/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/admin-users.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure builder**

`lib/admin-users.ts`:
```ts
export const JBY_ORG_ID = "e22d5492-3ec1-4d5c-9118-b2eba8880586";

export type OfficeRole = "admin" | "manager" | "tech" | "viewer";
const OFFICE_ROLES: OfficeRole[] = ["admin", "manager", "tech", "viewer"];

export interface NewOfficeUser {
  email: string;
  full_name: string;
  role: string;
  location_id: string | null;
}

export interface OfficeUserProfile {
  email: string;
  full_name: string;
  role: OfficeRole;
  tier: "shop";
  status: "active";
  org_id: string;
  location_id: string | null;
}

/**
 * Profile payload for a newly-created office user. Admin = org-wide, so its
 * location is forced null. Every other role REQUIRES an office (otherwise the
 * person would land unscoped and see nothing — the migration-013 footgun).
 */
export function buildOfficeUserProfile(input: NewOfficeUser): OfficeUserProfile {
  if (!OFFICE_ROLES.includes(input.role as OfficeRole)) {
    throw new Error(`invalid role: ${input.role}`);
  }
  const role = input.role as OfficeRole;
  const location_id = role === "admin" ? null : input.location_id;
  if (role !== "admin" && !location_id) {
    throw new Error("office is required for non-admin users");
  }
  return {
    email: input.email,
    full_name: input.full_name,
    role,
    tier: "shop",
    status: "active",
    org_id: JBY_ORG_ID,
    location_id,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/admin-users.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the owner-only server route**

`app/api/admin/create-office-user/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { isOwner } from "@/lib/owner";
import { createServiceClient } from "@/lib/supabase/server";
import { buildOfficeUserProfile } from "@/lib/admin-users";

export async function POST(req: Request) {
  // Owner-only — re-verify server-side, never trust the client.
  const { profile } = await requireAdmin();
  if (!isOwner(profile)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const full_name = String(body?.full_name ?? "").trim();
  const role = String(body?.role ?? "");
  const location_id = body?.location_id ? String(body.location_id) : null;
  const password = String(body?.password ?? "");
  if (!email || !password || password.length < 8 || !full_name) {
    return NextResponse.json(
      { error: "email, full_name, and an 8+ char password are required" },
      { status: 400 }
    );
  }

  let payload;
  try {
    payload = buildOfficeUserProfile({ email, full_name, role, location_id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const admin = await createServiceClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "could not create auth user" },
      { status: 400 }
    );
  }

  // Trigger 013 already inserted a default profile on createUser — promote it.
  const { error: profErr } = await admin
    .from("profiles")
    .update({
      full_name: payload.full_name,
      role: payload.role,
      tier: payload.tier,
      status: payload.status,
      org_id: payload.org_id,
      location_id: payload.location_id,
    })
    .eq("auth_id", created.user.id);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email });
}
```

- [ ] **Step 6: Implement the owner form**

`app/dashboard/technicians/create-office-user-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Office = { id: string; name: string };

export function CreateOfficeUserForm({ locations }: { locations: Office[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("tech");
  const [office, setOffice] = useState(locations[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isAdmin = role === "admin";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/create-office-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email, full_name: fullName, role,
        location_id: isAdmin ? null : office, password,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Failed" }); return; }
    setMsg({ ok: true, text: `Created ${email}. Share the password you set.` });
    setEmail(""); setFullName(""); setPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mb-8 rounded-xl border border-border-line bg-card-bg p-5">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">Add a person to an office</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input required type="text" placeholder="Full name" value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary" />
        <input required type="email" placeholder="email@jeffbrownyachts.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary" />
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary">
          <option value="manager">Manager</option>
          <option value="tech">Edit</option>
          <option value="viewer">Read-only</option>
          <option value="admin">Admin — All offices</option>
        </select>
        <select value={office} disabled={isAdmin}
          onChange={(e) => setOffice(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary disabled:opacity-40">
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input required type="text" placeholder="Temp password (8+ chars)" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary sm:col-span-2" />
      </div>
      {msg && (
        <p className={`mt-3 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}
      <button type="submit" disabled={busy}
        className="mt-4 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-primary-bg hover:bg-gold-hover disabled:opacity-50">
        {busy ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Render the form on the Technicians page**

In `app/dashboard/technicians/page.tsx`, import it and render above `<InviteTechForm />`:
```tsx
import { CreateOfficeUserForm } from "./create-office-user-form";
// ...in JSX, before <InviteTechForm />:
<CreateOfficeUserForm locations={locations ?? []} />
```

- [ ] **Step 8: Typecheck + manual e2e**

Run: `npx tsc --noEmit` → no errors. `npm run dev` as Connor → Technicians → create "Test Person / test.person@jeffbrownyachts.com / Edit / Sausalito / temp pass". Then log in as that user in an incognito window → lands directly in Sausalito, sees only Sausalito. Clean up by deleting the test user via the Delete button afterward.

- [ ] **Step 9: Commit**

```bash
git add lib/admin-users.ts __tests__/admin-users.test.ts app/api/admin/create-office-user/ app/dashboard/technicians/create-office-user-form.tsx app/dashboard/technicians/page.tsx
git commit -m "feat: create a user into an office from the dashboard (owner-only)"
```

---

## Task 8: `add-office-user.mjs` CLI

**Files:**
- Create: `mobile/scripts/add-office-user.mjs`

One-command create + promote, mirroring the in-app route for headless/bulk use.

- [ ] **Step 1: Write the script**

`mobile/scripts/add-office-user.mjs`:
```js
#!/usr/bin/env node
// Create a Marine Tech office user (auth + promoted profile) in one step.
// Usage: node mobile/scripts/add-office-user.mjs <email> <password> <office> <role>
//   office = Seattle | Sausalito | "San Diego" | Newport  (or a location UUID)
//   role   = manager | tech | viewer | admin   (admin => no office)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [, , email, password, officeArg, roleArg = "tech"] = process.argv;
if (!email || !password || !officeArg) {
  console.error('usage: node mobile/scripts/add-office-user.mjs <email> <password> <office> <role>');
  process.exit(1);
}
const JBY_ORG_ID = "e22d5492-3ec1-4d5c-9118-b2eba8880586";
const OFFICES = {
  seattle: "665e7a6b-968b-46a3-87a3-ec6050ab8ffc",
  sausalito: "aca07f4b-2c93-471b-b2ef-a9e4428fab24",
  "san diego": "af0eb6a2-0866-4919-959e-940baea9205d",
  newport: "3a2c83ac-2195-41c3-909a-e7495103c49b",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!["manager", "tech", "viewer", "admin"].includes(roleArg)) {
  console.error(`role must be manager|tech|viewer|admin (got '${roleArg}')`);
  process.exit(1);
}
const locationId =
  roleArg === "admin" ? null
  : UUID_RE.test(officeArg) ? officeArg
  : OFFICES[officeArg.toLowerCase()];
if (roleArg !== "admin" && !locationId) {
  console.error(`unknown office '${officeArg}' (use Seattle|Sausalito|"San Diego"|Newport or a UUID)`);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", "..", ".env.local"), "utf8")
    .split("\n").filter(Boolean)
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const fullName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
let authId;
if (existing) {
  await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  authId = existing.id;
  console.log(`✓ auth user exists (password reset): ${authId}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) { console.error("ERROR:", error.message); process.exit(1); }
  authId = data.user.id;
  console.log(`✓ auth user created: ${authId}`);
}
const { error: pErr } = await admin.from("profiles").update({
  full_name: fullName, role: roleArg, tier: "shop", status: "active",
  org_id: JBY_ORG_ID, location_id: locationId,
}).eq("auth_id", authId);
if (pErr) { console.error("ERROR:", pErr.message); process.exit(1); }
console.log(`✓ profile: role=${roleArg} office=${officeArg}`);
console.log(`\n  Email: ${email}\n  Password: ${password}\n  Role: ${roleArg}\n`);
```

- [ ] **Step 2: Manual smoke test (idempotent)**

Run: `node mobile/scripts/add-office-user.mjs test.cli@jeffbrownyachts.com 'TempPass2026!' Sausalito tech`
Expected: prints auth-created + profile lines. Verify via SQL the profile has `location_id` = Sausalito + `tier='shop'`, then delete the test user (Technicians page or `admin_delete_user`).

- [ ] **Step 3: Commit**

```bash
git add mobile/scripts/add-office-user.mjs
git commit -m "feat: add-office-user.mjs one-command office provisioning"
```

---

## Final Verification (after all tasks)

- [ ] `npx vitest run` → all unit tests pass (owner + admin-users suites green alongside the existing suite).
- [ ] `npx tsc --noEmit` (root) → no errors.
- [ ] Manual end-to-end: Connor login → picker (3 offices + All Offices); pick San Diego → dashboard scoped to San Diego; switch to All Offices via sidebar → aggregate returns. Single-office tech login → no picker, office badge, only their office. Create + reassign a user from the Technicians page works.
- [ ] `npm run deploy` to `marinetech.grayyachts.com` (controller decision — confirm with Connor before deploying).

## Self-Review Notes (coverage vs. spec)

- Part 1 web (picker + login redirect + badge): Tasks 3, 4, 5. ✅
- Part 2 reassign office/role: Task 6 (office) + existing `admin_set_user_role` (role). ✅
- Part 2 create user into office: Task 7 (route + form) + Task 8 (CLI). ✅
- "All Offices = org-wide only": enforced by `isOrgWide` (Task 2) gating the picker page (Task 3) and the badge branch (Task 5). ✅
- Admin stays assignable (Connor's escape hatch): role options in Tasks 6/7 include Admin; admin ⇒ location null. ✅
- RLS/isolation unchanged; new RPC owner-gated (Task 1). ✅
- Mobile (Phase 2): intentionally deferred to a separate plan. 
