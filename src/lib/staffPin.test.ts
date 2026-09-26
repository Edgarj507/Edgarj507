import { createStaffPin, LOCK_MS, type KV } from './staffPin';

const kv = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };

describe('staff PIN', () => {
  it('stores only a salted hash and verifies', async () => {
    const s = kv(); const pin = createStaffPin(s);
    expect(pin.isSet()).toBe(false);
    await expect(pin.set('12a4')).rejects.toThrow();
    await pin.set('482915');
    expect([...s.m.values()].join()).not.toContain('482915');
    expect(await pin.verify('482915')).toBe('ok');
    expect(await pin.verify('000000')).toBe('wrong');
  });
  it('locks after 5 failures for 5 minutes', async () => {
    let t = 1_000; const pin = createStaffPin(kv(), () => t);
    await pin.set('482915');
    for (let i = 0; i < 4; i++) expect(await pin.verify('111111')).toBe('wrong');
    expect(await pin.verify('111111')).toBe('locked');
    expect(await pin.verify('482915')).toBe('locked'); // even the right PIN
    t += LOCK_MS + 1;
    expect(await pin.verify('482915')).toBe('ok');
  });
});
