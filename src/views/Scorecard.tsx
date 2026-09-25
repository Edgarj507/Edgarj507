import { ChevronLeft } from 'lucide-react';
import { COURSE, TEES, type Hole } from '../data/course';
import { holeRange, totals, type RoundState } from '../lib/round';
import type { ScoringSummary } from '../lib/scoring';

interface Props {
  round: RoundState;
  /** Holes for the round's tee (yardages differ per tee). */
  holes: Hole[];
  summary: ScoringSummary;
  onBack: () => void;
  onSelectHole: (index: number) => void;
  onNewRound: () => void;
}

const TONE = { good: 'text-emerald-400', bad: 'text-rose-300', neutral: 'text-white/70' } as const;

function scoreStyle(strokes: number, par: number) {
  if (!strokes) return 'text-white/25';
  const d = strokes - par;
  if (d <= -2) return 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50 rounded-full';
  if (d === -1) return 'bg-red-500/15 text-red-300 ring-1 ring-red-400/50 rounded-full';
  if (d === 0) return 'text-white';
  if (d === 1) return 'ring-1 ring-white/30 rounded-md text-white/90';
  return 'ring-2 ring-white/30 rounded-md text-white/90';
}

export function Scorecard({ round, holes, summary, onBack, onSelectHole, onNewRound }: Props) {
  const { start, end } = holeRange(round.config.length);
  const pars = holes.map((h) => h.par);
  const nines = [0, 9].filter((from) => from >= start && from + 8 <= end);
  const played = totals(round.shots, pars, start, end + 1);
  const cols = summary.column ? 'grid-cols-[2.5rem_1fr_2.5rem_3rem_2.75rem]' : 'grid-cols-[2.5rem_1fr_2.5rem_3rem]';
  // Indexed by hole number; summary.holes is indexed from the round's first hole.
  const fmtCell = (i: number) => summary.holes[i - start];
  /** Nine-hole footer for the format column: points sum, W–L record, or team strokes. */
  const columnTotal = (from: number) => {
    const cells = holes.slice(from, from + 9).map((_, k) => fmtCell(from + k)).filter((c) => c != null);
    if (!cells.length) return '';
    if (summary.column === 'Pts') return String(cells.reduce((a, c) => a + Number(c.cell), 0));
    if (summary.column === 'Res') return `${cells.filter((c) => c.cell === 'W').length}–${cells.filter((c) => c.cell === 'L').length}`;
    return String(cells.reduce((a, c) => a + Number(c.cell), 0));
  };

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-4 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="Back to HUD" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white">Scorecard</h2>
        </div>
        <div className="flex flex-col items-end rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
          <span className="font-mono text-base font-bold leading-tight text-emerald-400">{summary.headline}</span>
          <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-400/70">{summary.caption} · Thru {played.thru}</span>
        </div>
      </div>

      <p className="mb-3 text-[10px] uppercase tracking-widest text-white/40">
        {COURSE.name} · {TEES[round.config.tee].label} tees · {round.config.length === '18' ? '18 holes' : round.config.length === 'front' ? 'Front 9' : 'Back 9'}
      </p>

      <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-24">
        {nines.map((from) => {
          const t = totals(round.shots, pars, from, from + 9);
          const par = pars.slice(from, from + 9).reduce((a, b) => a + b, 0);
          const yds = holes.slice(from, from + 9).reduce((a, h) => a + h.yards, 0);
          return (
            <div key={from} className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md">
              <div className={`grid ${cols} border-b border-white/10 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-white/40`}>
                <span>Hole</span><span>Yds</span><span className="text-center">Par</span><span className="text-center">Score</span>
                {summary.column && <span className="text-center">{summary.column}</span>}
              </div>
              {holes.slice(from, from + 9).map((h, k) => {
                const i = from + k;
                const s = round.shots[i].length;
                const cell = fmtCell(i);
                return (
                  <button
                    key={h.number}
                    onClick={() => onSelectHole(i)}
                    className={`grid w-full ${cols} items-center px-3 py-2 text-left transition-colors ${round.current === i ? 'bg-emerald-500/10' : 'hover:bg-white/5'}`}
                  >
                    <span className={`font-mono text-xs font-bold ${round.current === i ? 'text-emerald-400' : 'text-white/80'}`}>{h.number}</span>
                    <span className="font-mono text-[11px] text-white/40">{h.yards}</span>
                    <span className="text-center font-mono text-xs text-white/60">{h.par}</span>
                    <span className="flex justify-center">
                      <span className={`grid h-6 w-6 place-items-center font-mono text-xs font-bold ${scoreStyle(s, h.par)}`}>{s || '–'}</span>
                    </span>
                    {summary.column && (
                      <span className={`text-center font-mono text-xs font-bold ${cell ? TONE[cell.tone] : 'text-white/20'}`}>{cell?.cell ?? '–'}</span>
                    )}
                  </button>
                );
              })}
              <div className={`grid ${cols} border-t border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest`}>
                <span className="text-white/60">{from ? 'In' : 'Out'}</span>
                <span className="font-mono text-white/40">{yds.toLocaleString()}</span>
                <span className="text-center font-mono text-white/60">{par}</span>
                <span className="text-center font-mono text-white">{t.strokes || '–'}</span>
                {summary.column && <span className="text-center font-mono text-white/60">{columnTotal(from)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-5 bottom-6 z-20">
        <div className="rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-xl">
          <button onClick={onNewRound} className="w-full rounded-xl border border-white/5 bg-white/10 py-3.5 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 active:scale-[0.98]">
            End Round & Return to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
