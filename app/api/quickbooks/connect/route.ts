import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { qbConfigured, qbRedirectUri, requireQbRole } from "@/lib/quickbooks/server";

export async function GET(): Promise<Response> {
  try {
    await requireQbRole();
  } catch (res) {
    return res as Response;
  }

  if (!qbConfigured()) {
    return NextResponse.redirect(
      new URL(
        "/dashboard/work-orders/settings?qb=unconfigured",
        process.env.NEXT_PUBLIC_SUPABASE_URL
          ? "https://marinetech.grayyachts.com"
          : "http://localhost:3000"
      )
    );
  }

  const state = crypto.randomUUID();

  // Store state in a short-lived httpOnly cookie to verify on callback
  const cookieStore = await cookies();
  cookieStore.set("qb_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.INTUIT_CLIENT_ID!,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: qbRedirectUri(),
    state,
  });

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
