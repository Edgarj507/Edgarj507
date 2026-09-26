import { sanitizeText, EMAIL_RE } from '../../supabase/functions/_shared/validation.ts';
import { normalizePhone } from '../lib/sms';

export type Role = 'player' | 'staff';

export interface OpsSettings {
  liveOrdering: boolean;
  hailCart: boolean;
  /** Organizer-set cap on charity mulligans each player may buy. */
  mulliganLimit: number;
}

export interface OrderItem { sku: string; name: string; price: number; qty: number; kind: 'fnb' | 'shop' | 'charity' }

export interface Order {
  id: string;
  kind: 'order' | 'hail';
  createdAt: number;
  player: string;
  hole: number;
  lat: number;
  lng: number;
  items: OrderItem[];
  total: number;
  status: 'new' | 'enroute' | 'delivered';
}

export interface Contact { first: string; last: string; phone: string; email: string }

export interface Registration {
  id: string;
  eventId: string;
  teamName: string;
  captain: Contact;
  roster: [Contact, Contact, Contact];
  total: number;
  paidAt: number;
  teeTime: string;
}

export interface OpsState { v: 1; settings: OpsSettings; orders: Order[]; registrations: Registration[] }

export const initialOps = (): OpsState => ({ v: 1, settings: { liveOrdering: true, hailCart: true, mulliganLimit: 4 }, orders: [], registrations: [] });

export type OpsAction =
  | { type: 'order'; order: Order }
  | { type: 'register'; reg: Registration }
  | { type: 'setting'; patch: Partial<OpsSettings> } // staff only
  | { type: 'status'; id: string; status: Order['status'] }; // staff only

const STAFF_ONLY = new Set<OpsAction['type']>(['setting', 'status']);

/** Pure reducer. Role is checked here for the demo backend; the server enforces it with RLS. */
export function opsReducer(s: OpsState, a: OpsAction, role: Role): OpsState {
  if (STAFF_ONLY.has(a.type) && role !== 'staff') return s;
  switch (a.type) {
    case 'order': {
      const o = a.order;
      // Charity mulligans are digital: they keep selling when the kitchen/cart is switched off.
      const charityOnly = o.kind === 'order' && o.items.length > 0 && o.items.every((i) => i.kind === 'charity');
      if (o.kind === 'hail' ? !s.settings.hailCart : !charityOnly && !s.settings.liveOrdering) return s;
      const mulls = charityQty(o);
      if (mulls && mulligansBought(s.orders, o.player, o.createdAt) + mulls > s.settings.mulliganLimit) return s;
      return { ...s, orders: [{ ...o, status: (charityOnly ? 'delivered' : 'new') as Order['status'] }, ...s.orders].slice(0, 500) };
    }
    case 'register':
      return s.registrations.some((r) => r.id === a.reg.id) ? s : { ...s, registrations: [...s.registrations, a.reg] };
    case 'setting': {
      const limit = a.patch.mulliganLimit;
      return { ...s, settings: { ...s.settings, ...a.patch, ...(limit != null ? { mulliganLimit: Math.max(0, Math.min(10, Math.round(limit))) } : {}) } };
    }
    case 'status':
      return { ...s, orders: s.orders.map((o) => (o.id === a.id ? { ...o, status: a.status } : o)) };
  }
}

const charityQty = (o: Order) => o.items.reduce((a, i) => a + (i.kind === 'charity' ? i.qty : 0), 0);
const MULLIGAN_WINDOW_MS = 18 * 3600_000;

/** Charity mulligans a player bought in the current event window (limit is per player per 18h). */
export const mulligansBought = (orders: Order[], player: string, now: number) =>
  orders.filter((o) => o.player === player && o.createdAt > now - MULLIGAN_WINDOW_MS).reduce((a, o) => a + charityQty(o), 0);

// ── Roster validation (verified roster, no guests) ─────────────────────────────────────────────
export type ContactErrors = Partial<Record<keyof Contact, string>>;

export function cleanContact(c: Contact): Contact {
  return {
    first: sanitizeText(c.first, 40),
    last: sanitizeText(c.last, 40),
    phone: normalizePhone(c.phone) ?? c.phone.trim(),
    email: c.email.trim().toLowerCase(),
  };
}

export function validateContact(c: Contact): ContactErrors {
  const e: ContactErrors = {};
  const x = cleanContact(c);
  if (!x.first) e.first = 'Required';
  if (!x.last) e.last = 'Required';
  if (!normalizePhone(c.phone)) e.phone = 'Enter a valid mobile number';
  if (!EMAIL_RE.test(x.email)) e.email = 'Enter a valid email';
  return e;
}

export function validateTeam(teamName: string, roster: Contact[], captain: Contact) {
  const name = sanitizeText(teamName, 30);
  const errors = {
    team: name.length < 2 ? 'Name your team (2–30 characters)' : undefined,
    roster: roster.map(validateContact),
    duplicate: undefined as string | undefined,
  };
  const phones = [captain, ...roster].map((c) => normalizePhone(c.phone)).filter(Boolean);
  if (new Set(phones).size !== phones.length) errors.duplicate = 'Each player needs their own phone number';
  const ok = !errors.team && !errors.duplicate && errors.roster.every((r) => !Object.keys(r).length);
  return { ok, errors, teamName: name };
}

// ── Pace of play ───────────────────────────────────────────────────────────────────────────────
/** Target pace: 4h 21m for 18 holes. */
export const STANDARD_MIN_PER_HOLE = 14.5;

export interface Group { id: string; name: string; players: string[]; teeTime: number; minPerHole: number; startHole?: number }

/**
 * Where a group should be vs. where it is. `behindMin` > 0 means slower than the standard pace
 * (the radar flags groups > 15 min behind).
 */
export function groupStatus(g: Group, now: number) {
  const elapsedMin = Math.max(0, (now - g.teeTime) / 60_000);
  const holesDone = Math.min(18, elapsedMin / g.minPerHole);
  const expectedDone = Math.min(18, elapsedMin / STANDARD_MIN_PER_HOLE);
  const behindMin = (expectedDone - holesDone) * STANDARD_MIN_PER_HOLE;
  const finished = holesDone >= 18;
  const idx = Math.min(17, Math.floor(holesDone));
  const hole = (((g.startHole ?? 1) - 1 + idx) % 18) + 1;
  return { hole, fraction: holesDone - Math.floor(holesDone), behindMin: Math.round(behindMin), started: now >= g.teeTime, finished };
}
