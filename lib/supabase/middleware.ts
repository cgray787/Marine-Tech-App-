import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessDashboard } from "@/lib/roles";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Session refresh may rotate cookies even when this request redirects.
  function redirect(url: URL) {
    const response = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  }
  const path = request.nextUrl.pathname;

  // Protect /dashboard routes
  if (path.startsWith("/dashboard")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return redirect(url);
    }

    // Check admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("auth_id", user.id)
      .single();

    // Gated to the same roles lib/admin.ts accepts. Keeping this in one shared
    // constant is deliberate — the two lists had drifted, and because middleware
    // runs first the stricter one silently won.
    if (profile?.status !== "active" || !canAccessDashboard(profile?.role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "unauthorized");
      return redirect(url);
    }
  }

  // Redirect an already-authenticated dashboard user away from login
  if (path === "/login" && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("auth_id", user.id)
      .single();

    if (profile?.status === "active" && canAccessDashboard(profile?.role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return redirect(url);
    }
  }

  return supabaseResponse;
}
