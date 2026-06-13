import { NextResponse } from "next/server";
import { adminDb, getConnection, REVOKE_URL, basicAuthHeader, requireQbRole } from "@/lib/quickbooks/server";

/**
 * POST /api/quickbooks/disconnect
 * Revokes the refresh token with Intuit (best-effort) and deletes the
 * qb_connections row. Requires admin | manager role.
 */
export async function POST(): Promise<Response> {
  try {
    await requireQbRole();
  } catch (res) {
    return res as Response;
  }

  const db = adminDb();
  const conn = await getConnection(db);

  if (!conn) {
    // Already disconnected
    return NextResponse.json({ ok: true });
  }

  // Best-effort: revoke the refresh token with Intuit
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ token: conn.refresh_token }).toString(),
    });
  } catch {
    // Non-fatal — proceed to delete the local row regardless
  }

  // Delete the connection row
  const { error } = await db
    .from("qb_connections")
    .delete()
    .eq("org_id", conn.org_id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
