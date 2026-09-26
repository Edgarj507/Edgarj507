import { sanitizeText, EMAIL_RE } from '../../supabase/functions/_shared/validation.ts';

/**
 * Staff accounts for the Clubhouse OS (course staff) and the Tournament OS (organizer staff).
 * Each person has a role, a permission set, a fast 4–6 digit PIN for shared terminals and a
 * password for email sign-in. Secrets are stored only as salted PBKDF2 hashes (see secrets.ts).
 */
export type StaffScope = 'clubhouse' | 'tournament';

export const PERMISSIONS: Record<StaffScope, Record<string, string>> = {
  clubhouse: {
    teeSheet: 'Tee sheet & bookings',
    orders: 'Orders, bev carts & phone-in',
    store: 'Store & inventory',
    pricing: 'Pricing & policies',
    messages: 'Golfer messages',
    broadcasts: 'Broadcast alerts',
    tournament: 'Tournament CRM, radar & roster',
    reports: 'End of day reports',
    support: 'Support tickets',
    settings: 'Course settings',
    staff: 'Staff & permissions',
  },
  tournament: {
    events: 'Create & edit events',
    roster: 'Roster, entry & reassignment',
    checkin: 'Team check-in',
    broadcasts: 'Notify the field',
    weather: 'Weather',
    staff: 'Staff & permissions',
  },
};
export type Permission = string;

export interface RolePreset { id: string; label: string; permissions: Permission[]; owner?: boolean }
const all = (s: StaffScope) => Object.keys(PERMISSIONS[s]);
export const ROLES: Record<StaffScope, RolePreset[]> = {
  clubhouse: [
    { id: 'owner', label: 'Owner / Head Manager', permissions: all('clubhouse'), owner: true },
    { id: 'assistant_manager', label: 'Assistant Manager', permissions: all('clubhouse').filter((p) => p !== 'staff' && p !== 'pricing') },
    { id: 'pro_shop', label: 'Pro Shop', permissions: ['teeSheet', 'orders', 'store', 'messages', 'reports'] },
    { id: 'kitchen_bev', label: 'Kitchen / Bev Cart', permissions: ['orders', 'messages'] },
    { id: 'marshal', label: 'Marshal', permissions: ['teeSheet', 'messages', 'tournament'] },
  ],
  tournament: [
    { id: 'owner', label: 'Organizer / Tournament Director', permissions: all('tournament'), owner: true },
    { id: 'coordinator', label: 'Event Coordinator', permissions: ['events', 'roster', 'checkin', 'broadcasts', 'weather'] },
    { id: 'registration', label: 'Registration Desk', permissions: ['roster', 'checkin'] },
    { id: 'volunteer', label: 'Volunteer', permissions: ['checkin'] },
  ],
};
export const roleLabel = (scope: StaffScope, id: string) => ROLES[scope].find((r) => r.id === id)?.label ?? id;

export interface Secret { salt: string; hash: string; iter: number }

export interface StaffMember {
  id: string;
  scope: StaffScope;
  name: string;
  email: string;
  role: string;
  permissions: Permission[];
  active: boolean;
  pin?: Secret;
  password?: Secret;
  /** Failed password attempts on this account and the lock that follows. */
  pwFails?: number;
  pwLockedUntil?: number;
  createdAt: number;
  createdBy?: string;
  deactivatedAt?: number;
  lastLoginAt?: number;
}

/** A recovery / invite code (only its hash is kept). */
export interface ResetRequest { id: string; scope: StaffScope; memberId: string; codeHash: Secret; expiresAt: number; attempts: number; used: boolean; kind: 'reset' | 'invite'; createdAt: number }

/** Demo only: what would have been emailed (so the flow can be tried without a mail server). */
export interface OutboxMail { id: string; to: string; subject: string; body: string; at: number }

export interface StaffState {
  v: 1;
  members: StaffMember[];
  resets: ResetRequest[];
  outbox: OutboxMail[];
  /** Shared-terminal PIN lockout per scope. */
  terminal: Record<StaffScope, { fails: number; until: number }>;
}
export const initialStaff = (): StaffState => ({ v: 1, members: [], resets: [], outbox: [], terminal: { clubhouse: { fails: 0, until: 0 }, tournament: { fails: 0, until: 0 } } });

/** What a signed-in session carries (no secrets). */
export interface StaffSession { id: string; scope: StaffScope; name: string; role: string; permissions: Permission[]; owner: boolean }
export const sessionOf = (m: StaffMember): StaffSession => ({
  id: m.id, scope: m.scope, name: m.name, role: m.role, permissions: [...m.permissions], owner: !!ROLES[m.scope].find((r) => r.id === m.role)?.owner,
});

// ── rules ────────────────────────────────────────────────────────────────────────────────────
export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MS = 5 * 60_000;
export const PW_MAX_FAILS = 5;
export const PW_LOCK_MS = 15 * 60_000;
export const RESET_TTL_MS = 15 * 60_000;
export const INVITE_TTL_MS = 72 * 3600_000;
export const RESET_MAX_ATTEMPTS = 5;
export const RESET_MAX_PER_WINDOW = 3;

const TRIVIAL = new Set(['0000', '1111', '1234', '4321', '2580', '000000', '111111', '123456', '654321', '121212', '123123']);
export function pinProblem(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'PIN must be 4 to 6 digits';
  if (TRIVIAL.has(pin) || /^(\d)\1+$/.test(pin)) return 'That PIN is too easy to guess';
  const d = pin.split('').map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return 'Avoid sequences like 1234';
  return null;
}

export function passwordProblem(pw: string, email = ''): string | null {
  if (pw.length < 10) return 'Use at least 10 characters';
  if (pw.length > 128) return 'Use at most 128 characters';
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return 'Mix letters and numbers';
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && pw.toLowerCase().includes(local)) return 'Don’t include your email name';
  if (/^(password|exclusive|golf)/i.test(pw)) return 'That password is too common';
  return null;
}

export function validateMember(m: Pick<StaffMember, 'name' | 'email' | 'role' | 'permissions' | 'scope'>, members: StaffMember[], selfId?: string) {
  const e: Partial<Record<'name' | 'email' | 'role' | 'permissions', string>> = {};
  if (sanitizeText(m.name, 60).length < 2) e.name = 'Enter a name';
  const email = m.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email';
  else if (members.some((x) => x.scope === m.scope && x.email === email && x.id !== selfId)) e.email = 'Someone already uses this email';
  if (!ROLES[m.scope].some((r) => r.id === m.role)) e.role = 'Pick a role';
  if (!m.permissions.length || m.permissions.some((p) => !(p in PERMISSIONS[m.scope]))) e.permissions = 'Pick at least one permission';
  return { ok: !Object.keys(e).length, errors: e };
}

export const activeOwners = (members: StaffMember[], scope: StaffScope) =>
  members.filter((m) => m.scope === scope && m.active && ROLES[scope].find((r) => r.id === m.role)?.owner);

/** Can `actor` manage `target` (edit / PIN / deactivate / remove)? */
export function canManage(actor: StaffSession | null, target: StaffMember | null, members: StaffMember[]): string | null {
  if (!actor || !actor.permissions.includes('staff')) return 'You don’t have permission to manage staff';
  if (!target) return null;
  if (target.scope !== actor.scope) return 'Different organization';
  const targetOwner = !!ROLES[target.scope].find((r) => r.id === target.role)?.owner;
  if (targetOwner && !actor.owner) return 'Only an owner can change another owner';
  void members;
  return null;
}
