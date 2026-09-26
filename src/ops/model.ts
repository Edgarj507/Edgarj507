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
  /** In-house tournament: the course runs its own event, so the OS merges the tee sheet with the CRM / radar in one view. */
  inHouse: boolean;
}

/** Organizer-supplied branding for an event (text + banner/flyer). */
export interface EventBanner { name: string; type: string; dataUrl: string }
export interface EventDetails { text?: string; banner?: EventBanner }
export const BANNER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
/** Demo backend keeps the flyer inline; production stores it in object storage. */
export const BANNER_MAX_BYTES = 1_500_000;

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
  /** 'cancelled' = the player undid it within the grace window; never fulfilled or tallied. */
  status: 'new' | 'enroute' | 'completed' | 'cancelled';
  /** When staff marked it completed (drives the End of Day tally). */
  completedAt?: number;
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
  /** Event-day check-in at the registration table (staff). */
  checkedInAt?: number;
}

export interface TeeBooking {
  id: string;
  /** Local date "YYYY-MM-DD" and time "HH:MM". */
  date: string;
  time: string;
  status: 'reserved';
  name: string;
  size: number;
  phone: string;
  email: string;
  source: 'phone' | 'walkup' | 'app' | 'staff';
  note?: string;
}

export const BLOCK_REASONS = ['Maintenance', 'Private Event', 'Tournament', 'Season Closed', 'Irrigation repair', 'Weather', 'League', 'Other'] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

/**
 * A tee-sheet block: one slot, a window of times, or whole days across a date range.
 * `from`/`to` ("HH:MM", end exclusive) omitted = all day.
 */
export interface TeeBlock { id: string; reason: BlockReason; note?: string; startDate: string; endDate: string; from?: string; to?: string }

/** A player's last on-property GPS fix during a live event. Never stored off-property. */
export interface LivePosition { player: string; phone: string; lat: number; lng: number; at: number }

export interface OpsState { v: 1; settings: OpsSettings; orders: Order[]; registrations: Registration[]; teeSheet: TeeBooking[]; teeBlocks: TeeBlock[]; positions: LivePosition[]; eventDetails: Record<string, EventDetails>; tickets: SupportTicket[] }

/** Somerby property line (hole hull); positions outside it + 250 ft are refused. */
export const COURSE_BOUNDARY = courseBoundary(SOMERBY_DATA.holes);
/** Positions older than this drop off the radar. */
export const POSITION_TTL_MS = 2 * 60_000;

export const DEFAULT_SETTINGS: OpsSettings = {
  liveOrdering: true, hailCart: true, mulliganLimit: 4,
  paceMinPerHole: 14, paceAlertMin: 15,
  courseHours: { open: '06:30', close: '20:30' }, kitchenHours: { open: '11:00', close: '21:00' },
  tournamentLive: false, liveSince: null, inHouse: false,
};

export const initialOps = (): OpsState => ({ v: 1, settings: { ...DEFAULT_SETTINGS }, orders: [], registrations: [], teeSheet: [], teeBlocks: [], positions: [], eventDetails: {}, tickets: [] });

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
  | { type: 'block'; block: TeeBlock } // staff only
  | { type: 'unblock'; id: string } // staff only
  | { type: 'eventDetails'; eventId: string; patch: EventDetails | { banner: null } } // staff only
  | { type: 'editBlock'; block: TeeBlock } // staff only
  /** Correct a recorded payment (e.g. undo a mistaken "cash received"). */
  | { type: 'setPaid'; id: string; paid: number } // staff only
  | { type: 'checkIn'; id: string; at: number | null } // staff only
  /** Player undoes their own order while it is still new and within the grace window. */
  | { type: 'cancel'; id: string; player: string; at: number }
  | { type: 'ticket'; ticket: SupportTicket }
  | { type: 'ticketStatus'; id: string; status: TicketStatus; note?: string } // staff only
  /** Live telemetry: accepted only during a live event and only on the property (+250 ft). */
  | { type: 'ping'; pos: LivePosition }
  /** Kill switch: sever a player's broadcast (left the property, event over, app closed). */
  | { type: 'unping'; phone: string };

