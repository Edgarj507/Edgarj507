import { sanitizeText } from '../../supabase/functions/_shared/validation.ts';

/**
 * Tee-time pricing & booking policy — set by staff in the Clubhouse OS (Pricing & Policies) and
 * read live by the golfer booking wizard. Prices are always computed with `quote()` from these
 * settings (the reducer / server recompute them; a client-sent price is never trusted).
 */
export type Holes = '18' | 'front9' | 'back9';
export type Transport = 'walk' | 'ride';

export interface RateBand {
  id: string;
  label: string;
  /** Band applies from this local time ("HH:MM") until the next band starts. */
  from: string;
  weekday18: number; weekday9: number;
  weekend18: number; weekend9: number;
}

export interface TeePricing {
  bands: RateBand[];
  cart: { mode: 'per-golfer' | 'per-reservation'; price18: number; price9: number };
  /** Walking allowed at all (some courses require carts). */
  walking: boolean;
  /** Minutes between tee times. */
  interval: number;
  /** How far ahead golfers may book, in days. */
  bookingWindowDays: number;
  /** Free cancellation up to this many hours before the tee time. */
  cancelHours: number;
  /** Most upcoming reservations one golfer may hold. */
  maxUpcoming: number;
  policies: { cancellation: string; rules: string; dressCode: string };
}

export const DEFAULT_PRICING: TeePricing = {
  bands: [
    { id: 'morning', label: 'Morning', from: '06:30', weekday18: 52, weekday9: 30, weekend18: 64, weekend9: 36 },
    { id: 'midday', label: 'Midday', from: '11:00', weekday18: 46, weekday9: 27, weekend18: 58, weekend9: 33 },
    { id: 'twilight', label: 'Twilight', from: '15:30', weekday18: 34, weekday9: 22, weekend18: 40, weekend9: 25 },
  ],
  cart: { mode: 'per-golfer', price18: 20, price9: 12 },
  walking: true,
  interval: 10,
  bookingWindowDays: 14,
  cancelHours: 24,
  maxUpcoming: 3,
  policies: {
    cancellation: 'Cancel at least 24 hours before your tee time at no charge. Later cancellations and no-shows may be charged the full green fee.',
    rules: 'Please arrive 15 minutes before your tee time and check in at the pro shop. Keep carts 90° on fairways and off tees and greens. Replace divots and repair ball marks.',
    dressCode: 'Collared shirts required. No denim, tank tops or metal spikes.',
  },
};

export const HOLES_LABEL: Record<Holes, string> = { '18': '18 holes', front9: '9 holes · Front', back9: '9 holes · Back' };
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** All tee times for the course hours at the configured interval. */
export function teeTimes(hours: { open: string; close: string }, interval = DEFAULT_PRICING.interval) {
  const open = toMin(hours.open), close = toMin(hours.close);
  const end = close > open ? close : close + 1440;
  const out: string[] = [];
  for (let m = open; m < end; m += Math.max(5, interval)) out.push(fromMin(m));
  return out;
}

/** Sat/Sun count as weekend (dates are local "YYYY-MM-DD"). */
export const isWeekend = (date: string) => { const d = new Date(`${date}T12:00`).getDay(); return d === 0 || d === 6; };

export function bandFor(p: TeePricing, time: string): RateBand {
  const sorted = [...p.bands].sort((a, b) => toMin(a.from) - toMin(b.from));
  return [...sorted].reverse().find((b) => toMin(b.from) <= toMin(time)) ?? sorted[0];
}

export interface Quote {
  band: RateBand; weekend: boolean;
  greenEach: number; greens: number;
  cartEach: number; cart: number;
  total: number;
  lines: { label: string; amount: number }[];
}

export function quote(p: TeePricing, date: string, time: string, holes: Holes, transport: Transport, players: number): Quote {
  const band = bandFor(p, time);
  const weekend = isWeekend(date);
  const nine = holes !== '18';
  const greenEach = weekend ? (nine ? band.weekend9 : band.weekend18) : (nine ? band.weekday9 : band.weekday18);
  const cartRate = nine ? p.cart.price9 : p.cart.price18;
  const ride = transport === 'ride';
  const cart = !ride ? 0 : p.cart.mode === 'per-golfer' ? cartRate * players : cartRate;
  const greens = greenEach * players;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const lines = [
    { label: `Green fee · ${band.label} ${weekend ? 'weekend' : 'weekday'} · ${players} × $${greenEach}`, amount: r2(greens) },
    ...(ride ? [{ label: p.cart.mode === 'per-golfer' ? `Cart fee · ${players} × $${cartRate}` : `Cart fee · per reservation`, amount: r2(cart) }] : []),
  ];
  return { band, weekend, greenEach, greens: r2(greens), cartEach: ride && p.cart.mode === 'per-golfer' ? cartRate : 0, cart: r2(cart), total: r2(greens + cart), lines };
}

const money = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000;
export function validatePricing(p: TeePricing) {
  const e: string[] = [];
  if (!p.bands.length || p.bands.length > 6) e.push('1–6 rate bands');
  const HH = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (p.bands.some((b) => !HH.test(b.from) || !sanitizeText(b.label, 30) || ![b.weekday18, b.weekday9, b.weekend18, b.weekend9].every(money))) e.push('Each band needs a name, start time and prices ($0–$1,000)');
  if (new Set(p.bands.map((b) => b.from)).size !== p.bands.length) e.push('Bands must start at different times');
  if (!['per-golfer', 'per-reservation'].includes(p.cart.mode) || !money(p.cart.price18) || !money(p.cart.price9)) e.push('Cart fees $0–$1,000');
  if (![5, 7, 8, 9, 10, 12, 15, 20].includes(p.interval)) e.push('Interval 5–20 min');
  if (!(Number.isInteger(p.bookingWindowDays) && p.bookingWindowDays >= 1 && p.bookingWindowDays <= 60)) e.push('Booking window 1–60 days');
  if (!(Number.isInteger(p.cancelHours) && p.cancelHours >= 0 && p.cancelHours <= 168)) e.push('Cancellation 0–168 hours');
  if (!(Number.isInteger(p.maxUpcoming) && p.maxUpcoming >= 1 && p.maxUpcoming <= 10)) e.push('1–10 upcoming reservations');
  return { ok: !e.length, errors: e };
}

const clean = (t: string, max: number) => t.replace(/[<>]/g, '').split(/\r?\n/).map((l) => sanitizeText(l, max)).join('\n').trim().slice(0, max);
export const cleanPricing = (p: TeePricing): TeePricing => ({
  ...p,
  bands: [...p.bands].sort((a, b) => toMin(a.from) - toMin(b.from)).map((b) => ({ ...b, label: sanitizeText(b.label, 30) })),
  policies: { cancellation: clean(p.policies.cancellation, 600), rules: clean(p.policies.rules, 800), dressCode: clean(p.policies.dressCode, 300) },
});

/** Minutes since midnight → epoch for a local date + time. */
export const teeAt = (date: string, time: string) => new Date(`${date}T${time}`).getTime();
export const canCancel = (p: TeePricing, date: string, time: string, now: number) => teeAt(date, time) - now >= p.cancelHours * 3600_000;
