export interface Lie {
  /** Yards to the aim point for this shot. */
  line: number;
  /** Yards to the flag. */
  pin: number;
  /** Aim-point elevation minus ball elevation, yards. */
  elev: number;
}

export interface Hole {
  number: number;
  par: number;
  /** Yardage from the selected tee. */
  yards: number;
  /** Overall tee → green bearing (degrees true). */
  bearingDeg: number;
  /** Hole centre line from the back tee to the green centre, [lat, lng] (follows doglegs). */
  path: [number, number][];
  /** Mock GPS feed: lie after N strokes. Past the end, the last lie repeats. */
  lies: Lie[];
}

import somerby from './courses/somerby.json';
import { bearingDeg } from '../../supabase/functions/_shared/pins.ts';

/**
 * Somerby Golf Club, Byron, MN — hole geometry imported from OpenStreetMap
 * (scripts/import-course-osm.mjs; © OpenStreetMap contributors, ODbL). Pars tagged in OSM are
 * used as-is; the rest are estimated from length and corrected to the published par 72.
 */
const GEO = somerby.holes as { number: number; par: number; parSource: string; yards: number; path: [number, number][]; green: [number, number] }[];
const MAX_LAYUP = 250;
const PARS = GEO.map((h) => h.par);
const YARDS = GEO.map((h) => h.yards);

/** Stock mock plan: lay up to MAX_LAYUP until in range, approach leaves ~8% of the distance, then short putts. */
export function planLies(yards: number, holeNo: number): Lie[] {
  const lies: Lie[] = [];
  let pin = yards;
  let i = 0;
  while (pin > 2 && lies.length < 8) {
    const layup = pin > MAX_LAYUP + 20;
    const line = layup ? MAX_LAYUP : pin;
    const elev = pin <= 20 ? 0 : ((holeNo * 7 + i * 3) % 11) - 5;
    lies.push({ line, pin, elev });
    pin = layup ? pin - MAX_LAYUP : pin > 20 ? Math.max(3, Math.round(pin * 0.08)) : Math.floor(pin / 3);
    i++;
  }
  if (lies.length === 0) lies.push({ line: pin, pin, elev: 0 });
  return lies;
}

export type TeeId = 'black' | 'blue' | 'white' | 'red';

/** Yardage relative to the back tees; rating/slope are placeholders until the official card is loaded. */
export const TEES: Record<TeeId, { label: string; factor: number; rating: number; slope: number }> = {
  black: { label: 'Black', factor: 1, rating: 74.6, slope: 138 },
  blue: { label: 'Blue', factor: 0.94, rating: 72.4, slope: 132 },
  white: { label: 'White', factor: 0.87, rating: 70.1, slope: 126 },
  red: { label: 'Red', factor: 0.76, rating: 67.8, slope: 118 },
};
export const TEE_IDS = Object.keys(TEES) as TeeId[];

export const PAR_BY_HOLE = PARS;

export function buildHoles(tee: TeeId): Hole[] {
  const f = TEES[tee].factor;
  return PARS.map((par, i) => {
    const yards = Math.round(YARDS[i] * f);
    const path = GEO[i].path;
    const [tLat, tLng] = path[0];
    const [gLat, gLng] = GEO[i].green;
    return {
      number: i + 1, par, yards, path,
      bearingDeg: bearingDeg({ lat: tLat, lng: tLng }, { lat: gLat, lng: gLng }),
      lies: planLies(yards, i + 1),
    };
  });
}

const cache = new Map<TeeId, Hole[]>();
export const holesFor = (tee: TeeId) => cache.get(tee) ?? (cache.set(tee, buildHoles(tee)), cache.get(tee)!);

export const COURSE = {
  name: somerby.name,
  location: 'Byron, MN',
  attribution: `Course data ${somerby.attribution}`,
  holes: holesFor('black'),
};

export const lieFor = (hole: Hole, strokes: number) => hole.lies[Math.min(strokes, hole.lies.length - 1)];

/** Green centre (centroid of the mapped green); also seeded into course_greens in SQL. */
export const greenCenter = (holeNo: number) => {
  const [lat, lng] = GEO[holeNo - 1].green;
  return { lat, lng };
};
