import somerby from './courses/somerby.json';
import { bearingDeg } from '../../supabase/functions/_shared/pins.ts';

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
  /** Green centre, [lat, lng]. */
  green: [number, number];
  /** Mock GPS feed: lie after N strokes. Past the end, the last lie repeats. */
  lies: Lie[];
}

/** Stored course (bundled or downloaded). Hole geometry comes from OpenStreetMap. */
export interface CourseData {
  id: string;
  name: string;
  location?: string;
  center: [number, number];
  attribution: string;
  holes: { number: number; par: number; parSource: string; yards: number; path: [number, number][]; green: [number, number] }[];
  downloadedAt?: number;
}

export interface CourseModel {
  id: string;
  name: string;
  location?: string;
  attribution: string;
  /** 18, or 9 for nine-hole courses. */
  holeCount: 9 | 18;
  /** Holes 1..holeCount are all mapped. */
  playable: boolean;
  pars: number[];
  holesFor: (tee: TeeId) => Hole[];
  data: CourseData;
}

const MAX_LAYUP = 250;

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

/** Build a playable model from stored course data. */
export function buildCourseModel(data: CourseData): CourseModel {
  const byNo = new Map(data.holes.map((h) => [h.number, h]));
  const has = (n: number) => Array.from({ length: n }, (_, i) => byNo.has(i + 1)).every(Boolean);
  const holeCount: 9 | 18 = has(18) ? 18 : 9;
  const playable = has(holeCount);
  const holes = Array.from({ length: holeCount }, (_, i) => byNo.get(i + 1)).filter((h): h is NonNullable<typeof h> => !!h);
  const cache = new Map<TeeId, Hole[]>();
  const holesFor = (tee: TeeId) => {
    const hit = cache.get(tee);
    if (hit) return hit;
    const f = TEES[tee].factor;
    const built = holes.map<Hole>((h) => {
      const yards = Math.round(h.yards * f);
      const [tLat, tLng] = h.path[0];
      return {
        number: h.number, par: h.par, yards, path: h.path, green: h.green,
        bearingDeg: bearingDeg({ lat: tLat, lng: tLng }, { lat: h.green[0], lng: h.green[1] }),
        lies: planLies(yards, h.number),
      };
    });
    cache.set(tee, built);
    return built;
  };
  return {
    id: data.id, name: data.name, location: data.location, attribution: `Course data ${data.attribution}`,
    holeCount, playable, pars: holes.map((h) => h.par), holesFor, data,
  };
}

/**
 * Bundled sample: Somerby Golf Club, Byron, MN — imported from OpenStreetMap
 * (scripts/import-course-osm.mjs; © OpenStreetMap contributors, ODbL). Pars tagged in OSM are
 * used as-is; the rest are estimated from length and corrected to the published par 72.
 */
export const SOMERBY_DATA: CourseData = {
  id: 'osm-way-157330030',
  name: somerby.name,
  location: 'Byron, MN',
  center: [44.047372, -92.631858],
  attribution: somerby.attribution,
  holes: somerby.holes as CourseData['holes'],
};
export const SOMERBY = buildCourseModel(SOMERBY_DATA);

// Somerby shortcuts (tests and the SQL seed parity check).
export const COURSE = { name: SOMERBY.name, location: SOMERBY.location, attribution: SOMERBY.attribution, holes: SOMERBY.holesFor('black') };
export const PAR_BY_HOLE = SOMERBY.pars;
export const holesFor = SOMERBY.holesFor;
export const greenCenter = (holeNo: number) => {
  const [lat, lng] = SOMERBY_DATA.holes[holeNo - 1].green;
  return { lat, lng };
};

export const lieFor = (hole: Hole, strokes: number) => hole.lies[Math.min(strokes, hole.lies.length - 1)];
