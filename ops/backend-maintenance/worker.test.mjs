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

test('rejects unauthorized maintenance requests without calling backend', async () => {
  const result = await worker.fetch(new Request('https://worker.example/check', { method: 'POST' }), environment());
  assert.equal(result.status, 401);
});

test('runs existing parts handler and saves health without sending unconfigured email', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/backend-health-probe')) return Response.json({ ok: true, database_bytes: 50000000, wal_bytes: 1073741824, read_only: false });
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
    if (url.endsWith('/backend-health-probe')) return Response.json({ ok: true, database_bytes: 50000000, wal_bytes: 1073741824 });
    if (url.endsWith('/parts-order-email')) return Response.json({ ok: false, error: 'database failure' });
    return Response.json({});
  });
  const state = await (await worker.fetch(request(), environment())).json();
  assert.ok(state.issues.includes('Parts notification worker failed'));
});
