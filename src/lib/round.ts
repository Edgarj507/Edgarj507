export interface Shot {
  club: string;
  line: number;
  playsLike: number;
  t: number;
}

export interface RoundState {
  v: 2;
  current: number;
  /** shots[holeIndex] — stroke count is its length. */
  shots: Shot[][];
}

export type RoundAction =
  | { type: 'log'; shot: Shot }
  | { type: 'undo' }
  | { type: 'goto'; hole: number }
  | { type: 'next' }
  | { type: 'reset' }
  | { type: 'hydrate'; state: RoundState };

export const HOLES = 18;

export const newRound = (): RoundState => ({ v: 2, current: 0, shots: Array.from({ length: HOLES }, () => []) });

export function isRoundState(x: unknown): x is RoundState {
  const r = x as RoundState;
  return (
    !!r && r.v === 2 && Number.isInteger(r.current) && r.current >= 0 && r.current < HOLES &&
    Array.isArray(r.shots) && r.shots.length === HOLES && r.shots.every(Array.isArray)
  );
}

const withHole = (s: RoundState, fn: (shots: Shot[]) => Shot[]): RoundState => ({
  ...s,
  shots: s.shots.map((h, i) => (i === s.current ? fn(h) : h)),
});

export function roundReducer(s: RoundState, a: RoundAction): RoundState {
  switch (a.type) {
    case 'log':
      return withHole(s, (h) => [...h, a.shot]);
    case 'undo':
      return s.shots[s.current].length ? withHole(s, (h) => h.slice(0, -1)) : s;
    case 'goto':
      return a.hole >= 0 && a.hole < HOLES ? { ...s, current: a.hole } : s;
    case 'next':
      return { ...s, current: Math.min(s.current + 1, HOLES - 1) };
    case 'reset':
      return newRound();
    case 'hydrate':
      return a.state;
  }
}

export interface Totals {
  strokes: number;
  /** Par of holes that have at least one stroke. */
  parPlayed: number;
  toPar: number;
  thru: number;
}

export function totals(shots: Shot[][], pars: number[], from = 0, to = HOLES): Totals {
  let strokes = 0, parPlayed = 0, thru = 0;
  for (let i = from; i < to; i++) {
    if (!shots[i]?.length) continue;
    strokes += shots[i].length;
    parPlayed += pars[i];
    thru++;
  }
  return { strokes, parPlayed, toPar: strokes - parPlayed, thru };
}

export const fmtToPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);
