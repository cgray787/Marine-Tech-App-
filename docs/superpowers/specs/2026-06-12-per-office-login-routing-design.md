# Per-Office Login Routing + Owner Office Management — Design

**Date:** 2026-06-12
**Status:** Design (awaiting review → writing-plans)
**Author:** Connor + Claude
**Touches:** Web admin dashboard (Next.js), mobile app (Expo), Supabase (one RPC + optional invite columns)

## Summary

Make office context explicit at login on the **existing** Marine Tech App — no new dashboard, no new Supabase project, no new repo. Each office stays isolated by the login credential (already enforced by location-scoped RLS). This adds:

1. **Login → office routing.** On login, an org-wide user (Owner / admin, `location_id IS NULL`) is sent to a **Choose Office** screen (San Diego · Sausalito · Seattle · All Offices). A single-office user (manager / tech / viewer, `location_id` set) skips the picker and lands straight in their office with an **office badge**.
2. **Owner office management.** From the owner-gated Technicians (Users & Access) page, the Owner can (a) **create** a user with email + name + role + office in one step, and (b) **reassign** any existing user's office and role. This closes the migration-013 "invitee lands with no office" footgun without SQL.

The whole feature rides on infrastructure that already exists: the `mt-location` cookie, `lib/location/*`, `LocationSwitcher`, the `admin_set_user_role` RPC pattern, the `is_owner()` SQL guard, and the `SUPABASE_SERVICE_ROLE_KEY` Cloudflare secret.

## Goals

