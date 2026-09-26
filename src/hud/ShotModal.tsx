import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, X } from 'lucide-react';
import type { Outcome } from '../lib/round';
import { tendency } from '../lib/hooks';
import { usePrefs } from '../i18n/prefs';

interface Props {
  club: string;
  target: string;
  /** Lifetime outcome counts for this club. */
  stats?: Partial<Record<Outcome, number>>;
  /** Scramble: choose whose ball the team played. */
  players?: { id: string; name: string }[];
  by: string;
  onBy: (id: string) => void;
  onPick: (o: Outcome | undefined) => void;
  onClose: () => void;
}

const PAD: { o: Outcome; icon: typeof ArrowUp; area: string }[] = [
  { o: 'long', icon: ArrowUp, area: 'col-start-2 row-start-1' },
  { o: 'left', icon: ArrowLeft, area: 'col-start-1 row-start-2' },
  { o: 'center', icon: Crosshair, area: 'col-start-2 row-start-2' },
  { o: 'right', icon: ArrowRight, area: 'col-start-3 row-start-2' },
  { o: 'short', icon: ArrowDown, area: 'col-start-2 row-start-3' },
];

/** Tactical outcome picker shown on Log Shot — feeds club dispersion & gapping stats. */
export function ShotModal({ club, target, stats, players, by, onBy, onPick, onClose }: Props) {
  const { t } = usePrefs();
  const tend = tendency(stats);
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/55 p-4 pb-safe backdrop-blur-[2px]" role="dialog" aria-label={t('shot.title')}>
      <div className="mx-auto w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.08] p-4 shadow-2xl ring-1 ring-inset ring-white/5 backdrop-blur-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">{t('shot.title')}</div>
            <div className="text-lg font-black tracking-tight text-white">{club} <span className="font-mono text-sm font-normal text-white/50">→ {target}</span></div>
          </div>
          <button onClick={onClose} aria-label="Cancel" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/70"><X size={14} /></button>
        </div>

        {players && players.length > 1 && (
          <div className="mb-3">
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/40">{t('shot.whose')}</div>
            <div role="radiogroup" className="flex flex-wrap gap-1.5">
              {players.map((p) => (
                <button key={p.id} role="radio" aria-checked={by === p.id} onClick={() => onBy(p.id)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${by === p.id ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-black/30 text-white/60'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto grid w-56 grid-cols-3 grid-rows-3 gap-2">
          {PAD.map(({ o, icon: Icon, area }) => (
            <button
              key={o}
              onClick={() => onPick(o)}
              aria-label={t(`shot.${o}`)}
              className={`${area} flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border text-[9px] font-bold uppercase tracking-wider transition active:scale-95 ${
                o === 'center' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]' : 'border-white/10 bg-black/40 text-white/70'
              }`}
            >
              <Icon size={o === 'center' ? 22 : 18} />
              {t(`shot.${o}`)}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-[10px] text-white/45">
          <span>{tend.total ? `${club}: ${tend.centerPct}% ${t('shot.onTarget')}${tend.miss ? ` · ${t('shot.tends')} ${t(`shot.${tend.miss}`).toLowerCase()}` : ''} (${tend.total})` : t('shot.firstStat')}</span>
          <button onClick={() => onPick(undefined)} className="font-semibold text-white/60 underline-offset-2 hover:underline">{t('shot.skip')}</button>
        </div>
      </div>
    </div>
  );
}
