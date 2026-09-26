import type { Format } from './round';

/**
 * Per-hole gross scores; null = hole not played.
 * `partner` is the opponent in Match Play and the teammate in Best Ball.
 */
export interface ScoringInput {
  format: Format;
  pars: number[];
  mine: (number | null)[];
  partner: (number | null)[];
  /** Name shown for the partner/opponent; absent when playing solo. */
  partnerName?: string;
}

export interface HoleResult {
  /** Short cell text for the scorecard's format column. */
  cell: string;
  tone: 'good' | 'bad' | 'neutral';
}

export interface ScoringSummary {
  /** Headline, e.g. "+2", "18 pts", "2 UP". */
  headline: string;
  /** Caption, e.g. "vs Jordan", "Team". */
  caption: string;
  /** Scorecard column header, or null when the format needs no extra column. */
  column: string | null;
  holes: (HoleResult | null)[];
}

export const stablefordPoints = (strokes: number, par: number) => Math.max(0, 2 + par - strokes);

const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

export function summarize({ format, pars, mine, partner, partnerName }: ScoringInput): ScoringSummary {
  const played = mine.map((m, i) => (m == null ? null : { m, p: partner[i], par: pars[i] }));

  switch (format) {
    case 'Stableford': {
      let pts = 0;
      const holes = played.map((h) => {
        if (!h) return null;
        const p = stablefordPoints(h.m, h.par);
        pts += p;
        return { cell: String(p), tone: p >= 3 ? 'good' : p === 0 ? 'bad' : 'neutral' } as HoleResult;
      });
      return { headline: `${pts} pts`, caption: 'Stableford', column: 'Pts', holes };
    }

    case 'Match Play': {
      // Solo match play is against par (bogey-free = halve).
      const opp = partnerName ?? 'Par';
      let diff = 0;
      let left = played.filter(Boolean).length;
      const holes = played.map((h) => {
        if (!h) return null;
        const theirs = partnerName ? h.p ?? h.par : h.par;
        const r = h.m < theirs ? 1 : h.m > theirs ? -1 : 0;
        diff += r;
        return { cell: r > 0 ? 'W' : r < 0 ? 'L' : 'H', tone: r > 0 ? 'good' : r < 0 ? 'bad' : 'neutral' } as HoleResult;
      });
      left = mine.length - left;
      const status = diff === 0 ? 'AS' : `${Math.abs(diff)} ${diff > 0 ? 'UP' : 'DN'}`;
      const closed = Math.abs(diff) > left && left > 0;
      return {
        headline: closed ? `${Math.abs(diff)}&${left}` : status,
        caption: `${closed ? (diff > 0 ? 'Won' : 'Lost') + ' · ' : ''}vs ${opp}`,
        column: 'Res',
        holes,
      };
    }

    case 'Best Ball': {
      let total = 0;
      const holes = played.map((h) => {
        if (!h) return null;
        const team = h.p == null ? h.m : Math.min(h.m, h.p);
        total += team - h.par;
        return { cell: String(team), tone: team < h.par ? 'good' : team > h.par ? 'bad' : 'neutral' } as HoleResult;
      });
      return { headline: toPar(total), caption: partnerName ? `Team w/ ${partnerName}` : 'Team', column: 'Team', holes };
    }

    case 'Scramble':
    case 'Alt Shot':
    case 'Stroke Play': {
      const total = played.reduce((a, h) => a + (h ? h.m - h.par : 0), 0);
      const caption = format === 'Stroke Play' ? 'Stroke Play' : `${format} · Team ball`;
      return { headline: toPar(total), caption, column: null, holes: played.map(() => null) };
    }
  }
}

/** Deterministic mock gross score for a playing partner (replace with live sync). */
export function mockPartnerScore(partnerId: string, hole: number, par: number) {
  let h = 0;
  for (const ch of partnerId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = (h + hole * 2654435761) >>> 0;
  const offsets = [-1, 0, 0, 0, 1, 1, 0, 2];
  return par + offsets[r % offsets.length];
}
