import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { adminDb, getConnection, qbConfigured } from "@/lib/quickbooks/server";

/**
 * GET /api/quickbooks/status
 * Any authenticated dashboard role may read connection status.
 * Returns { configured, connected, companyName, realmId } — NO tokens.
 */
export async function GET(): Promise<Response> {
  // Authenticate — any dashboard role
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore in Server Component context
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_id", user.id)
    .single();

  const allowedRoles = ["admin", "manager", "tech", "viewer"];
  if (!profile || !allowedRoles.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = qbConfigured();

  if (!configured) {
    return NextResponse.json({ configured: false, connected: false, companyName: null, realmId: null });
  }

  const db = adminDb();
  const conn = await getConnection(db);

  return NextResponse.json({
    configured: true,
    connected: Boolean(conn),
    companyName: conn?.company_name ?? null,
    realmId: conn?.realm_id ?? null,
  });
}
