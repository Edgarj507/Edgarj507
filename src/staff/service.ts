import { sanitizeText } from '../../supabase/functions/_shared/validation.ts';
import {
  activeOwners, canManage, initialStaff, INVITE_TTL_MS, passwordProblem, pinProblem, PIN_LOCK_MS, PIN_MAX_FAILS, PW_LOCK_MS, PW_MAX_FAILS,
  RESET_MAX_ATTEMPTS, RESET_MAX_PER_WINDOW, RESET_TTL_MS, ROLES, sessionOf, validateMember,
  type Permission, type StaffMember, type StaffScope, type StaffSession, type StaffState,
} from './model';
import { CODE_ITER, hashSecret, PASSWORD_ITER, PIN_ITER, randomCode, verifySecret } from './secrets';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const KEY = 'eg.staff.v1';
const RESET_SENT = 'If that email belongs to an active staff account, we sent a 6-digit code. It expires in 15 minutes.';

/**
 * Staff directory, PIN / password sign-in and recovery (demo: stored on this device; cloud:
 * Supabase Auth + staff_members, see SECURITY.md §15). All mutations go through here so the
 * rules (lockouts, one-time codes, owner protection) live in one place.
 */
export function createStaffService(kv: KV, opts: { now?: () => number; onChange?: (s: StaffState) => void; demoOutbox?: boolean } = {}) {
  const now = opts.now ?? (() => Date.now());
  const read = (): StaffState => {
    try { const s = JSON.parse(kv.getItem(KEY) ?? 'null'); if (s?.v === 1) return { ...initialStaff(), ...s }; } catch { /* corrupt */ }
    return initialStaff();
  };
  const write = (s: StaffState) => { kv.setItem(KEY, JSON.stringify(s)); opts.onChange?.(s); return s; };
  const inScope = (s: StaffState, scope: StaffScope) => s.members.filter((m) => m.scope === scope);
  const find = (s: StaffState, scope: StaffScope, email: string) => s.members.find((m) => m.scope === scope && m.email === email.trim().toLowerCase());

  /** Active staff PINs must be unique per scope (the PIN identifies who is signing in). */
  async function pinTaken(s: StaffState, scope: StaffScope, pin: string, exceptId?: string) {
    for (const m of inScope(s, scope)) if (m.id !== exceptId && m.active && m.pin && await verifySecret(pin, m.pin)) return true;
    return false;
  }

  function mail(s: StaffState, to: string, subject: string, body: string) {
    if (!opts.demoOutbox) return s;
    return { ...s, outbox: [{ id: crypto.randomUUID(), to, subject, body, at: now() }, ...s.outbox].slice(0, 20) };
  }

  async function issueCode(s: StaffState, m: StaffMember, kind: 'reset' | 'invite') {
    const code = randomCode();
    const req = { id: crypto.randomUUID(), scope: m.scope, memberId: m.id, codeHash: await hashSecret(code, CODE_ITER), expiresAt: now() + (kind === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS), attempts: 0, used: false, kind, createdAt: now() };
    // A new code replaces any earlier unused ones for that person.
    s = { ...s, resets: [...s.resets.filter((r) => r.memberId !== m.id || r.used), req].slice(-200) };
    const org = m.scope === 'clubhouse' ? 'Clubhouse OS' : 'Tournament OS';
    return mail(s, m.email, kind === 'invite' ? `You’ve been added to ${org}` : `${org} password reset code`,
      kind === 'invite'
        ? `Hi ${m.name}, you were added as ${m.role}. Set your password with code ${code} (valid 72 hours) via “Forgot password?” → “I have a code”.`
        : `Your reset code is ${code}. It expires in 15 minutes. If you didn’t ask for this, ignore this email.`);
  }

  return {
    read,
    hasDirectory: (scope: StaffScope) => inScope(read(), scope).some((m) => m.active),
    terminalLockedFor: (scope: StaffScope) => Math.max(0, read().terminal[scope].until - now()),

    /** First run: create the owner account (only when no active staff exist for the scope). */
    async setupOwner(scope: StaffScope, input: { name: string; email: string; password: string; pin: string }): Promise<Result<StaffSession>> {
      let s = read();
      if (inScope(s, scope).some((m) => m.active)) return fail('This terminal already has staff accounts. Sign in instead.');
      const role = ROLES[scope].find((r) => r.owner)!;
      const v = validateMember({ ...input, role: role.id, permissions: role.permissions, scope }, s.members);
      if (!v.ok) return fail(Object.values(v.errors)[0]!);
      const pw = passwordProblem(input.password, input.email); if (pw) return fail(pw);
      const pp = pinProblem(input.pin); if (pp) return fail(pp);
      const m: StaffMember = {
        id: crypto.randomUUID(), scope, name: sanitizeText(input.name, 60), email: input.email.trim().toLowerCase(), role: role.id, permissions: role.permissions,
        active: true, pin: await hashSecret(input.pin, PIN_ITER), password: await hashSecret(input.password, PASSWORD_ITER), createdAt: now(), lastLoginAt: now(),
      };
      s = write({ ...s, members: [...s.members, m] });
      return ok(sessionOf(m));
    },

    async loginPin(scope: StaffScope, pin: string): Promise<Result<StaffSession>> {
      let s = read();
      const t = s.terminal[scope];
      if (t.until > now()) return fail('locked');
      if (/^\d{4,6}$/.test(pin)) {
        for (const m of inScope(s, scope)) {
          if (m.active && m.pin && await verifySecret(pin, m.pin)) {
            s = write({ ...s, terminal: { ...s.terminal, [scope]: { fails: 0, until: 0 } }, members: s.members.map((x) => (x.id === m.id ? { ...x, lastLoginAt: now() } : x)) });
            return ok(sessionOf(m));
          }
        }
      }
      const fails = t.fails + 1;
      write({ ...s, terminal: { ...s.terminal, [scope]: fails >= PIN_MAX_FAILS ? { fails: 0, until: now() + PIN_LOCK_MS } : { fails, until: 0 } } });
      return fail(fails >= PIN_MAX_FAILS ? 'locked' : 'Incorrect PIN');
    },

    async loginPassword(scope: StaffScope, email: string, password: string): Promise<Result<StaffSession>> {
      let s = read();
      const m = find(s, scope, email);
      const generic = 'Email or password is incorrect';
      if (!m || !m.active) { await verifySecret(password, undefined); return fail(generic); } // no account enumeration
      if ((m.pwLockedUntil ?? 0) > now()) return fail('Too many attempts. Try again in 15 minutes or reset your password.');
      if (!m.password) return fail('Set your password first: use “Forgot password?” with the code from your invite.');
      if (await verifySecret(password, m.password)) {
        s = write({ ...s, members: s.members.map((x) => (x.id === m.id ? { ...x, pwFails: 0, pwLockedUntil: 0, lastLoginAt: now() } : x)) });
        return ok(sessionOf(m));
      }
      const fails = (m.pwFails ?? 0) + 1;
      write({ ...s, members: s.members.map((x) => (x.id === m.id ? { ...x, pwFails: fails >= PW_MAX_FAILS ? 0 : fails, pwLockedUntil: fails >= PW_MAX_FAILS ? now() + PW_LOCK_MS : 0 } : x)) });
      return fail(fails >= PW_MAX_FAILS ? 'Too many attempts. Try again in 15 minutes or reset your password.' : generic);
    },

    /** Always answers the same way (no email enumeration). Rate-limited per account. */
    async requestReset(scope: StaffScope, email: string): Promise<Result<string>> {
      let s = read();
      const m = find(s, scope, email);
      if (m?.active) {
        const recent = s.resets.filter((r) => r.memberId === m.id && r.createdAt > now() - RESET_TTL_MS).length;
        if (recent < RESET_MAX_PER_WINDOW) { s = await issueCode(s, m, 'reset'); write(s); }
      }
      return ok(RESET_SENT);
    },

    async resetPassword(scope: StaffScope, email: string, code: string, password: string, confirm: string): Promise<Result<void>> {
      if (password !== confirm) return fail('Passwords don’t match');
      const pw = passwordProblem(password, email); if (pw) return fail(pw);
      let s = read();
      const m = find(s, scope, email);
      const bad = 'That code is invalid or has expired. Request a new one.';
      const req = m && s.resets.filter((r) => r.memberId === m.id && !r.used && r.expiresAt > now()).at(-1);
      if (!m || !m.active || !req || !/^\d{6}$/.test(code)) return fail(bad);
      if (req.attempts >= RESET_MAX_ATTEMPTS) return fail(bad);
      if (!(await verifySecret(code, req.codeHash))) {
        write({ ...s, resets: s.resets.map((r) => (r.id === req.id ? { ...r, attempts: r.attempts + 1 } : r)) });
        return fail(req.attempts + 1 >= RESET_MAX_ATTEMPTS ? bad : 'Incorrect code');
      }
      const hashed = await hashSecret(password, PASSWORD_ITER);
      s = { ...s,
        members: s.members.map((x) => (x.id === m.id ? { ...x, password: hashed, pwFails: 0, pwLockedUntil: 0 } : x)),
        // Single use; every other outstanding code for this person dies too.
        resets: s.resets.map((r) => (r.memberId === m.id ? { ...r, used: true } : r)) };
      write(mail(s, m.email, 'Your password was changed', `Hi ${m.name}, your password was just changed. If this wasn’t you, contact your manager.`));
      return ok(undefined);
    },

    async addStaff(actor: StaffSession, input: { name: string; email: string; role: string; permissions: Permission[]; pin?: string }): Promise<Result<StaffMember>> {
      let s = read();
      const deny = canManage(actor, null, s.members); if (deny) return fail(deny);
      const role = ROLES[actor.scope].find((r) => r.id === input.role);
      if (role?.owner && !actor.owner) return fail('Only an owner can add another owner');
      if (input.permissions.includes('staff') && !actor.owner) return fail('Only an owner can grant staff management');
      const v = validateMember({ ...input, scope: actor.scope }, s.members); if (!v.ok) return fail(Object.values(v.errors)[0]!);
      if (input.pin) { const pp = pinProblem(input.pin); if (pp) return fail(pp); if (await pinTaken(s, actor.scope, input.pin)) return fail('That PIN is already in use. Choose another.'); }
      const m: StaffMember = {
        id: crypto.randomUUID(), scope: actor.scope, name: sanitizeText(input.name, 60), email: input.email.trim().toLowerCase(), role: input.role,
        permissions: role?.owner ? role.permissions : [...new Set(input.permissions)], active: true,
        pin: input.pin ? await hashSecret(input.pin, PIN_ITER) : undefined, createdAt: now(), createdBy: actor.id,
      };
      s = { ...s, members: [...s.members, m] };
      write(await issueCode(s, m, 'invite'));
      return ok(m);
    },

    async updateStaff(actor: StaffSession, id: string, patch: { role?: string; permissions?: Permission[]; name?: string }): Promise<Result<void>> {
      const s = read();
      const m = s.members.find((x) => x.id === id) ?? null;
      const deny = canManage(actor, m, s.members); if (deny || !m) return fail(deny ?? 'Not found');
      const next = { ...m, ...patch, name: patch.name != null ? sanitizeText(patch.name, 60) : m.name };
      const role = ROLES[m.scope].find((r) => r.id === next.role);
      if (role?.owner) next.permissions = role.permissions;
      if (!actor.owner && (role?.owner || next.permissions.includes('staff'))) return fail('Only an owner can grant owner or staff management');
      const wasOwner = !!ROLES[m.scope].find((r) => r.id === m.role)?.owner;
      if (wasOwner && !role?.owner && activeOwners(s.members, m.scope).length <= 1) return fail('Keep at least one active owner');
      const v = validateMember(next, s.members, id); if (!v.ok) return fail(Object.values(v.errors)[0]!);
      write({ ...s, members: s.members.map((x) => (x.id === id ? next : x)) });
      return ok(undefined);
    },

    async setPin(actor: StaffSession, id: string, pin: string): Promise<Result<void>> {
      const s = read();
      const m = s.members.find((x) => x.id === id) ?? null;
      const deny = actor.id === id ? null : canManage(actor, m, s.members); if (deny || !m) return fail(deny ?? 'Not found');
      const pp = pinProblem(pin); if (pp) return fail(pp);
      if (await pinTaken(s, m.scope, pin, id)) return fail('That PIN is already in use. Choose another.');
      const hashed = await hashSecret(pin, PIN_ITER);
      write({ ...read(), members: read().members.map((x) => (x.id === id ? { ...x, pin: hashed } : x)) });
      return ok(undefined);
    },

    /** Deactivate = instant revoke (PIN, password and open codes stop working). */
    setActive(actor: StaffSession, id: string, active: boolean): Result<void> {
      const s = read();
      const m = s.members.find((x) => x.id === id) ?? null;
      const deny = canManage(actor, m, s.members); if (deny || !m) return fail(deny ?? 'Not found');
      if (!active && id === actor.id) return fail('You can’t deactivate yourself');
      if (!active && ROLES[m.scope].find((r) => r.id === m.role)?.owner && activeOwners(s.members, m.scope).length <= 1) return fail('Keep at least one active owner');
      write({ ...s,
        members: s.members.map((x) => (x.id === id ? { ...x, active, deactivatedAt: active ? undefined : now() } : x)),
        resets: active ? s.resets : s.resets.map((r) => (r.memberId === id ? { ...r, used: true } : r)) });
      return ok(undefined);
    },

    remove(actor: StaffSession, id: string): Result<void> {
      const s = read();
      const m = s.members.find((x) => x.id === id) ?? null;
      const deny = canManage(actor, m, s.members); if (deny || !m) return fail(deny ?? 'Not found');
      if (id === actor.id) return fail('You can’t remove yourself');
      if (m.active) return fail('Deactivate first, then remove');
      write({ ...s, members: s.members.filter((x) => x.id !== id), resets: s.resets.filter((r) => r.memberId !== id) });
      return ok(undefined);
    },

    async resendInvite(actor: StaffSession, id: string): Promise<Result<void>> {
      const s = read();
      const m = s.members.find((x) => x.id === id) ?? null;
      const deny = canManage(actor, m, s.members); if (deny || !m) return fail(deny ?? 'Not found');
      if (!m.active) return fail('Reactivate first');
      write(await issueCode(s, m, m.password ? 'reset' : 'invite'));
      return ok(undefined);
    },

    /** The session is only as good as the account behind it: re-read on every check. */
    refresh(sess: StaffSession): StaffSession | null {
      const m = read().members.find((x) => x.id === sess.id);
      return m && m.active ? sessionOf(m) : null;
    },
  };
}
export type StaffService = ReturnType<typeof createStaffService>;
