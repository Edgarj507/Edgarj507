import { sanitizeText, EMAIL_RE } from '../../supabase/functions/_shared/validation.ts';
import { normalizePhone } from '../lib/sms';
import { courseBoundary, onProperty } from '../lib/geofence';
import { SOMERBY_DATA } from '../data/course';

export type Role = 'player' | 'staff';

/** 24h wall-clock times, "HH:MM". A close earlier than the open means it runs past midnight. */
export interface Hours { open: string; close: string }

export interface OpsSettings {
  liveOrdering: boolean;
  hailCart: boolean;
  /** Organizer-set cap on charity mulligans each player may buy. */
  mulliganLimit: number;
  /** Target pace of play, minutes per hole. */
  paceMinPerHole: number;
  /** A group this many minutes behind the target pace raises an alert (red pulse + toast). */
  paceAlertMin: number;
  courseHours: Hours;
  kitchenHours: Hours;
  /**
   * Live Event mode. Privacy: the GPS radar and position tracking exist only while this is on;
   * before the event the organizer gets the CRM (no map, no locations).
   */
  tournamentLive: boolean;
  liveSince: number | null;
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
  /** Players 2–4. A blank contact is an open slot (e.g. a drop-out not yet replaced). */
  roster: [Contact, Contact, Contact];
  total: number;
  /** Amount received so far; below `total` means partially paid. */
  paid: number;
  paidAt: number;
  teeTime: string;
}

export interface TeeBooking {
  id: string;
  /** Local date "YYYY-MM-DD" and time "HH:MM". */
  date: string;
  time: string;
  status: 'reserved' | 'blocked';
  name: string;
  size: number;
  phone: string;
  email: string;
  source: 'phone' | 'walkup' | 'app' | 'staff';
  note?: string;
}

/** A player's last on-property GPS fix during a live event. Never stored off-property. */
export interface LivePosition { player: string; phone: string; lat: number; lng: number; at: number }

export interface OpsState { v: 1; settings: OpsSettings; orders: Order[]; registrations: Registration[]; teeSheet: TeeBooking[]; positions: LivePosition[] }

/** Somerby property line (hole hull); positions outside it + 250 ft are refused. */
export const COURSE_BOUNDARY = courseBoundary(SOMERBY_DATA.holes);
/** Positions older than this drop off the radar. */
export const POSITION_TTL_MS = 2 * 60_000;

export const DEFAULT_SETTINGS: OpsSettings = {
  liveOrdering: true, hailCart: true, mulliganLimit: 4,
  paceMinPerHole: 14, paceAlertMin: 15,
  courseHours: { open: '06:30', close: '20:30' }, kitchenHours: { open: '11:00', close: '21:00' },
  tournamentLive: false, liveSince: null,
};

export const initialOps = (): OpsState => ({ v: 1, settings: { ...DEFAULT_SETTINGS }, orders: [], registrations: [], teeSheet: [], positions: [] });

export type OpsAction =
  | { type: 'order'; order: Order }
  | { type: 'register'; reg: Registration }
  /** Captain (pre-event only) or staff (any time) edits a team. `actor` is the captain's phone. */
  | { type: 'roster'; id: string; teamName?: string; captain?: Contact; roster: [Contact, Contact, Contact]; actor?: string }
  | { type: 'pay'; id: string; amount: number }
  | { type: 'setting'; patch: Partial<OpsSettings> } // staff only
  | { type: 'status'; id: string; status: Order['status'] } // staff only
  | { type: 'book'; booking: TeeBooking } // staff only
  | { type: 'unbook'; id: string } // staff only
  /** Live telemetry: accepted only during a live event and only on the property (+250 ft). */
  | { type: 'ping'; pos: LivePosition }
  /** Kill switch: sever a player's broadcast (left the property, event over, app closed). */
  | { type: 'unping'; phone: string };

const STAFF_ONLY = new Set<OpsAction['type']>(['setting', 'status', 'book', 'unbook']);

// ── Hours ──────────────────────────────────────────────────────────────────────────────────────
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Local calendar date, "YYYY-MM-DD". */
export const localDate = (at: Date | number = Date.now()) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function isOpenAt(h: Hours, at: Date | number): boolean {
  const d = new Date(at);
  const m = d.getHours() * 60 + d.getMinutes();
  const o = toMin(h.open), c = toMin(h.close);
  if (o === c) return false;
  return o < c ? m >= o && m < c : m >= o || m < c;
}

