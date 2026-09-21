import { NextResponse } from "next/server";

// Liveness probe for ops/backend-maintenance. Deliberately trivial: no auth,
// no database, no Supabase client, no Turnstile — it answers exactly one
// question, "is this Worker up and executing?", and nothing else.
//
// It exists because the monitor used to probe /login, a full Next.js page
// render. That made every health check depend on the framework's render path
// and cold start, so a slow render read as a backend outage and emailed an
// alert. A liveness check must be cheaper than the thing it is checking.
//
// NOTE: do NOT add `export const runtime = "edge"` here. Under
// opennextjs-cloudflare that returns 500s; force-dynamic is the supported way
// to keep a route off the static path.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, service: "marine-tech-dashboard", ts: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } }
  );
}
