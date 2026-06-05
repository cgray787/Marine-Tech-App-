// Owner gate — STRICTER than admin. Only the operator (Connor) sees and can
// use the Users & Access (Technicians) page; admins like Darik can still edit
// data everywhere else, but they can't change teammates' role assignments.
//
// Email allowlist (instead of a profiles.is_owner column) so this ships
// without a schema migration. Add a column + SQL is_owner() helper when the
// next migration round happens — defense-in-depth at the RPC layer.

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

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

// Gate a server component to owners only. Non-owners (even admins) bounce
// back to the dashboard with a query param the UI can ignore or surface.
export async function requireOwner() {
  const ctx = await requireAdmin();
  if (!isOwner(ctx.profile)) {
    redirect("/dashboard?error=owner_only");
  }
  return ctx;
}
