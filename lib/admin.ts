import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Admin OR viewer required. Use for any /dashboard server component that
 * needs read access. Returns `profile` so callers can check `profile.role`
 * to gate write actions in the UI.
 */
export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "viewer")) {
    redirect("/login?error=unauthorized");
  }

  return { user, profile, supabase };
}

/**
 * Strict admin gate — use only on routes that perform destructive or
 * write actions where the page itself shouldn't load for viewers.
 * For most pages prefer requireAdmin() + per-action `canWrite(profile)`.
 */
export async function requireStrictAdmin() {
  const ctx = await requireAdmin();
  if (ctx.profile.role !== "admin") {
    redirect("/dashboard?error=read_only");
  }
  return ctx;
}

export function canWrite(profile: { role?: string | null } | null | undefined): boolean {
  return profile?.role === "admin";
}
