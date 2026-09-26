import { useState } from 'react';
import { Activity, Check, Crosshair, MapPinned, X } from 'lucide-react';
import { usePrefs } from '../i18n/prefs';
import type { Lie } from '../data/course';

interface Props {
  lie: Lie;
  holeNumber: number;
  onClose: () => void;
  /** Share this cup position with the community pin network. Resolves to an error code or null. */
  onConfirmCup?: () => Promise<string | null>;
}

/** Simulated LiDAR green read. Replace readings with the ARKit/LiDAR mesh pipeline. */
export function PuttView({ lie, holeNumber, onClose, onConfirmCup }: Props) {
  const { t, units } = usePrefs();
  const [shared, setShared] = useState<'idle' | 'busy' | 'ok' | string>('idle');
  const metric = units === 'meters';
  const len = (ft: number) => (metric ? (ft * 0.3048).toFixed(1) : ft.toFixed(0));
  const lenU = metric ? 'm' : 'ft';
  const brk = (inches: number) => (metric ? `${Math.round(inches * 2.54)}cm` : `${inches}"`);
  const onGreen = lie.pin <= 20;
  const feet = onGreen ? Math.max(3, lie.pin * 3) : 30;
  const seed = holeNumber * 13;
  const slope = ((seed % 30) / 10 + 0.5).toFixed(1);
  const breakIn = Math.max(1, Math.round((feet * Number(slope)) / 8));
  const dir = seed % 2 ? 'Left' : 'Right';
  const elevIn = (seed % 7) - 3;
  // Curve bows opposite to the aim side so the ball breaks back toward the cup.
  const bow = dir === 'Right' ? 290 : 110;

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(6,78,59,0.45),_#0a0a0a_60%,_#000)]">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(rgba(16,185,129,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.35) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
            transform: 'perspective(500px) rotateX(60deg) scale(2) translateY(-60px)',
          }}
        />
        <div className="absolute inset-0 animate-pulse bg-emerald-500/5" />
      </div>

      <div className="relative z-10 flex items-center justify-between pt-safe pl-safe pr-safe">
        <span className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-black/60 px-3 py-1.5 font-mono text-[10px] text-emerald-400 backdrop-blur-md">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
          {t('putt.reader').toUpperCase()}
        </span>
        <button onClick={onClose} aria-label="Close putt view" className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/50 backdrop-blur-md active:scale-95">
          <X size={18} />
        </button>
      </div>

      <div className="pointer-events-none relative z-10 flex-1">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="puttLine" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <path d={`M200 500 Q ${bow} 300 200 110`} fill="none" stroke="url(#puttLine)" strokeWidth="4" strokeDasharray="8 8" className="animate-[dash_1.5s_linear_infinite]" />
          <circle cx="200" cy="110" r="16" fill="#000" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
          <circle cx="200" cy="110" r="6" fill="#fff" className="animate-pulse" />
          <text x="226" y="115" fill="#fff" fontSize="13" fontWeight="700" opacity="0.8">CUP</text>
        </svg>
        <div className="absolute bottom-[12%] left-1/2 grid h-20 w-20 -translate-x-1/2 place-items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 backdrop-blur-sm">
          <Crosshair size={40} className="absolute text-emerald-400/50" />
          <span className="h-3 w-3 rounded-full bg-white shadow-[0_0_15px_white]" />
        </div>
      </div>

      <div className="relative z-10 pb-safe pl-safe pr-safe">
        <div className="mx-auto max-w-sm rounded-3xl border border-white/10 bg-black/70 p-4 backdrop-blur-2xl">
          {onGreen ? (
            <>
              <div className="mb-3 text-center">
                <div className="mb-1 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/50">
                  <Activity size={11} className="text-emerald-400" /> {t('putt.break')}
                </div>
                <div className="text-2xl font-bold tracking-tight">{t('putt.aim')} {brk(breakIn)} {t(dir === 'Left' ? 'hud.left' : 'hud.right')}</div>
                <div className="text-xs text-emerald-400">{t('putt.pace')} {len(feet * 1.15)}{lenU}</div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-3 text-center">
                <Reading label={t('putt.distance')} value={len(feet)} unit={lenU} />
                <Reading label={t('putt.slope')} value={slope} unit="%" />
                <Reading label={t('putt.elevation')} value={`${elevIn > 0 ? '+' : ''}${metric ? Math.round(elevIn * 2.54) : elevIn}`} unit={metric ? 'cm' : 'in'} tone={elevIn < 0 ? 'text-sky-300' : elevIn > 0 ? 'text-rose-300' : ''} />
              </div>
              {onConfirmCup && (
                <button
                  disabled={shared === 'busy' || shared === 'ok'}
                  onClick={async () => { setShared('busy'); setShared((await onConfirmCup()) ?? 'ok'); }}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-black uppercase tracking-widest text-emerald-400 transition active:scale-[0.98] disabled:opacity-70"
                >
                  {shared === 'ok' ? <><Check size={13} /> {t('putt.cupShared')}</> : <><MapPinned size={13} /> {t('putt.confirmCup')}</>}
                </button>
              )}
              {shared !== 'idle' && shared !== 'busy' && shared !== 'ok' && (
                <p role="alert" className="mt-1 text-center text-[10px] text-rose-300">{shared.replace(/_/g, ' ')}</p>
              )}
            </>
          ) : (
            <div className="py-2 text-center">
              <div className="text-sm font-bold">{t('putt.notOnGreen')}</div>
              <div className="mt-1 text-[11px] text-white/50">{metric ? `${Math.round(lie.pin * 0.9144)}m` : `${lie.pin}y`} · {t('putt.readsWithin')}</div>
            </div>
          )}
        </div>
      </div>
      <style>{'@keyframes dash { to { stroke-dashoffset: -32; } }'}</style>
    </div>
  );
}

function Reading({ label, value, unit, tone = '' }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-mono text-lg ${tone}`}>
        {value}<span className="ml-0.5 text-[10px] opacity-50">{unit}</span>
      </div>
    </div>
  );
}
