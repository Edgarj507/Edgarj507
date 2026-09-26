/**
 * Face ID / Touch ID via WebAuthn platform authenticators (passkeys). On iPhone/iPad Safari this
 * prompts Face ID; on Android the fingerprint/face unlock.
 *
 * Here it's used as a *local user-verification gate* (confirm purchases, unlock a remembered
 * session or an enrolled staff device). For server-trusted login, send the assertion to a server
 * that verifies it against the stored public key (e.g. SimpleWebAuthn on an edge function).
 */
const STORE = 'eg.webauthn.v1';
type Scope = 'player' | 'staff';

const ids = (): Record<Scope, string[]> => {
  try { return { player: [], staff: [], ...JSON.parse(localStorage.getItem(STORE) ?? '{}') }; } catch { return { player: [], staff: [] }; }
};
const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function biometricAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export const isEnrolled = (scope: Scope) => ids()[scope].length > 0;

export async function enroll(scope: Scope, userName: string): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Exclusive.Golf' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: userName, displayName: userName },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const all = ids();
    all[scope] = [...all[scope], b64u(cred.rawId)];
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** Prompt Face ID / Touch ID. Resolves true only after successful user verification. */
export async function verify(scope: Scope): Promise<boolean> {
  const list = ids()[scope];
  if (!list.length) return false;
  try {
    const a = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: list.map((id) => ({ type: 'public-key' as const, id: unb64u(id) })),
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    const flags = a ? new Uint8Array((a.response as AuthenticatorAssertionResponse).authenticatorData)[32] : 0;
    return !!a && (flags & 0x04) !== 0; // UV bit: the user was actually verified (biometric/PIN)
  } catch {
    return false;
  }
}
