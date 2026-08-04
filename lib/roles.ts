/**
 * Roles allowed to reach the web dashboard.
 *
 * This list was previously written out three times — twice in
 * lib/supabase/middleware.ts and once in lib/admin.ts — and the copies drifted.
 * Migration 027 added `manager` and lib/admin.ts was updated to accept it and
 * `tech`; the middleware was not. Middleware runs first, so the stale narrow list
 * won and every manager and tech was bounced to /login?error=unauthorized before
 * a page could render. That was 7 of 11 active accounts locked out of the
 * dashboard, while lib/admin.ts said they were welcome.
 *
 * Pure module with no imports so both the edge middleware and server components
 * can share it.
 */
export const DASHBOARD_ROLES = ["admin", "manager", "tech", "viewer"] as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export function canAccessDashboard(role: string | null | undefined): boolean {
  return !!role && (DASHBOARD_ROLES as readonly string[]).includes(role);
}
