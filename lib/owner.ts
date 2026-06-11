// Pure isOwner check — NO server imports here so this module is safe to import
// from "use client" components (like the sidebar). The server-side
// requireOwner() guard lives in lib/owner-guard.ts and is the only file that
// touches next/headers via requireAdmin.
//
// Email + auth_id allowlist (no schema migration). When we add a real
// profiles.is_owner column in a future migration round, swap the lookups here
// and the SQL helper at the same time.

const OWNER_EMAILS = new Set<string>([
  "connorgray@jeffbrownyachts.com",      // canonical admin per CLAUDE.md
  "connorgray41@gmail.com",              // personal account
  "xv2hp9sc2j@privaterelay.appleid.com", // Apple Sign-In hide-my-email alias
]);

const OWNER_AUTH_IDS = new Set<string>([
  "ec4c6451-623a-4a41-9dde-0cd48afc767d", // CLAUDE.md admin auth_id
]);

export interface OwnerCandidate {
  email?: string | null;
  auth_id?: string | null;
  id?: string | null;
}

export function isOwner(profile: OwnerCandidate | null | undefined): boolean {
  if (!profile) return false;
  const email = (profile.email ?? "").toLowerCase().trim();
  if (email && OWNER_EMAILS.has(email)) return true;
  const authId = profile.auth_id ?? profile.id ?? "";
  if (authId && OWNER_AUTH_IDS.has(authId)) return true;
  return false;
}
