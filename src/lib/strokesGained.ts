/**
 * Strokes Gained vs. a PGA Tour baseline (expected strokes to hole out, after Broadie,
 * "Every Shot Counts"). SG for a shot = E(start) − E(end) − 1; a holed shot ends at 0.
 * Lies: tee shots on par 4/5 use the tee table, putts the green table (feet), everything else
 * the fairway table. Values are interpolated between table rows.
 */
import type { Shot } from './round';

type Table = [number, number][];
const TEE: Table = [[100, 2.92], [140, 2.97], [180, 3.05], [220, 3.17], [260, 3.45], [300, 3.71], [340, 3.86], [380, 3.96], [420, 4.02], [460, 4.17], [500, 4.41], [540, 4.65], [580, 4.79], [620, 4.85]];
const FAIRWAY: Table = [[5, 2.1], [10, 2.18], [20, 2.4], [40, 2.6], [60, 2.7], [80, 2.75], [100, 2.8], [120, 2.85], [140, 2.91], [160, 2.98], [180, 3.08], [200, 3.19], [220, 3.32], [240, 3.45], [260, 3.58], [300, 3.78], [400, 4.1], [500, 4.5]];
const GREEN_FT: Table = [[1, 1.0], [3, 1.04], [4, 1.13], [5, 1.23], [6, 1.34], [8, 1.5], [10, 1.61], [15, 1.78], [20, 1.87], [30, 1.98], [40, 2.06], [50, 2.14], [60, 2.21], [90, 2.4]];

function interp(t: Table, x: number) {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1], [x1, y1] = t[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
}

export type Lie = 'tee' | 'fairway' | 'green';
export const expectedStrokes = (lie: Lie, yards: number) =>
  lie === 'green' ? interp(GREEN_FT, yards * 3) : lie === 'tee' ? interp(TEE, yards) : interp(FAIRWAY, yards);

export type SgCategory = 'offTee' | 'approach' | 'aroundGreen' | 'putting';
export const SG_CATEGORIES: SgCategory[] = ['offTee', 'approach', 'aroundGreen', 'putting'];

export interface HoleInput {
  number: number;
  par: number;
  /** Distance to the flag (yards) at the start of each stroke. */
  startYds: number[];
  shots: Shot[];
}

export interface SgResult {
  total: number;
  byCategory: Record<SgCategory, number>;
  byHole: { number: number; sg: number; strokes: number; par: number }[];
  shots: number;
}

export function strokesGained(holes: HoleInput[]): SgResult {
  const by: Record<SgCategory, number> = { offTee: 0, approach: 0, aroundGreen: 0, putting: 0 };
  const byHole: SgResult['byHole'] = [];
  let shots = 0;
  for (const h of holes) {
    if (!h.shots.length) continue;
    let holeSg = 0;
    h.shots.forEach((s, i) => {
      const start = h.startYds[i] ?? h.startYds[h.startYds.length - 1];
      const isPutt = s.club === 'Putter';
      const lie: Lie = isPutt ? 'green' : i === 0 && h.par > 3 ? 'tee' : 'fairway';
      const last = i === h.shots.length - 1;
      const endYds = last ? 0 : h.startYds[i + 1] ?? 0;
      const nextIsPutt = !last && h.shots[i + 1].club === 'Putter';
      const endLie: Lie = nextIsPutt ? 'green' : 'fairway';
      const sg = expectedStrokes(lie, start) - (last ? 0 : expectedStrokes(endLie, endYds)) - 1;
      const cat: SgCategory = isPutt ? 'putting' : lie === 'tee' ? 'offTee' : start <= 30 ? 'aroundGreen' : 'approach';
      by[cat] += sg;
      holeSg += sg;
      shots++;
    });
    byHole.push({ number: h.number, sg: holeSg, strokes: h.shots.length, par: h.par });
  }
  const total = SG_CATEGORIES.reduce((a, c) => a + by[c], 0);
  return { total, byCategory: by, byHole, shots };
}

/** Plain-language takeaways from the numbers (deterministic — no model call). */
export function insights(r: SgResult, labels: Record<SgCategory, string>): string[] {
  if (!r.shots) return [];
  const sorted = [...SG_CATEGORIES].sort((a, b) => r.byCategory[b] - r.byCategory[a]);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const f = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
  const out = [`Strongest: ${labels[best]} (${f(r.byCategory[best])} strokes).`];
  if (r.byCategory[worst] < -0.3) out.push(`Biggest leak: ${labels[worst]} (${f(r.byCategory[worst])}). That's where practice pays.`);
  const top = [...r.byHole].sort((a, b) => b.sg - a.sg)[0];
  if (top && top.sg > 0.3) out.push(`Best hole: #${top.number} (${f(top.sg)} vs Tour).`);
  return out;
}
