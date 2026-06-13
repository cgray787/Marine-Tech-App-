import { cookies } from "next/headers";
import { isOrgWide, type OwnerCandidate } from "@/lib/owner";
import { LOCATION_COOKIE, parseLocationValue } from "./constants";

/**
 * The owner/admin "viewing office" filter for /dashboard server components.
 * null = all offices. Only meaningful for org-wide users (admins + the
 * Owner) — managers/techs/viewers are already location-scoped by RLS, so
 * callers must gate on role before applying it.
 */
export async function activeLocation(): Promise<string | null> {
  const store = await cookies();
  return parseLocationValue(store.get(LOCATION_COOKIE)?.value);
}

/**
 * The location filter a /dashboard page should apply for this profile:
 * the cookie value for org-wide users, always null for everyone else
 * (RLS already scopes them — a stale cookie must not skew their counts).
 */
export async function locationFilterFor(
  profile: (OwnerCandidate & { role?: string | null }) | null | undefined
): Promise<string | null> {
  return isOrgWide(profile) ? activeLocation() : null;
}