export const fmtTime = (t: string) => {
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

/** True when the order needs the kitchen (any food & drink item). */
export const needsKitchen = (o: Pick<Order, 'items'>) => o.items.some((i) => i.kind === 'fnb');

/** Pure reducer. Role is checked here for the demo backend; the server enforces it with RLS. */
export function opsReducer(s: OpsState, a: OpsAction, role: Role): OpsState {
  if (STAFF_ONLY.has(a.type) && role !== 'staff') return s;
  switch (a.type) {
    case 'order': {
      const o = a.order;
      // Charity mulligans are digital: they keep selling when the kitchen/cart is switched off.
      const charityOnly = o.kind === 'order' && o.items.length > 0 && o.items.every((i) => i.kind === 'charity');
      if (o.kind === 'hail' ? !s.settings.hailCart : !charityOnly && !s.settings.liveOrdering) return s;
      if (needsKitchen(o) && !isOpenAt(s.settings.kitchenHours, o.createdAt)) return s; // no ghost orders
      const mulls = charityQty(o);
      if (mulls && mulligansBought(s.orders, o.player, o.createdAt) + mulls > s.settings.mulliganLimit) return s;
      return { ...s, orders: [{ ...o, status: (charityOnly ? 'delivered' : 'new') as Order['status'] }, ...s.orders].slice(0, 500) };
    }
    case 'register':
      return s.registrations.some((r) => r.id === a.reg.id) ? s : { ...s, registrations: [...s.registrations, a.reg] };
    case 'roster': {
      const reg = s.registrations.find((r) => r.id === a.id);
      if (!reg) return s;
      // Captains may edit only their own team, and only before the event goes live.
      if (role !== 'staff' && (s.settings.tournamentLive || !a.actor || normalizePhone(a.actor) !== normalizePhone(reg.captain.phone))) return s;
      const captain = cleanContact(a.captain ?? reg.captain);
      const roster = a.roster.map(cleanContact) as Registration['roster'];
      const v = validateTeam(a.teamName ?? reg.teamName, roster, captain);
      if (!v.ok) return s;
      return { ...s, registrations: s.registrations.map((r) => (r.id === a.id ? { ...r, teamName: v.teamName, captain, roster } : r)) };
    }
    case 'pay':
      if (!(a.amount > 0)) return s;
      return { ...s, registrations: s.registrations.map((r) => (r.id === a.id ? { ...r, paid: Math.min(r.total, r.paid + a.amount) } : r)) };
    case 'setting': {
      const p = { ...a.patch };
      if (p.mulliganLimit != null) p.mulliganLimit = clamp(Math.round(p.mulliganLimit), 0, 10);
      if (p.paceMinPerHole != null) p.paceMinPerHole = clamp(Math.round(p.paceMinPerHole * 2) / 2, 10, 20);
      if (p.paceAlertMin != null) p.paceAlertMin = clamp(Math.round(p.paceAlertMin), 5, 45);
      for (const k of ['courseHours', 'kitchenHours'] as const) if (p[k] && !(HHMM.test(p[k]!.open) && HHMM.test(p[k]!.close))) delete p[k];
      if (p.tournamentLive != null && p.tournamentLive !== s.settings.tournamentLive) p.liveSince = p.tournamentLive ? p.liveSince ?? Date.now() : null;
      // Ending the event wipes every stored position.
      return { ...s, settings: { ...s.settings, ...p }, ...(p.tournamentLive === false ? { positions: [] } : {}) };
    }
    case 'status':
      return { ...s, orders: s.orders.map((o) => (o.id === a.id ? { ...o, status: a.status } : o)) };
    case 'book': {
      const b = a.booking;
      if (!HHMM.test(b.time) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !validateBooking(b).ok) return s;
      if (s.teeSheet.some((x) => x.date === b.date && x.time === b.time)) return s; // one booking per slot
      const clean: TeeBooking = {
        ...b, name: sanitizeText(b.name, 40), note: b.note ? sanitizeText(b.note, 80) : undefined,
        phone: b.phone ? normalizePhone(b.phone) ?? '' : '', email: b.email.trim().toLowerCase(),
        size: b.status === 'blocked' ? 0 : b.size,
      };
      return { ...s, teeSheet: [...s.teeSheet, clean] };
    }
    case 'unbook':
      return { ...s, teeSheet: s.teeSheet.filter((b) => b.id !== a.id) };
    case 'ping': {
      const phone = normalizePhone(a.pos.phone);
      if (!phone) return s;
      const others = s.positions.filter((p) => p.phone !== phone);
      // Off property or no live event: drop any stored fix instead of recording this one.
      if (!s.settings.tournamentLive || !onProperty([a.pos.lat, a.pos.lng], COURSE_BOUNDARY)) {
        return others.length === s.positions.length ? s : { ...s, positions: others };
      }
      return { ...s, positions: [...others, { ...a.pos, phone }] };
    }
    case 'unping': {
      const phone = normalizePhone(a.phone);
      const next = s.positions.filter((p) => p.phone !== phone);
      return next.length === s.positions.length ? s : { ...s, positions: next };
    }
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const charityQty = (o: Order) => o.items.reduce((a, i) => a + (i.kind === 'charity' ? i.qty : 0), 0);
const MULLIGAN_WINDOW_MS = 18 * 3600_000;

/** Charity mulligans a player bought in the current event window (limit is per player per 18h). */
export const mulligansBought = (orders: Order[], player: string, now: number) =>
  orders.filter((o) => o.player === player && o.createdAt > now - MULLIGAN_WINDOW_MS).reduce((a, o) => a + charityQty(o), 0);

// ── Roster validation (verified contacts; open slots allowed until filled) ─────────────────────
export type ContactErrors = Partial<Record<keyof Contact, string>>;

export const blankContact = (): Contact => ({ first: '', last: '', phone: '', email: '' });
export const isOpenSlot = (c: Contact) => !`${c.first}${c.last}${c.phone}${c.email}`.trim();
export const filledCount = (r: Pick<Registration, 'roster'>) => 1 + r.roster.filter((c) => !isOpenSlot(c)).length;
export const balance = (r: Pick<Registration, 'total' | 'paid'>) => Math.max(0, r.total - r.paid);

export function cleanContact(c: Contact): Contact {
  if (isOpenSlot(c)) return blankContact();
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

/** The captain is always required; players 2–4 may be left open, but a started slot must be complete. */
export function validateTeam(teamName: string, roster: Contact[], captain: Contact) {
  const name = sanitizeText(teamName, 30);
  const errors = {
    team: name.length < 2 ? 'Name your team (2–30 characters)' : undefined,
    captain: validateContact(captain),
    roster: roster.map((c): ContactErrors => (isOpenSlot(c) ? {} : validateContact(c))),
    duplicate: undefined as string | undefined,
  };
  const phones = [captain, ...roster].filter((c) => !isOpenSlot(c)).map((c) => normalizePhone(c.phone)).filter(Boolean);
  if (new Set(phones).size !== phones.length) errors.duplicate = 'Each player needs their own phone number';
  const ok = !errors.team && !errors.duplicate && !Object.keys(errors.captain).length && errors.roster.every((r) => !Object.keys(r).length);
  return { ok, errors, teamName: name };
}

export function validateBooking(b: Pick<TeeBooking, 'status' | 'name' | 'size' | 'phone' | 'email'>) {
  const e: Partial<Record<'name' | 'size' | 'phone' | 'email', string>> = {};
  if (!sanitizeText(b.name, 40)) e.name = b.status === 'blocked' ? 'Give a reason' : 'Required';
  if (b.status === 'reserved') {
    if (!(Number.isInteger(b.size) && b.size >= 1 && b.size <= 4)) e.size = '1–4 players';
    if (!normalizePhone(b.phone)) e.phone = 'Enter a valid phone';
    if (b.email.trim() && !EMAIL_RE.test(b.email.trim().toLowerCase())) e.email = 'Enter a valid email';
  }
  return { ok: !Object.keys(e).length, errors: e };
}

// ── Pace of play ───────────────────────────────────────────────────────────────────────────────
/** Default target pace: 4h 21m for 18 holes. */
export const STANDARD_MIN_PER_HOLE = 14.5;

export interface Group { id: string; name: string; players: string[]; teeTime: number; minPerHole: number; startHole?: number }

/**
 * Where a group should be vs. where it is, against a target pace. `behindMin` > 0 means slower
 * than target (the radar flags groups beyond the staff-defined alert threshold).
 */
export function groupStatus(g: Group, now: number, target = STANDARD_MIN_PER_HOLE) {
  const elapsedMin = Math.max(0, (now - g.teeTime) / 60_000);
  const holesDone = Math.min(18, elapsedMin / g.minPerHole);
  const expectedDone = Math.min(18, elapsedMin / target);
  const behindMin = (expectedDone - holesDone) * target;
  const finished = holesDone >= 18;
  const idx = Math.min(17, Math.floor(holesDone));
  const hole = (((g.startHole ?? 1) - 1 + idx) % 18) + 1;
  return { hole, fraction: holesDone - Math.floor(holesDone), behindMin: Math.round(behindMin), started: now >= g.teeTime, finished };
}
