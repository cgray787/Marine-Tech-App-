// Verify a Cloudflare Turnstile response token server-side. The login form
// renders the widget client-side and POSTs the resulting `token` here BEFORE
// running Supabase auth. If verification fails the login is refused — no
// password attempt is even made against Supabase.
//
// Production fails closed if the verification secret is missing.

// Cloudflare-documented test secret that always returns success=true.
const TEST_SECRET = "1x0000000000000000000000000000000AA";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.TURNSTILE_SECRET || (process.env.NODE_ENV !== "production" ? TEST_SECRET : "");
  if (!secret) return Response.json({ ok: false, error: "verification unavailable" }, { status: 503 });

  let body: { token?: unknown };
  try { body = (await req.json()) as { token?: unknown }; }
  catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token || token.length > 2048) return Response.json({ ok: false, error: "token required" }, { status: 400 });

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
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json({ ok: false, error: "verify unreachable" }, { status: 502 });
  }
  if (!resp.ok) return Response.json({ ok: false, error: "verify unavailable" }, { status: 502 });
  const data = await resp.json().catch(() => ({})) as { success?: boolean; "error-codes"?: string[] };
  if (data.success) {
    return Response.json({ ok: true });
  }
  return Response.json(
    { ok: false, error: "challenge failed", codes: data["error-codes"] ?? [] },
    { status: 403 },
  );
}
