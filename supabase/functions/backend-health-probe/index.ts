// The external monitor receives only aggregate capacity metrics. Its dedicated
// token cannot authenticate to the database or access business records.
Deno.serve(async (request: Request) => {
  const expected = Deno.env.get("BACKEND_MONITOR_TOKEN");
  const actual = request.headers.get("x-monitor-token") ?? "";
  if (!expected || actual.length !== expected.length) {
    return new Response("Unauthorized", { status: 401 });
  }
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  if (difference !== 0) return new Response("Unauthorized", { status: 401 });
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const response = await fetch(`${url}/rest/v1/rpc/backend_health_snapshot`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return Response.json({ ok: false, error: "Database probe failed" }, { status: 503 });
    const metrics = await response.json();
    return Response.json({ ok: true, ...metrics }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Database probe unreachable" }, { status: 503 });
  }
});
