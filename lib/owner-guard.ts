// Server-only owner guard. Uses requireAdmin() (which touches next/headers)
// so this file MUST NOT be imported from any "use client" component.
// Pair with lib/owner.ts which holds the pure isOwner() check that's safe
// to import client-side.

import "server-only";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { isOwner } from "@/lib/owner";

// Gate a server component to owners only. Non-owners (even admins) bounce
// back to the dashboard with a query param the UI can use to surface a
// "read-only access" message later if we want.
export async function requireOwner() {
  const ctx = await requireAdmin();
  if (!isOwner(ctx.profile)) {
    redirect("/dashboard?error=owner_only");
  }
  return ctx;
}