- Owner, on every login, explicitly picks which office (or All Offices) they're working out of — on both the web dashboard and the mobile app.
- Techs / managers / viewers auto-land in their one office, with a visible office badge, and **never** see the picker.
- Owner can add a person directly into an office (with a role) from the dashboard, and move people between offices, without touching SQL.
- Zero change to data isolation: offices remain walled off exactly as today (verified: a San Diego manager sees 0 of Seattle's 42 customers).

## Non-Goals

- No separate databases / GitHub repos / dashboard URLs per office (explicitly decided against — keeps the single owner-sees-all view and one codebase).
- No schema change to how `customers` / `boats` / `jobs` / `work_orders` are stored. They are already location-tagged and RLS-scoped.
- No change to the mobile **join-code self-signup** flow (still unbuilt — gap 2 in the expansion runbook; out of scope here).
- No per-office price-level rates (the `price_levels` table is org-scoped by design; a separate decision if ever wanted).

## The One Rule

Everything branches on a single predicate, computed from the signed-in profile:

```
orgWide(profile)  ==  profile.role === 'admin'  ||  isOwner(profile)
```

- `orgWide === true`  → show the Office picker; apply the chosen office as a **client-side filter** (the `mt-location` cookie on web; a location context on mobile). This is exactly what `lib/location/server.ts#locationFilterFor()` already encodes.
- `orgWide === false` → single office. RLS already scopes every row. Show a static office **badge**; ignore any location cookie.

This mirrors the existing `showLocationSwitcher={orgWide}` logic in `app/dashboard/layout.tsx` — we are extending it, not inventing it.

## Part 1 — Login → Office Routing

### Web dashboard

**Today:** `app/login/page.tsx` ends a successful sign-in with `window.location.href = "/dashboard"`. `app/dashboard/layout.tsx` calls `requireAdmin()`, and for org-wide users reads `locations` + `activeLocation()` and renders the sidebar `LocationSwitcher`.

**Change:**

1. **New route `app/dashboard/choose-office/page.tsx`** (server component):
   - `const { profile, supabase } = await requireAdmin();`
   - If **not** org-wide → `redirect("/dashboard")` (single-office users never see it; the redirect is instant).
   - If org-wide → load `locations` (`id, name` ordered) and render a client `<OfficePicker locations current={activeLocation()} />`.
2. **New client component `app/dashboard/choose-office/office-picker.tsx`**:
   - Grid of office cards: each location + an "All Offices" card. Anchor-icon styling, gold accent, matches the design scheme.
   - On select → `setLocationCookie(id | null)` (existing `lib/location/client.ts`) → `window.location.href = "/dashboard"`.
   - Pre-highlights `current` so the Owner's last pick is the default.
3. **Login redirect target** (`app/login/page.tsx`): change the final hard-nav to `window.location.href = "/dashboard/choose-office"`. The chooser self-redirects single-office users onward, so this is invisible to them and a one-tap step for the Owner — and it fires on **every** login (the requirement), while in-session navigation never re-prompts (the cookie persists).

**Office badge (single-office users), web:** in `app/dashboard/layout.tsx`, for non-org-wide users, fetch their own location name (`locations` row for `profile.location_id`) and pass it to `Sidebar` as a static badge in the slot where the `LocationSwitcher` would be. Org-wide users keep the switcher (so the Owner can change office mid-session without re-login).

### Mobile app (Phase 2 — see Phasing)

**Today:** `mobile/app/login.tsx` ends with `router.replace("/(tabs)")` for password + Apple + Google paths. `auth-context.tsx` already fetches the full profile (`role`, `location_id`).

**Change:**

1. **New screen `mobile/app/choose-office.tsx`** — same office-card UX, native.
2. **New `mobile/lib/location-context.tsx`** — holds the selected office id (persisted in SecureStore), mirrors the web cookie. Exposes `useLocationFilter()`.
3. **Routing:** after sign-in, if `orgWide(profile)` → `router.replace("/choose-office")`; else `router.replace("/(tabs)")`. The chooser writes the context then enters the tabs.
4. **Apply the filter:** thread the selected office into the mobile data queries that the Owner would view across offices — `mobile/lib/calendar/queries.ts` and the clients / jobs / work-order reads — as a `location_id` filter (same `customers!inner(location_id)` embed pattern the web uses). Single-office users pass `null` (RLS already scopes them), so their behavior is unchanged.
5. **Office badge** in the app header for everyone, showing the current office.

> Techs (the primary mobile users) already get correct isolation with **zero** changes — only the Owner's cross-office mobile view needs the new client-side filter. That's why mobile is Phase 2.

## Part 2 — Owner Office Management (dashboard)

All owner-gated (sidebar filter + page redirect + SQL `is_owner()`), consistent with the existing Technicians page.

### 2a. Reassign an existing user's office + role

- **Migration `037_admin_set_user_location.sql`** — new `SECURITY DEFINER` RPC:
  ```
  admin_set_user_location(target_profile uuid, new_location uuid)
  ```
  - Guarded by `public.is_owner()` (raises otherwise), and blocks acting on self — same shape as `admin_set_user_role` (migration 024 / re-gated in 026).
  - When `new_location` is a real location: set `location_id = new_location`, `tier = 'shop'` (so the user becomes office-scoped — fixes the migration-013 footgun where invitees are `individual` + NULL and see nothing).
  - When `new_location IS NULL`: set `location_id = NULL` ("No office" / unassigned).
- **UI:** add an **Office** `<select>` to `app/dashboard/technicians/manage-user-controls.tsx`, next to the existing Access (role) select. Options = the org's locations + "No office". On change → `supabase.rpc("admin_set_user_location", …)` → `router.refresh()`. `technicians/page.tsx` passes the locations list + each user's `location_id` into the control.

### 2b. Create a user directly into an office

- **New owner-gated server route `app/api/admin/create-office-user/route.ts`** (POST): body `{ email, full_name, role, location_id, password }`.
  - Re-verify the caller is the Owner server-side (`requireOwner()`); never trust the client.
  - Use the **service-role** client (`SUPABASE_SERVICE_ROLE_KEY`) to `auth.admin.createUser({ email, password, email_confirm: true })`, then upsert the profile with `role`, `tier='shop'`, `org_id` (JBY), `location_id`, `status='active'`. This is the in-app equivalent of `mobile/scripts/add-user.mjs` + the promote step — exactly how `justin@` / `service@` were provisioned.
  - Returns the created login (email + the temp password the Owner entered) for the Owner to hand off.
- **UI:** an owner-only "Add person to office" form on the Technicians page (extends/sits beside `invite-tech-form.tsx`): email, name, role (Manager / Edit / Read-only), office (locations dropdown), temp password. Posts to the route, then `router.refresh()`.
- **CLI parity:** `mobile/scripts/add-office-user.mjs <email> <password> <office-name|uuid> <role>` — one-command create + promote, for headless/bulk use (wraps the same logic as the route).

> The existing email-invite flow (`invite-tech-form.tsx` → `send-invite`) is left intact but is no longer the only path; the direct create flow avoids the invitee-footgun entirely because the office + role are set at creation.

## Security / RLS

- **No new data exposure.** Office isolation is unchanged — it is enforced by the location-scoped RLS policies (migrations 017 / 018 / 027 / 028 / 029 / 034 / 035). The picker only sets a **client-side view filter** for users who can already see everything (Owner / admin). A single-office user who tampered with the cookie still gets only their office's rows from the database.
- **New RPC is owner-only** (`is_owner()`), like `admin_set_user_role`. A hostile admin calling it over REST gets `forbidden`.
- **Create-user route is owner-only and server-side**; the service-role key never reaches the browser.

## Phasing

- **Phase 1 — Web dashboard (priority).** Part 1 web (choose-office route + picker + login redirect + badge) and all of Part 2 (RPC + reassign UI + create-user route/form + script). This is where the Owner actually works and covers the explicit asks ("when I enter into the admin, I can choose the office", "create a user plus location", "assign office role").
- **Phase 2 — Mobile app.** Part 1 mobile (choose-office screen + location context + query filtering + badge). Techs are already correctly isolated, so this is the Owner's cross-office mobile view.

Each phase ships independently; Phase 1 has no dependency on Phase 2.

## Files

**Web (Phase 1):**
- `app/dashboard/choose-office/page.tsx` (new)
- `app/dashboard/choose-office/office-picker.tsx` (new)
- `app/login/page.tsx` (redirect target)
- `app/dashboard/layout.tsx` (single-office badge data)
- `app/dashboard/sidebar.tsx` (render static office badge)
- `app/dashboard/technicians/page.tsx` (pass locations + current location into controls; add create form)
- `app/dashboard/technicians/manage-user-controls.tsx` (Office select)
- `app/dashboard/technicians/create-office-user-form.tsx` (new)
- `app/api/admin/create-office-user/route.ts` (new, owner-gated, service-role)
- `supabase/migrations/037_admin_set_user_location.sql` (new)
- `mobile/scripts/add-office-user.mjs` (new CLI)

**Mobile (Phase 2):**
- `mobile/app/choose-office.tsx` (new)
- `mobile/lib/location-context.tsx` (new)
- `mobile/app/login.tsx` (route on orgWide)
- `mobile/lib/calendar/queries.ts` + clients/jobs/work-order reads (location filter)
- app header badge

## Testing

- **Web unit (vitest):** `orgWide()` predicate; `admin_set_user_location` argument shaping; office-picker writes the right cookie value (incl. All Offices = clear).
- **Migration verify (Supabase MCP):** impersonate (a) a non-owner admin calling `admin_set_user_location` → forbidden; (b) Owner reassigning a tech → `location_id` + `tier='shop'` updated; confirm cross-office isolation still holds after reassignment.
- **Manual:** Owner login → chooser appears → pick San Diego → dashboard shows San Diego only; tech (`justin@` once demoted to tech for the test, or `sandiego.tech@`) login → no chooser, San Diego badge, sees only San Diego. Create a user into Sausalito from the form → that login lands in Sausalito.

## Open Decisions (resolve during planning)

1. **Owner-picker every login vs. remember-last:** chosen = **every login** (Owner picked "pick-an-office screen first"). The cookie still remembers the last office as the pre-selected default.
2. **"All Offices" representation:** continue using cleared cookie / `null` (existing convention in `parseLocationValue`). No new sentinel value.
3. **Temp-password handoff** for create-user: Owner types the temp password in the form and reads it back from the success state (no email sent). Acceptable for now; revisit if a self-set-password invite is preferred later.
