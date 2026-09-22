import { EmailMessage } from "cloudflare:email";
import { assess, nextState } from "./checks.mjs";

async function probe(url, headers = {}, json = false) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), redirect: "follow" });
    if (!response.ok) return { ok: false, status: response.status };
    const data = json ? await response.json() : null;
    return { ok: true, status: response.status, data };
  } catch {
    return { ok: false, error: "Request timed out or connection failed" };
  }
}

async function sendEmail(env, subject, body) {
  const from = "marine-tech-alerts@grayyachts.com";
  const message = [
    `From: Marine Tech Alerts <${from}>`,
    `To: ${env.ALERT_TO}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "", body,
  ].join("\r\n");
  await env.ALERT_EMAIL.send(new EmailMessage(from, env.ALERT_TO, message));
}

async function check(env) {
  const base = env.SUPABASE_URL;
  const [auth, rest, database, dashboard] = await Promise.all([
    probe(`${base}/auth/v1/health`, { apikey: env.SUPABASE_PUBLIC_KEY }, true),
    probe(`${base}/rest/v1/profiles?select=id&limit=1`, { apikey: env.SUPABASE_PUBLIC_KEY }, true),
    probe(`${base}/functions/v1/backend-health-probe`, { "x-monitor-token": env.BACKEND_MONITOR_TOKEN }, true),
    probe("https://marinetech.grayyachts.com/login"),
  ]);
  const issues = assess({ auth, rest, database, dashboard });
  const previous = await env.STATE.get("health", "json");
  const now = Date.now();
  const { state, kind } = nextState(previous, issues, now);
  if (kind) {
    const body = kind === "outage"
      ? `Marine Tech needs attention. Two or more consecutive checks failed.\n\n${issues.join("\n")}\n\nhttps://supabase.com/dashboard/project/ikfcnqdrlvhvlyhiuphs\nChecked: ${new Date(now).toISOString()}`
      : `Marine Tech's monitored endpoints and capacity checks have recovered.\n\nhttps://marinetech.grayyachts.com\nChecked: ${new Date(now).toISOString()}`;
    // Persist the sent state only after successful delivery acceptance. If email
    // sending fails, the next scheduled invocation must retry the notification.
    await sendEmail(env, kind === "outage" ? "Marine Tech: backend alert" : "Marine Tech: recovered", body);
    state.alerted = kind === "outage";
    state.lastEmailAt = now;
  }
  await env.STATE.put("health", JSON.stringify(state));
  console.log(JSON.stringify({ ok: issues.length === 0, issues, notified: kind }));
  return state;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(check(env));
  },
  async fetch(request, env) {
    if (!env.MONITOR_ADMIN_TOKEN || request.headers.get("authorization") !== `Bearer ${env.MONITOR_ADMIN_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/check") return Response.json(await check(env));
    if (request.method === "POST" && path === "/test-email") {
      await sendEmail(env, "Marine Tech: email monitoring enabled", "Marine Tech email monitoring is enabled. Checks run every five minutes. You will receive alerts after two consecutive failed checks, hourly reminders during an incident, and a recovery email. Capacity checks watch transaction-log growth and read-only mode.");
      return Response.json({ accepted: true });
    }
    if (request.method === "GET" && path === "/status") return Response.json(await env.STATE.get("health", "json"));
    return new Response("Not found", { status: 404 });
  },
};
