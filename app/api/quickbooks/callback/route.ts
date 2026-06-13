import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCode,
  adminDb,
  saveConnection,
  qbApiBase,
  qbFetch,
  requireQbRole,
} from "@/lib/quickbooks/server";

const SETTINGS_BASE = "/dashboard/work-orders/settings";

function redirectError(msg: string): Response {
  const encoded = encodeURIComponent(msg.slice(0, 120));
  return NextResponse.redirect(
    new URL(
      `${SETTINGS_BASE}?qb=error&msg=${encoded}`,
      "https://marinetech.grayyachts.com"
    )
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const realmId = searchParams.get("realmId");
  const error = searchParams.get("error");

  if (error) return redirectError(error);
  if (!code || !state || !realmId) return redirectError("missing_params");

  // Verify state cookie
  const cookieStore = await cookies();
  const storedState = cookieStore.get("qb_oauth_state")?.value;

  // Clear state cookie regardless of outcome
  cookieStore.set("qb_oauth_state", "", { maxAge: 0, path: "/" });

  if (!storedState || storedState !== state) {
    return redirectError("state_mismatch");
  }

  // Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (err) {
    return redirectError("token_exchange_failed");
  }

  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString();
  const refreshExpiresAt = new Date(
    now.getTime() + tokens.x_refresh_token_expires_in * 1000
  ).toISOString();

  // Identify the connecting user (non-fatal — profile may not exist)
  let connectedBy: string | null = null;
  try {
    const { profile } = await requireQbRole();
    connectedBy = profile.id as string;
  } catch {
    // ignore — connection still saves
  }

  const db = adminDb();

  // Fetch company name from QBO CompanyInfo (non-fatal)
  let companyName: string | null = null;
  try {
    // We need a temporary connection to use qbFetch; build it inline
    const res = await fetch(
      `${qbApiBase()}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      }
    );
    if (res.ok) {
      const json = await res.json();
      companyName = json?.CompanyInfo?.CompanyName ?? null;
    }
  } catch {
    // Non-fatal — connection saves without company name
  }

  try {
    await saveConnection(db, {
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_expires_at: accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      company_name: companyName,
      connected_by: connectedBy,
      updated_at: now.toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "save_failed";
    return redirectError(msg);
  }

  return NextResponse.redirect(
    new URL(`${SETTINGS_BASE}?qb=connected`, "https://marinetech.grayyachts.com")
  );
}
