import { afterEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/verify-turnstile/route';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (body: unknown) => new Request('https://example.com/api/verify-turnstile', { method: 'POST', body: JSON.stringify(body) });
it('fails closed when production verification is not configured', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TURNSTILE_SECRET', '');
  expect((await POST(request({token:'token'}))).status).toBe(503);
});
it('rejects invalid tokens without calling verification', async () => {
  vi.stubEnv('TURNSTILE_SECRET', 'test-secret'); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect((await POST(request({token:12}))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it('does not treat an upstream outage as successful verification', async () => {
  vi.stubEnv('TURNSTILE_SECRET', 'test-secret'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', {status:503})));
  expect((await POST(request({token:'valid-format'}))).status).toBe(502);
});
it('accepts a verified challenge', async () => {
  vi.stubEnv('TURNSTILE_SECRET', 'test-secret'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({success:true})));
  expect((await POST(request({token:'valid-format'}))).status).toBe(200);
});
