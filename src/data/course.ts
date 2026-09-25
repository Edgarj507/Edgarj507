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
  yards: number;
  bearingDeg: number;
  /** Mock GPS feed: lie after N strokes. Past the end, the last lie repeats. */
  lies: Lie[];
}

const MAX_LAYUP = 250;
const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
const YARDS = [412, 538, 176, 395, 428, 158, 521, 367, 441, 404, 192, 547, 386, 419, 149, 433, 512, 455];

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

/** Yardage relative to the tips; rating/slope are mock values in the usual range for each set. */
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
    return { number: i + 1, par, yards, bearingDeg: (i * 47 + 20) % 360, lies: planLies(yards, i + 1) };
  });
}

const cache = new Map<TeeId, Hole[]>();
export const holesFor = (tee: TeeId) => cache.get(tee) ?? (cache.set(tee, buildHoles(tee)), cache.get(tee)!);

export const COURSE = { name: 'Somerby Golf Club', holes: holesFor('black') };

export const lieFor = (hole: Hole, strokes: number) => hole.lies[Math.min(strokes, hole.lies.length - 1)];

/** Green centre coordinates (mock survey data; same formula seeds course_greens in SQL). */
export const greenCenter = (holeNo: number) => ({ lat: 52.7 + holeNo * 0.0035, lng: -0.85 + ((holeNo % 3) - 1) * 0.002 });
