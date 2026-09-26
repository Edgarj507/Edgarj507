import { sanitizeText, EMAIL_RE } from '../../supabase/functions/_shared/validation.ts';
import { normalizePhone } from '../lib/sms';
import type { EventInfo } from '../tournaments/events';

/**
 * Verified course directory. Only a course on this list can be claimed, and only after the claim
 * is approved by Exclusive.Golf (see CourseVerification). `onPlatform` = the course runs the
 * Clubhouse OS (broadcasts, ordering, live radar); other courses still get the player-side
 * weather guard. Coordinates are approximate course locations (weather lookups only).
 */
export interface Venue { id: string; name: string; location: string; lat: number; lng: number; onPlatform: boolean }

export const VENUES: Venue[] = [
  { id: 'somerby', name: 'Somerby Golf Club', location: 'Byron, MN', lat: 44.0474, lng: -92.6319, onPlatform: true },
  { id: 'rochester-gcc', name: 'Rochester Golf & Country Club', location: 'Rochester, MN', lat: 44.03, lng: -92.51, onPlatform: false },
  { id: 'eastwood', name: 'Eastwood Golf Course', location: 'Rochester, MN', lat: 43.99, lng: -92.42, onPlatform: false },
  { id: 'northern-hills', name: 'Northern Hills Golf Course', location: 'Rochester, MN', lat: 44.07, lng: -92.49, onPlatform: false },
  { id: 'soldiers-field', name: 'Soldiers Field Golf Course', location: 'Rochester, MN', lat: 44.0, lng: -92.47, onPlatform: false },
  { id: 'willow-creek', name: 'Willow Creek Golf Course', location: 'Rochester, MN', lat: 43.97, lng: -92.5, onPlatform: false },
];
export const venueById = (id: string) => VENUES.find((v) => v.id === id);

/** Tournament as managed by organizers (EventInfo + where/when it happens). */
export interface TournamentEvent extends EventInfo { venueId: string; startsOn: string; organizer?: string; status: 'scheduled' | 'completed' }

export function validateEvent(e: TournamentEvent) {
  const err: Partial<Record<'name' | 'venue' | 'date' | 'price' | 'teams', string>> = {};
  if (sanitizeText(e.name, 80).length < 3) err.name = 'Name the event';
  if (!venueById(e.venueId)) err.venue = 'Pick a verified venue';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.startsOn)) err.date = 'Pick a date';
  if (!(Number.isFinite(e.foursomePrice) && e.foursomePrice >= 0 && e.foursomePrice <= 10000)) err.price = '$0–$10,000';
  if (!(Number.isInteger(e.teams) && e.teams >= 1 && e.teams <= 72)) err.teams = '1–72 teams';
  return { ok: !Object.keys(err).length, errors: err };
}

/** Fill display fields (date strings, course/location) from the structured ones. */
export function normalizeEvent(e: TournamentEvent): TournamentEvent {
  const v = venueById(e.venueId)!;
  const d = new Date(`${e.startsOn}T12:00`);
  return {
    ...e,
    name: sanitizeText(e.name, 80),
    course: v.name,
    location: `${v.name} · ${v.location}`,
    date: `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${sanitizeText(e.time, 60).split('·').pop()?.trim() || 'TBA'}`,
    longDate: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    time: sanitizeText(e.time, 80),
    format: sanitizeText(e.format, 60),
    cause: sanitizeText(e.cause, 120),
    organizerText: e.organizerText.replace(/[<>]/g, '').slice(0, 800),
  };
}

// ── Clubhouse onboarding: course verification ────────────────────────────────────────────────
export interface CourseVerification {
  id: string; venueId: string; venueName: string;
  applicant: string; title: string; email: string; phone: string;
  proof?: { name: string; type: string; dataUrl: string };
  note?: string; submittedAt: number;
  status: 'pending' | 'approved' | 'rejected'; decidedAt?: number; reason?: string;
}
export const PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export const PROOF_MAX_CHARS = 2_100_000; // ≈ 1.5 MB as base64

export function validateVerification(v: CourseVerification) {
  const e: Partial<Record<'venue' | 'applicant' | 'title' | 'email' | 'phone' | 'proof', string>> = {};
  if (!venueById(v.venueId)) e.venue = 'Pick your course from the directory';
  if (sanitizeText(v.applicant, 60).length < 3) e.applicant = 'Your full name';
  if (sanitizeText(v.title, 60).length < 2) e.title = 'Your role at the course';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Work email';
  if (!normalizePhone(v.phone)) e.phone = 'Course phone number';
  if (!v.proof) e.proof = 'Attach proof of management (business card, letterhead, license…)';
  else if (!PROOF_TYPES.includes(v.proof.type) || !v.proof.dataUrl.startsWith(`data:${v.proof.type};base64,`) || v.proof.dataUrl.length > PROOF_MAX_CHARS) e.proof = 'Image or PDF up to 1.5 MB';
  return { ok: !Object.keys(e).length, errors: e };
}
