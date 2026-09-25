import { ChevronLeft } from 'lucide-react';
import { COURSE } from '../data/course';
import { fmtToPar, totals, type RoundState } from '../lib/round';

interface Props {
  round: RoundState;
  onBack: () => void;
  onSelectHole: (index: number) => void;
  onNewRound: () => void;
}

const pars = COURSE.holes.map((h) => h.par);

function scoreStyle(strokes: number, par: number) {
  if (!strokes) return 'text-white/25';
  const d = strokes - par;
  if (d <= -2) return 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50 rounded-full';
  if (d === -1) return 'bg-red-500/15 text-red-300 ring-1 ring-red-400/50 rounded-full';
  if (d === 0) return 'text-white';
  if (d === 1) return 'ring-1 ring-white/30 rounded-md text-white/90';
  return 'ring-2 ring-white/30 rounded-md text-white/90';
}

export function Scorecard({ round, onBack, onSelectHole, onNewRound }: Props) {
  const all = totals(round.shots, pars);
  const nine = (from: number) => ({ ...totals(round.shots, pars, from, from + 9), par: pars.slice(from, from + 9).reduce((a, b) => a + b, 0) });

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-4 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="Back to HUD" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white">Scorecard</h2>
        </div>
        <div className="flex items-baseline gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
          <span className="font-mono text-base font-bold text-emerald-400">{all.thru ? fmtToPar(all.toPar) : 'E'}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/70">Thru {all.thru}</span>
        </div>
      </div>

      <p className="mb-3 text-[10px] uppercase tracking-widest text-white/40">{COURSE.name} · Tap a hole to jump to it</p>

      <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-24">
        {[0, 9].map((from) => {
          const t = nine(from);
          return (
            <div key={from} className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md">
              <div className="grid grid-cols-[3rem_1fr_3rem_3rem] border-b border-white/10 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-white/40">
                <span>Hole</span><span>Yds</span><span className="text-center">Par</span><span className="text-center">Score</span>
              </div>
              {COURSE.holes.slice(from, from + 9).map((h, k) => {
                const i = from + k;
                const s = round.shots[i].length;
                return (
                  <button
                    key={h.number}
                    onClick={() => onSelectHole(i)}
                    className={`grid w-full grid-cols-[3rem_1fr_3rem_3rem] items-center px-3 py-2 text-left transition-colors ${round.current === i ? 'bg-emerald-500/10' : 'hover:bg-white/5'}`}
                  >
                    <span className={`font-mono text-xs font-bold ${round.current === i ? 'text-emerald-400' : 'text-white/80'}`}>{h.number}</span>
                    <span className="font-mono text-[11px] text-white/40">{h.yards}</span>
                    <span className="text-center font-mono text-xs text-white/60">{h.par}</span>
                    <span className="flex justify-center">
                      <span className={`grid h-6 w-6 place-items-center font-mono text-xs font-bold ${scoreStyle(s, h.par)}`}>{s || '–'}</span>
                    </span>
                  </button>
                );
              })}
              <div className="grid grid-cols-[3rem_1fr_3rem_3rem] border-t border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest">
                <span className="text-white/60">{from ? 'In' : 'Out'}</span>
                <span className="font-mono text-white/40">{t.thru ? fmtToPar(t.toPar) : ''}</span>
                <span className="text-center font-mono text-white/60">{t.par}</span>
                <span className="text-center font-mono text-white">{t.strokes || '–'}</span>
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
