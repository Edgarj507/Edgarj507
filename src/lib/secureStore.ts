/**
 * Tamper-evident local persistence for scoring state.
 * Payload is XOR-masked and HMAC-SHA256 signed; a modified blob fails verification and is discarded.
 * This deters casual edits (localStorage / Preferences inspectors). It is not a substitute for
 * server-side validation — any client-held key is ultimately recoverable.
 */

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SALT_KEY = '__eg_s';
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

function getSalt(kv: KV): Uint8Array {
  const existing = kv.getItem(SALT_KEY);
  if (existing) return unb64(existing);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  kv.setItem(SALT_KEY, b64(salt));
  return salt;
}

async function hmacKey(salt: Uint8Array) {
  return crypto.subtle.importKey('raw', salt as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function mask(data: Uint8Array, salt: Uint8Array) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ salt[i % salt.length] ^ ((i * 31) & 0xff);
  return out;
}

export function createSecureStore(kv: KV) {
  return {
    async save<T>(key: string, value: T): Promise<void> {
      const salt = getSalt(kv);
      const body = mask(enc.encode(JSON.stringify(value)), salt);
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(salt), body as BufferSource));
      kv.setItem(key, `${b64(body)}.${b64(sig)}`);
    },

    async load<T>(key: string): Promise<T | null> {
      const raw = kv.getItem(key);
      if (!raw) return null;
      try {
        const [bodyB64, sigB64] = raw.split('.');
        const salt = getSalt(kv);
        const body = unb64(bodyB64);
        const ok = await crypto.subtle.verify('HMAC', await hmacKey(salt), unb64(sigB64) as BufferSource, body as BufferSource);
        if (!ok) throw new Error('tampered');
        return JSON.parse(dec.decode(mask(body, salt))) as T;
      } catch {
        kv.removeItem(key);
        return null;
      }
    },
  };
}
