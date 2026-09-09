import { assess, nextState } from './checks.mjs';

async function probe(url, headers = {}, json = false, method = 'GET') {
  try {
    const response = await fetch(url, { method, headers, signal: AbortSignal.timeout(20_000), redirect: 'manual' });
    if (!response.ok) return { ok: false, status: response.status };
    const data = json ? await response.json() : null;
    return { ok: true, status: response.status, data };
  } catch (error) { return { ok: false, error: String(error) }; }
}

async function check(env) {
  const base = env.SUPABASE_URL;
  const [auth, rest, database, dashboard, parts] = await Promise.all([
    probe(`${base}/auth/v1/health`, { apikey: env.SUPABASE_PUBLIC_KEY }, true),
    probe(`${base}/rest/v1/profiles?select=id&limit=1`, { apikey: env.SUPABASE_PUBLIC_KEY }, true),
    probe(`${base}/functions/v1/backend-health-probe`, { 'x-monitor-token': env.BACKEND_MONITOR_TOKEN }, true),
    probe('https://marinetech.grayyachts.com/login'),
    probe(`${base}/functions/v1/parts-order-email`, { 'x-cron-secret': env.PARTS_CRON_SECRET }, true, 'POST'),
  ]);
  const issues = assess({ auth, rest, database, dashboard });
  if (!parts.ok || parts.data?.ok !== true) issues.push('Parts notification worker failed');
  const previous = await env.STATE.get('health', 'json');
  const now = Date.now();
  const { state, kind } = nextState(previous, issues, now);
  state.checkedAt = new Date(now).toISOString();
  state.emailConfigured = Boolean(env.ALERT_TO && env.RESEND_API_KEY);
  state.parts = { ok: parts.ok && parts.data?.ok === true, sent: parts.data?.sent ?? null };
  state.metrics = database.data?.ok ? database.data : null;
  if (kind && state.emailConfigured) {
    const body = kind === 'outage' ? `Marine Tech backend needs attention.\n\n${issues.join('\n')}\n\n${state.checkedAt}` : `Marine Tech backend has recovered.\n\n${state.checkedAt}`;
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.ALERT_FROM, to: env.ALERT_TO, subject: kind === 'outage' ? 'Marine Tech: backend alert' : 'Marine Tech: recovered', text: body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (result.ok) { state.alerted = kind === 'outage'; state.lastEmailAt = now; }
    else state.emailError = `Delivery rejected: ${result.status}`;
  }
  await env.STATE.put('health', JSON.stringify(state));
  console.log(JSON.stringify({ ok: issues.length === 0, issues, parts: state.parts, emailConfigured: state.emailConfigured }));
  return state;
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(check(env)); },
  async fetch(request, env) {
    if (!env.MONITOR_ADMIN_TOKEN || request.headers.get('authorization') !== `Bearer ${env.MONITOR_ADMIN_TOKEN}`) return new Response('Unauthorized', { status: 401 });
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/check') return Response.json(await check(env));
    if (request.method === 'GET' && path === '/status') return Response.json(await env.STATE.get('health', 'json'));
    return new Response('Not found', { status: 404 });
  },
};
