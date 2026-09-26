import type { Secret } from './model';

/** PBKDF2-SHA256 with a random 16-byte salt; secrets are never stored in clear. */
export const PIN_ITER = 60_000;
export const PASSWORD_ITER = 210_000;
export const CODE_ITER = 20_000;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(secret: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashSecret(secret: string, iter: number): Promise<Secret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: b64(await derive(secret, salt, iter)), iter };
}

export async function verifySecret(secret: string, s: Secret | undefined): Promise<boolean> {
  if (!s) return false;
  const got = await derive(secret, unb64(s.salt), s.iter);
  const want = unb64(s.hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]; // constant-time compare
  return diff === 0;
}

/** 6-digit recovery code from a CSPRNG (no modulo bias). */
export function randomCode(): string {
  const buf = new Uint32Array(1);
  let n: number;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= 4_294_000_000);
  return String(n % 1_000_000).padStart(6, '0');
}
