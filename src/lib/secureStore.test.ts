import { createSecureStore, type KV } from './secureStore';

const memKV = (): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe('secureStore', () => {
  it('round-trips and does not store plaintext', async () => {
    const kv = memKV();
    const s = createSecureStore(kv);
    await s.save('round', { strokes: 7 });
    expect(kv.m.get('round')).not.toContain('strokes');
    expect(await s.load('round')).toEqual({ strokes: 7 });
  });

  it('rejects and purges tampered blobs', async () => {
    const kv = memKV();
    const s = createSecureStore(kv);
    await s.save('round', { strokes: 7 });
    const [body, sig] = kv.m.get('round')!.split('.');
    const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    kv.m.set('round', `${btoa(String.fromCharCode(...bytes))}.${sig}`);
    expect(await s.load('round')).toBeNull();
    expect(kv.m.has('round')).toBe(false);
  });
});
