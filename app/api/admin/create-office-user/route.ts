import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { isOwner } from "@/lib/owner";
import { createServiceClient } from "@/lib/supabase/server";
import { buildOfficeUserProfile } from "@/lib/admin-users";

export async function POST(req: Request) {
  // Owner-only — re-verify server-side, never trust the client.
  const { profile } = await requireAdmin();
  if (!isOwner(profile)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const full_name = String(body?.full_name ?? "").trim();
  const role = String(body?.role ?? "");
  const location_id = body?.location_id ? String(body.location_id) : null;
  const password = String(body?.password ?? "");
  if (!email || !password || password.length < 8 || !full_name) {
    return NextResponse.json(
      { error: "email, full_name, and an 8+ char password are required" },
      { status: 400 }
    );
  }

  let payload;
  try {
    payload = buildOfficeUserProfile({ email, full_name, role, location_id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const admin = await createServiceClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "could not create auth user" },
      { status: 400 }
    );
  }

  // Trigger 013 already inserted a default profile on createUser — promote it.
  const { error: profErr } = await admin
    .from("profiles")
    .update({
      full_name: payload.full_name,
      role: payload.role,
      tier: payload.tier,
      status: payload.status,
      org_id: payload.org_id,
      location_id: payload.location_id,
    })
    .eq("auth_id", created.user.id);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email });
}
