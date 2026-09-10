import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

function environment() {
  let stored = null;
  return {
    SUPABASE_URL: 'https://backend.example', SUPABASE_PUBLIC_KEY: 'public',
    BACKEND_MONITOR_TOKEN: 'probe-token', MONITOR_ADMIN_TOKEN: 'admin-token', PARTS_CRON_SECRET: 'parts-token',
    STATE: { get: async () => stored, put: async (_key, value) => { stored = JSON.parse(value); } },
  };
}
const request = () => new Request('https://worker.example/check', { method: 'POST', headers: { authorization: 'Bearer admin-token' } });

test('persists health after email timeout and clears the error after a successful retry', async (t) => {
  let rejectEmail = true;
  t.mock.method(globalThis, 'fetch', async url => {
    if (url === 'https://api.resend.com/emails') {
      if (rejectEmail) throw new Error('network timeout');
      return Response.json({ id: 'accepted' });
    }
    if (url.endsWith('/backend-health-probe')) return new Response('Unavailable', { status: 503 });
    if (url.endsWith('/parts-order-email')) return Response.json({ ok: true, sent: 0 });
    return Response.json({});
  });
  const env = { ...environment(), ALERT_TO: 'admin@example.com', RESEND_API_KEY: 'test', ALERT_FROM: 'test@example.com' };
  await worker.fetch(request(), env);
  const failed = await (await worker.fetch(request(), env)).json();
  assert.equal(failed.consecutiveFailures, 2);
  assert.equal(failed.emailError, 'Delivery request failed or timed out');
  assert.equal(failed.alerted, undefined);
  assert.deepEqual(await env.STATE.get(), failed);
  rejectEmail = false;
  const retried = await (await worker.fetch(request(), env)).json();
  assert.equal(retried.consecutiveFailures, 3);
  assert.equal(retried.alerted, true);
  assert.equal(retried.emailError, undefined);
});

test('rejects unauthorized maintenance requests without calling backend', async () => {
  const result = await worker.fetch(new Request('https://worker.example/check', { method: 'POST' }), environment());
  assert.equal(result.status, 401);
});

test('runs existing parts handler and saves health without sending unconfigured email', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/backend-health-probe')) return Response.json({ ok: true, database_bytes: 50000000, resources: { observedAt: '2026-09-09T00:00:00Z', availableBytes: 900000000, sizeBytes: 1000000000, disks: [] }, wal_bytes: 1073741824, read_only: false });
    if (url.endsWith('/parts-order-email')) return Response.json({ ok: true, sent: 0 });
    return Response.json({});
  });
  const env = environment();
  const result = await worker.fetch(request(), env);
  const state = await result.json();
  assert.deepEqual(state.issues, []);
  assert.equal(state.emailConfigured, false);
  assert.equal(state.parts.sent, 0);
  const parts = calls.find(c => c.url.endsWith('/parts-order-email'));
  assert.equal(parts.options.method, 'POST');
  assert.equal(parts.options.headers['x-cron-secret'], 'parts-token');
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.options.redirect === 'manual')); // Workers rejects redirect: error.
  assert.equal((await env.STATE.get()).parts.ok, true);
});

test('detects a parts-handler error even when its HTTP status is 200', async (t) => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/backend-health-probe')) return Response.json({ ok: true, database_bytes: 50000000, resources: { observedAt: '2026-09-09T00:00:00Z', availableBytes: 900000000, sizeBytes: 1000000000, disks: [] }, wal_bytes: 1073741824 });
    if (url.endsWith('/parts-order-email')) return Response.json({ ok: false, error: 'database failure' });
    return Response.json({});
  });
  const state = await (await worker.fetch(request(), environment())).json();
  assert.ok(state.issues.includes('Parts notification worker failed'));
});

test('accepts a protected backup heartbeat and rejects future or malformed status', async () => {
  const values = new Map();
  const env = { ...environment(), STATE: {get:async key=>values.get(key),put:async(key,value)=>values.set(key,JSON.parse(value))} };
  const send = body => worker.fetch(new Request('https://worker.example/backup-status', {
    method:'POST', headers:{authorization:'Bearer admin-token','content-type':'application/json'},body:JSON.stringify(body),
  }),env);
  assert.equal((await send({ok:true,checkedAt:new Date().toISOString(),offsiteUploaded:false,private:'discard'})).status,200);
  assert.equal(values.get('backup').ok,true);
  assert.equal(values.get('backup').private,undefined);
  assert.equal((await send({ok:true,checkedAt:'bad'})).status,400);
  assert.equal((await send({ok:true,checkedAt:new Date(Date.now()+3600000).toISOString()})).status,400);
});