const STAFF_ONLY = new Set<OpsAction['type']>(['setting', 'status', 'book', 'unbook', 'block', 'unblock', 'eventDetails', 'editBlock', 'setPaid', 'ticketStatus', 'checkIn']);

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
      // Anti-spam: a player may have at most 5 open orders and 1 open cart hail.
      const open = s.orders.filter((x) => x.player === o.player && (x.status === 'new' || x.status === 'enroute'));
      if (o.kind === 'hail' ? open.some((x) => x.kind === 'hail') : open.filter((x) => x.kind === 'order').length >= MAX_OPEN_ORDERS) return s;
      const mulls = charityQty(o);
      if (mulls && mulligansBought(s.orders, o.player, o.createdAt) + mulls > s.settings.mulliganLimit) return s;
      // Charity mulligans are digital: nothing to deliver, so they're completed on purchase.
      const placed: Order = charityOnly ? { ...o, status: 'completed', completedAt: o.createdAt } : { ...o, status: 'new', completedAt: undefined };
      return { ...s, orders: [placed, ...s.orders].slice(0, 2000) };
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
      return { ...s, orders: s.orders.map((o) => (o.id === a.id ? { ...o, status: a.status, completedAt: a.status === 'completed' ? o.completedAt ?? Date.now() : undefined } : o)) };
    case 'book': {
      const b = a.booking;
      if (!HHMM.test(b.time) || !DATE.test(b.date) || !validateBooking(b).ok) return s;
      if (s.teeSheet.some((x) => x.date === b.date && x.time === b.time)) return s; // one booking per slot
      if (blockFor(s.teeBlocks, b.date, b.time)) return s; // blocked time
      const clean: TeeBooking = {
        ...b, status: 'reserved', name: sanitizeText(b.name, 40), note: b.note ? sanitizeText(b.note, 80) : undefined,
        phone: normalizePhone(b.phone) ?? '', email: b.email.trim().toLowerCase(),
      };
      return { ...s, teeSheet: [...s.teeSheet, clean] };
    }
    case 'block': {
      const k = a.block;
      if (!validateBlock(k).ok) return s;
      return { ...s, teeBlocks: [...s.teeBlocks, { ...k, note: k.note ? sanitizeText(k.note, 80) || undefined : undefined }] };
    }
    case 'unblock':
      return { ...s, teeBlocks: s.teeBlocks.filter((k) => k.id !== a.id) };
    case 'editBlock': {
      const k = a.block;
      if (!s.teeBlocks.some((x) => x.id === k.id) || !validateBlock(k).ok) return s;
      return { ...s, teeBlocks: s.teeBlocks.map((x) => (x.id === k.id ? { ...k, note: k.note ? sanitizeText(k.note, 80) || undefined : undefined } : x)) };
    }
    case 'checkIn':
      return { ...s, registrations: s.registrations.map((r) => (r.id === a.id ? { ...r, checkedInAt: a.at ?? undefined } : r)) };
    case 'setPaid':
      if (!(a.paid >= 0)) return s;
      return { ...s, registrations: s.registrations.map((r) => (r.id === a.id ? { ...r, paid: Math.min(r.total, a.paid) } : r)) };
    case 'cancel': {
      const o = s.orders.find((x) => x.id === a.id);
      if (!o || o.player !== a.player || o.status !== 'new' || a.at - o.createdAt > CANCEL_WINDOW_MS) return s;
      return { ...s, orders: s.orders.map((x) => (x.id === a.id ? { ...x, status: 'cancelled' } : x)) };
    }
    case 'ticket': {
      const t = cleanTicket(a.ticket);
      if (!t || s.tickets.some((x) => x.id === t.id)) return s;
      return { ...s, tickets: [t, ...s.tickets].slice(0, MAX_TICKETS) };
    }
    case 'ticketStatus':
      if (!TICKET_STATUSES.includes(a.status)) return s;
      return { ...s, tickets: s.tickets.map((t) => (t.id === a.id ? { ...t, status: a.status, note: a.note !== undefined ? sanitizeText(a.note, 500) : t.note, updatedAt: Date.now() } : t)) };
    case 'eventDetails': {
      const cur = s.eventDetails[a.eventId] ?? {};
      const next: EventDetails = { ...cur };
      if ('text' in a.patch && a.patch.text !== undefined) next.text = cleanOrganizerText(a.patch.text);
      if ('banner' in a.patch) {
        const b = a.patch.banner;
        if (b === null) delete next.banner;
        else if (b && validBanner(b)) next.banner = { name: sanitizeText(b.name, 80), type: b.type, dataUrl: b.dataUrl };
        else return s;
      }
      return { ...s, eventDetails: { ...s.eventDetails, [a.eventId]: next } };
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

export const CANCEL_WINDOW_MS = 2 * 60_000;
/** Waiting for staff: new or en route (not completed, not cancelled). */
export const isOpenOrder = (o: Pick<Order, 'status'>) => o.status === 'new' || o.status === 'enroute';
export const MAX_OPEN_ORDERS = 5;

// ── Support tickets ───────────────────────────────────────────────────────────────────────────
export const TICKET_CATEGORIES = ['GPS Tracking', 'Scorecard', 'F&B Ordering', 'App Crash', 'Other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const TICKET_STATUSES = ['open', 'investigating', 'resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export interface Diagnostics { [k: string]: string | number | boolean | string[] }
export interface SupportTicket {
  id: string; createdAt: number; updatedAt?: number;
  category: TicketCategory; description: string; reporter: string; contact?: string;
  source: 'player' | 'staff'; status: TicketStatus; note?: string;
  /** Re-encoded JPEG (EXIF/GPS stripped), ≤ 600 KB. */
  screenshot?: string;
  diagnostics: Diagnostics;
}
const MAX_TICKETS = 100;
export const SCREENSHOT_MAX_CHARS = 800_000; // ≈ 600 KB of JPEG as base64
const DIAG_MAX_CHARS = 12_000;

/** Validate + normalize a ticket before it is stored (all fields untrusted). */
export function cleanTicket(t: SupportTicket): SupportTicket | null {
  if (!(TICKET_CATEGORIES as readonly string[]).includes(t.category)) return null;
  const description = t.description.replace(/[<>]/g, '').split(/\r?\n/).map((l) => sanitizeText(l, 500)).join('\n').trim().slice(0, 2000);
  if (description.length < 10) return null;
  if (t.screenshot && !(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(t.screenshot) && t.screenshot.length <= SCREENSHOT_MAX_CHARS)) return null;
  const diag = JSON.stringify(t.diagnostics ?? {});
  if (diag.length > DIAG_MAX_CHARS) return null;
  const contact = t.contact ? (EMAIL_RE.test(t.contact.trim()) ? t.contact.trim().toLowerCase() : normalizePhone(t.contact) ?? undefined) : undefined;
  return {
    id: t.id, createdAt: t.createdAt, category: t.category, description, reporter: sanitizeText(t.reporter, 60) || 'Anonymous',
    ...(contact ? { contact } : {}), source: t.source === 'staff' ? 'staff' : 'player', status: 'open',
    ...(t.screenshot ? { screenshot: t.screenshot } : {}), diagnostics: JSON.parse(diag),
  };
}

// ── Undo (staff corrections) ──────────────────────────────────────────────────────────────────
/**
 * The action that reverses `a` given the state *before* it ran, or null when it can't be undone
 * safely (e.g. starting/ending a tournament, which starts/stops location sharing).
 */
export function inverseOf(s: OpsState, a: OpsAction): OpsAction | null {
  switch (a.type) {
    case 'status': {
      const o = s.orders.find((x) => x.id === a.id);
      return o && o.status !== a.status && o.status !== 'cancelled' ? { type: 'status', id: a.id, status: o.status } : null;
    }
    case 'book': return { type: 'unbook', id: a.booking.id };
    case 'unbook': { const b = s.teeSheet.find((x) => x.id === a.id); return b ? { type: 'book', booking: b } : null; }
    case 'block': return { type: 'unblock', id: a.block.id };
    case 'unblock': { const k = s.teeBlocks.find((x) => x.id === a.id); return k ? { type: 'block', block: k } : null; }
    case 'editBlock': { const k = s.teeBlocks.find((x) => x.id === a.block.id); return k ? { type: 'editBlock', block: k } : null; }
    case 'roster': {
      const r = s.registrations.find((x) => x.id === a.id);
      return r ? { type: 'roster', id: r.id, teamName: r.teamName, captain: r.captain, roster: r.roster } : null;
    }
    case 'checkIn': {
      const r = s.registrations.find((x) => x.id === a.id);
      return r ? { type: 'checkIn', id: r.id, at: r.checkedInAt ?? null } : null;
    }
    case 'pay': case 'setPaid': {
      const r = s.registrations.find((x) => x.id === a.id);
      return r ? { type: 'setPaid', id: r.id, paid: r.paid } : null;
    }
    case 'setting': {
      if ('tournamentLive' in a.patch) return null;
      const prev = Object.fromEntries(Object.keys(a.patch).map((k) => [k, s.settings[k as keyof OpsSettings]]));
      return { type: 'setting', patch: prev as Partial<OpsSettings> };
    }
    case 'eventDetails': {
      const d = s.eventDetails[a.eventId] ?? {};
      return { type: 'eventDetails', eventId: a.eventId, patch: { text: d.text ?? '', banner: d.banner ?? null } };
    }
    case 'ticketStatus': { const t = s.tickets.find((x) => x.id === a.id); return t ? { type: 'ticketStatus', id: t.id, status: t.status, note: t.note ?? '' } : null; }
    default: return null;
  }
}

/** Neutralize spreadsheet formulas in exported cells (CSV injection). */
export const csvCell = (v: string) => {
  const c = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
};

// ── Event branding ────────────────────────────────────────────────────────────────────────────
/** Organizer text: plain text, line breaks kept, markup stripped, 800 chars max. */
export const cleanOrganizerText = (t: string) =>
  t.replace(/[<>]/g, '').split(/\r?\n/).map((l) => sanitizeText(l, 200)).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 800);

/** Banner/flyer: an image or PDF data URL whose declared type matches the file, under the size cap. */
export function validBanner(b: EventBanner) {
  if (!BANNER_TYPES.includes(b.type)) return false;
  if (!b.dataUrl.startsWith(`data:${b.type};base64,`)) return false;
  return Math.floor(((b.dataUrl.length - b.dataUrl.indexOf(',') - 1) * 3) / 4) <= BANNER_MAX_BYTES;
}

// ── End of Day tally ──────────────────────────────────────────────────────────────────────────
export interface EodLine { sku: string; name: string; kind: OrderItem['kind']; qty: number; revenue: number }

/** Completed orders on a local date: count, itemized sales and revenue (charity shown separately). */
export function eodTally(orders: Order[], date: string) {
  const done = orders.filter((o) => o.status === 'completed' && o.completedAt != null && localDate(o.completedAt) === date);
  const lines = new Map<string, EodLine>();
  for (const o of done) for (const i of o.items) {
    const l = lines.get(i.sku) ?? { sku: i.sku, name: i.name, kind: i.kind, qty: 0, revenue: 0 };
    l.qty += i.qty;
    l.revenue += i.qty * i.price;
    lines.set(i.sku, l);
  }
  const items = [...lines.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const sales = done.filter((o) => o.kind === 'order');
  return {
    orders: sales.length,
    hails: done.length - sales.length,
    items,
    revenue: items.reduce((a, l) => a + l.revenue, 0),
    byKind: {
      fnb: items.filter((l) => l.kind === 'fnb').reduce((a, l) => a + l.revenue, 0),
      shop: items.filter((l) => l.kind === 'shop').reduce((a, l) => a + l.revenue, 0),
      charity: items.filter((l) => l.kind === 'charity').reduce((a, l) => a + l.revenue, 0),
    },
    openOrders: orders.filter(isOpenOrder).length,
  };
}

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

export function validateBooking(b: Pick<TeeBooking, 'name' | 'size' | 'phone' | 'email'>) {
  const e: Partial<Record<'name' | 'size' | 'phone' | 'email', string>> = {};
  if (!sanitizeText(b.name, 40)) e.name = 'Required';
  if (!(Number.isInteger(b.size) && b.size >= 1 && b.size <= 4)) e.size = '1–4 players';
  if (!normalizePhone(b.phone)) e.phone = 'Enter a valid phone';
  if (b.email.trim() && !EMAIL_RE.test(b.email.trim().toLowerCase())) e.email = 'Enter a valid email';
  return { ok: !Object.keys(e).length, errors: e };
}

// ── Tee-sheet blocks ───────────────────────────────────────────────────────────────────────────
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BLOCK_DAYS = 366;
const dayNo = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);

export function validateBlock(k: Pick<TeeBlock, 'reason' | 'startDate' | 'endDate' | 'from' | 'to'>) {
  const e: Partial<Record<'reason' | 'dates' | 'times', string>> = {};
  if (!(BLOCK_REASONS as readonly string[]).includes(k.reason)) e.reason = 'Pick a reason';
  if (!DATE.test(k.startDate) || !DATE.test(k.endDate) || k.endDate < k.startDate) e.dates = 'End date must be on or after the start date';
  else if (dayNo(k.endDate) - dayNo(k.startDate) >= MAX_BLOCK_DAYS) e.dates = 'Blocks can span at most a year';
  if ((k.from == null) !== (k.to == null)) e.times = 'Set both times, or neither for all day';
  else if (k.from != null && (!HHMM.test(k.from) || !HHMM.test(k.to!) || k.to! <= k.from)) e.times = 'End time must be after the start time';
  return { ok: !Object.keys(e).length, errors: e };
}

/** The block covering a date/time slot, if any. */
export const blockFor = (blocks: TeeBlock[], date: string, time: string) =>
  blocks.find((k) => date >= k.startDate && date <= k.endDate && (k.from == null || (time >= k.from && time < k.to!)));

/** All-day block for a date (the whole sheet is closed). */
export const dayBlock = (blocks: TeeBlock[], date: string) => blocks.find((k) => k.from == null && date >= k.startDate && date <= k.endDate);

export const blockLabel = (k: TeeBlock) => {
  const d = (x: string) => new Date(`${x}T12:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const days = k.startDate === k.endDate ? d(k.startDate) : `${d(k.startDate)} – ${d(k.endDate)}`;
  return k.from ? `${days} · ${fmtTime(k.from)}–${fmtTime(k.to!)}` : `${days} · all day`;
};

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
