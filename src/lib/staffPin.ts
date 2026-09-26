/**
 * Staff PIN for the Clubhouse OS on this device (demo / offline mode).
 * The PIN is never stored: only a PBKDF2-SHA256 hash (150k iterations, random salt). Five wrong
 * attempts lock the portal for 5 minutes. In cloud mode staff authority comes from the server
 * (staff_members + RLS); this PIN is then only a device unlock.
 */
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const KEY = 'eg.staff.pin.v1';
const LOCK = 'eg.staff.lock.v1';
const ITER = 150_000;
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 5 * 60_000;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hash(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITER }, key, 256));
}

export const PIN_RE = /^\d{6}$/;

export function createStaffPin(kv: KV, now = () => Date.now()) {
  const lockState = (): { fails: number; until: number } => {
    try { return JSON.parse(kv.getItem(LOCK) ?? '') ?? { fails: 0, until: 0 }; } catch { return { fails: 0, until: 0 }; }
  };
  return {
    isSet: () => !!kv.getItem(KEY),
    lockedFor: () => Math.max(0, lockState().until - now()),
    async set(pin: string) {
      if (!PIN_RE.test(pin)) throw new Error('PIN must be 6 digits');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      kv.setItem(KEY, JSON.stringify({ salt: b64(salt), hash: b64(await hash(pin, salt)) }));
      kv.removeItem(LOCK);
    },
    /** 'ok' | 'wrong' | 'locked' */
    async verify(pin: string): Promise<'ok' | 'wrong' | 'locked'> {
      const st = lockState();
      if (st.until > now()) return 'locked';
      const rec = JSON.parse(kv.getItem(KEY) ?? 'null') as { salt: string; hash: string } | null;
      if (!rec) return 'wrong';
      const got = await hash(pin, unb64(rec.salt));
      const want = unb64(rec.hash);
      let diff = got.length ^ want.length;
      for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]; // constant-time compare
      if (diff === 0) { kv.removeItem(LOCK); return 'ok'; }
      const fails = st.fails + 1;
      kv.setItem(LOCK, JSON.stringify(fails >= MAX_ATTEMPTS ? { fails: 0, until: now() + LOCK_MS } : { fails, until: 0 }));
      return fails >= MAX_ATTEMPTS ? 'locked' : 'wrong';
    },
  };
}
