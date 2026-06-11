// Verify a Cloudflare Turnstile response token server-side. The login form
// renders the widget client-side and POSTs the resulting `token` here BEFORE
// running Supabase auth. If verification fails the login is refused — no
// password attempt is even made against Supabase.
//
// Secret rotation: set TURNSTILE_SECRET as a Wrangler secret on the
// marine-tech-dashboard worker. Until that's set, the default Cloudflare
// always-passes test secret is used — which means *no real bot protection*
// is in place. The page UX is identical; only the verification semantics
// change once the real secret lands.

// Cloudflare-documented test secret that always returns success=true.
const TEST_SECRET = "1x0000000000000000000000000000000AA";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.TURNSTILE_SECRET || TEST_SECRET;

  let body: { token?: unknown };
  try { body = (await req.json()) as { token?: unknown }; }
  catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return Response.json({ ok: false, error: "token required" }, { status: 400 });

  // Cloudflare siteverify also wants the client IP for stricter checks.
  // Workers expose it on the CF-Connecting-IP header.
  const ip = req.headers.get("cf-connecting-ip") ?? "";
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  let resp: Response;
  try {
    resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
  } catch {
    return Response.json({ ok: false, error: "verify unreachable" }, { status: 502 });
  }
  const data = await resp.json() as { success?: boolean; "error-codes"?: string[] };
  if (data.success) {
    return Response.json({ ok: true });
  }
  return Response.json(
    { ok: false, error: "challenge failed", codes: data["error-codes"] ?? [] },
    { status: 403 },
  );
}
