/**
 * lib/location/server.ts
 *
 * Server-only location helpers for dashboard pages.
 * locationFilterFor returns the profile's location_id when the role is
 * location-scoped (manager / tech / viewer), or null for org-wide roles
 * (admin) so callers can skip the filter entirely.
 */

type Profile = {
  role?: string | null;
  location_id?: string | null;
  [key: string]: unknown;
};

/**
 * Returns the location_id to filter queries by, or null if the profile
 * has org-wide visibility (admin role).
 */
export async function locationFilterFor(
  profile: Profile | null | undefined
): Promise<string | null> {
  if (!profile) return null;
  if (profile.role === "admin") return null;
  return profile.location_id ?? null;
}
