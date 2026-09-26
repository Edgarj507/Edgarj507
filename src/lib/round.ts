import type { TeeId } from '../data/course';

export type Outcome = 'center' | 'left' | 'right' | 'long' | 'short';
export const OUTCOMES: Outcome[] = ['center', 'left', 'right', 'long', 'short'];

export interface Shot {
  club: string;
  line: number;
  playsLike: number;
  t: number;
  /** Where the shot finished relative to the target (dispersion stats). */
  outcome?: Outcome;
  /** Scramble: whose ball the team played ('me' or a buddy id). */
  by?: string;
}

/** Charity / tournament mulligan packs for a scramble. */
export interface MulliganLedger {
  /** Price per mulligan, whole currency units. */
  price: number;
  /** Mulligans bought per player id ('me' = this golfer). */
  packs: Record<string, number>;
  used: { player: string; hole: number; t: number }[];
}

export const mulligansLeft = (l: MulliganLedger, player: string) =>
  (l.packs[player] ?? 0) - l.used.filter((u) => u.player === player).length;
export const ledgerTotal = (l: MulliganLedger) => Object.values(l.packs).reduce((a, n) => a + n, 0) * l.price;

export const FORMATS = ['Stroke Play', 'Match Play', 'Stableford', 'Scramble', 'Best Ball', 'Alt Shot'] as const;
export type Format = (typeof FORMATS)[number];

export type RoundLength = '18' | 'front' | 'back';

export interface RoundConfig {
  /** Course id from the course library; absent on older saved rounds (→ bundled Somerby). */
  courseId?: string;
  tee: TeeId;
  format: Format;
  length: RoundLength;
}

export interface RoundState {
  v: 3;
  config: RoundConfig;
  current: number;
  /** shots[holeIndex] for all 18 holes; holes outside the round's range stay empty. */
  shots: Shot[][];
  /** Server round id once the round is synced to the cloud (signed-in users only). */
  remoteId?: string;
  ledger?: MulliganLedger;
}

export type RoundAction =
  | { type: 'log'; shot: Shot }
  | { type: 'undo' }
  | { type: 'goto'; hole: number }
  | { type: 'next' }
  | { type: 'start'; config: RoundConfig; ledger?: MulliganLedger }
  | { type: 'mulligan'; player: string }
  | { type: 'unmulligan'; index: number }
  /** Charity mulligans bought mid-round (Event Store); opens a ledger if the round has none. */
  | { type: 'buyMulligans'; player: string; qty: number; price: number }
  | { type: 'hydrate'; state: RoundState }
  | { type: 'attachRemote'; id: string };

export const HOLES = 18;
export const DEFAULT_CONFIG: RoundConfig = { tee: 'blue', format: 'Stroke Play', length: '18' };

/** Inclusive hole-index range played for a round length. */
export function holeRange(length: RoundLength): { start: number; end: number } {
  if (length === 'front') return { start: 0, end: 8 };
  if (length === 'back') return { start: 9, end: 17 };
  return { start: 0, end: 17 };
}

export const newRound = (config: RoundConfig = DEFAULT_CONFIG): RoundState => ({
  v: 3,
  config,
  current: holeRange(config.length).start,
  shots: Array.from({ length: HOLES }, () => []),
});

export const hasStrokes = (s: RoundState) => s.shots.some((h) => h.length > 0);
export const sameConfig = (a: RoundConfig, b: RoundConfig) =>
  (a.courseId ?? '') === (b.courseId ?? '') && a.tee === b.tee && a.format === b.format && a.length === b.length;

export function isRoundState(x: unknown): x is RoundState {
  const r = x as RoundState;
  if (!r || r.v !== 3 || !r.config || !(FORMATS as readonly string[]).includes(r.config.format)) return false;
  if (r.config.courseId !== undefined && typeof r.config.courseId !== 'string') return false;
  if (!['black', 'blue', 'white', 'red'].includes(r.config.tee) || !['18', 'front', 'back'].includes(r.config.length)) return false;
  const { start, end } = holeRange(r.config.length);
  if (r.remoteId !== undefined && typeof r.remoteId !== 'string') return false;
  if (r.ledger !== undefined && !(r.ledger && Number.isFinite(r.ledger.price) && typeof r.ledger.packs === 'object' && Array.isArray(r.ledger.used))) return false;
  return (
    Number.isInteger(r.current) && r.current >= start && r.current <= end &&
    Array.isArray(r.shots) && r.shots.length === HOLES && r.shots.every(Array.isArray)
  );
}

const withHole = (s: RoundState, fn: (shots: Shot[]) => Shot[]): RoundState => ({
  ...s,
  shots: s.shots.map((h, i) => (i === s.current ? fn(h) : h)),
});

export function roundReducer(s: RoundState, a: RoundAction): RoundState {
  const { start, end } = holeRange(s.config.length);
  switch (a.type) {
    case 'log':
      return withHole(s, (h) => [...h, a.shot]);
    case 'undo':
      return s.shots[s.current].length ? withHole(s, (h) => h.slice(0, -1)) : s;
    case 'goto':
      return a.hole >= start && a.hole <= end ? { ...s, current: a.hole } : s;
    case 'next':
      return { ...s, current: Math.min(s.current + 1, end) };
    case 'start':
      return { ...newRound(a.config), ...(a.ledger ? { ledger: a.ledger } : {}) };
    case 'mulligan':
      if (!s.ledger || mulligansLeft(s.ledger, a.player) <= 0) return s;
      return { ...s, ledger: { ...s.ledger, used: [...s.ledger.used, { player: a.player, hole: s.current + 1, t: Date.now() }] } };
    case 'unmulligan':
      return s.ledger ? { ...s, ledger: { ...s.ledger, used: s.ledger.used.filter((_, i) => i !== a.index) } } : s;
    case 'buyMulligans': {
      if (!Number.isInteger(a.qty) || a.qty < 1) return s;
      const l = s.ledger ?? { price: a.price, packs: {}, used: [] };
      return { ...s, ledger: { ...l, packs: { ...l.packs, [a.player]: (l.packs[a.player] ?? 0) + a.qty } } };
    }
    case 'hydrate':
      return a.state;
    case 'attachRemote':
      return { ...s, remoteId: a.id };
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
