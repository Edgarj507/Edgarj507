import { handle, rateLimiter, type Deps } from './handler.ts';

const ORIGIN = 'https://exclusive.golf';
const RID = '3f1c2b9e-8d7a-4c1b-9a2e-1b2c3d4e5f60';

function deps(over: Partial<Deps> = {}): Deps & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    allowedOrigins: new Set([ORIGIN]),
    verifyUser: async (jwt) => (jwt === 'good' ? 'user-1' : null),
    recordScore: async (u, s) => { calls.push([u, s]); return { ...s }; },
    allow: () => true,
    ...over,
  };
}

const req = (body: unknown, init: { origin?: string | null; token?: string; method?: string; type?: string } = {}) =>
  new Request('https://fn.local/submit-score', {
    method: init.method ?? 'POST',
    headers: {
      ...(init.origin === null ? {} : { origin: init.origin ?? ORIGIN }),
      ...(init.token === undefined ? { authorization: 'Bearer good' } : init.token ? { authorization: `Bearer ${init.token}` } : {}),
      'content-type': init.type ?? 'application/json',
    },
    body: init.method === 'OPTIONS' || init.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

const good = { roundId: RID, hole: 3, strokes: 4, putts: 2 };

describe('submit-score handler', () => {
  it('records a valid score for the JWT user (never a body-supplied user)', async () => {
    const d = deps();
    const res = await handle(req(good), d);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(d.calls).toEqual([['user-1', good]]);
  });

  it('refuses unknown origins, including preflight', async () => {
    expect((await handle(req(good, { origin: 'https://evil.example' }), deps())).status).toBe(403);
    expect((await handle(req(null, { origin: 'https://evil.example', method: 'OPTIONS' }), deps())).status).toBe(403);
    const pre = await handle(req(null, { method: 'OPTIONS' }), deps());
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  });

  it('requires a valid bearer token', async () => {
    expect((await handle(req(good, { token: '' }), deps())).status).toBe(401);
    expect((await handle(req(good, { token: 'forged' }), deps())).status).toBe(401);
  });

  it('validates method, content type, size and schema', async () => {
    expect((await handle(req(null, { method: 'GET' }), deps())).status).toBe(405);
    expect((await handle(req('x', { type: 'text/plain' }), deps())).status).toBe(415);
    expect((await handle(req('{', {}), deps())).status).toBe(400);
    expect((await handle(req('x'.repeat(2000)), deps())).status).toBe(413);
    const bad = await handle(req({ ...good, userId: 'victim' }), deps());
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: 'unexpected_field' });
  });

  it('maps database rule violations to 422 and hides internal errors', async () => {
    const rule = await handle(req(good), deps({ recordScore: async () => { throw new Error('too_fast'); } }));
    expect(rule.status).toBe(422);
    expect(await rule.json()).toEqual({ error: 'too_fast' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = await handle(req(good), deps({ recordScore: async () => { throw new Error('relation "x" does not exist'); } }));
    spy.mockRestore();
    expect(boom.status).toBe(500);
    expect(await boom.json()).toEqual({ error: 'internal' });
  });

  it('rate limits per user', async () => {
    expect((await handle(req(good), deps({ allow: () => false }))).status).toBe(429);
    let t = 0;
    const allow = rateLimiter(2, 1000, () => t);
    expect([allow('u'), allow('u'), allow('u'), allow('v')]).toEqual([true, true, false, true]);
    t = 1001;
    expect(allow('u')).toBe(true);
  });
});
