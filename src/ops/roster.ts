import { normalizePhone } from '../lib/sms';
import type { Contact, Registration } from './model';

/**
 * Cross-tournament roster tools for organizers and staff:
 *  • searchGolfers — find a golfer by name or phone across every event's registrations.
 *  • seat / share maths used when a registration (or one player) moves to another event.
 */
export interface EventLite { id: string; name: string; date: string; startsOn?: string; foursomePrice: number; teams: number; status?: string }

export interface GolferHit {
  reg: Registration;
  event: EventLite | undefined;
  /** -1 = captain, 0–2 = roster slot. */
  slot: number;
  contact: Contact;
}

const digits = (s: string) => s.replace(/\D/g, '');
const isOpen = (c: Contact) => !`${c.first}${c.last}${c.phone}${c.email}`.trim();

export function searchGolfers(regs: Registration[], events: EventLite[], query: string, limit = 25): GolferHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const qd = digits(q);
  const phoneSearch = qd.length >= 3 && qd.length >= q.replace(/[\s()+.-]/g, '').length; // mostly digits
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits: GolferHit[] = [];
  for (const reg of regs) {
    const people: [number, Contact][] = [[-1, reg.captain], ...reg.roster.map((c, i) => [i, c] as [number, Contact])];
    for (const [slot, c] of people) {
      if (isOpen(c)) continue;
      const match = phoneSearch
        ? digits(c.phone).includes(qd.length > 10 && qd.startsWith('1') ? qd.slice(1) : qd)
        : tokens.every((t) => `${c.first} ${c.last}`.toLowerCase().includes(t));
      if (match) hits.push({ reg, event: events.find((e) => e.id === reg.eventId), slot, contact: c });
    }
  }
  return hits.sort((a, b) => (a.event?.startsOn ?? '').localeCompare(b.event?.startsOn ?? '') || a.contact.last.localeCompare(b.contact.last)).slice(0, limit);
}

export const seatPrice = (e: Pick<EventLite, 'foursomePrice'>) => Math.round((e.foursomePrice / 4) * 100) / 100;
const filled = (r: Registration) => 1 + r.roster.filter((c) => !isOpen(c)).length;
/** Payment credited to one player leaving a team: their share of what the team paid, at most one seat. */
export const playerShare = (r: Registration, from: Pick<EventLite, 'foursomePrice'>) =>
  Math.round(Math.min(r.paid / filled(r), seatPrice(from)) * 100) / 100;

/** Phones already registered for an event (any slot) — one entry per golfer per event. */
export const phonesIn = (regs: Registration[], eventId: string, exceptRegId?: string) =>
  new Set(regs.filter((r) => r.eventId === eventId && r.id !== exceptRegId)
    .flatMap((r) => [r.captain, ...r.roster]).map((c) => normalizePhone(c.phone)).filter((p): p is string => !!p));

export const teamPhones = (r: Pick<Registration, 'captain' | 'roster'>) =>
  [r.captain, ...r.roster].map((c) => normalizePhone(c.phone)).filter((p): p is string => !!p);

export const shotgunHole = (regs: Registration[], eventId: string) => `Shotgun · Hole ${(regs.filter((r) => r.eventId === eventId).length % 18) + 1}`;
