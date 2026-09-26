import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Share2, Sparkles } from 'lucide-react';
import { insights, strokesGained, SG_CATEGORIES, type HoleInput, type SgCategory } from '../lib/strokesGained';
import { drawCard, shareCard, type CardData } from '../lib/shareCard';
import type { MulliganLedger } from '../lib/round';
import { usePrefs } from '../i18n/prefs';

interface Props {
  courseName: string;
  holes: HoleInput[];
  scoreLabel: string;
  ledger?: MulliganLedger;
  players: { id: string; name: string }[];
  handle: string;
  onScorecard: () => void;
  onDone: () => void;
}

/** Signed one-decimal SG; |n| < 0.05 reads as a neutral 0.0 (never "−0.0"). */
const f1 = (n: number) => (Math.abs(n) < 0.05 ? '0.0' : `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`);

/** Post-round, tour-style Strokes Gained breakdown with a shareable card. */
export function RoundRecap({ courseName, holes, scoreLabel, ledger, players, handle, onScorecard, onDone }: Props) {
  const { t } = usePrefs();
  const sg = useMemo(() => strokesGained(holes), [holes]);
  const labels = useMemo<Record<SgCategory, string>>(() => ({ offTee: t('recap.offTee'), approach: t('recap.approach'), aroundGreen: t('recap.aroundGreen'), putting: t('recap.putting') }), [t]);
  const tips = useMemo(() => insights(sg, labels), [sg, labels]);
  const card: CardData = { course: courseName, date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), score: scoreLabel, sg, labels, insights: tips, handle };
  const preview = useRef<HTMLCanvasElement>(null);
  const [shareState, setShareState] = useState<string | null>(null);

  useEffect(() => {
    const ctx = preview.current?.getContext('2d');
    if (ctx && sg.shots) drawCard(ctx, card);
  });

  // Scramble: whose drives the team used (many events require a minimum per player).
  const drives = useMemo(() => {
    const c: Record<string, number> = {};
    for (const h of holes) if (h.shots[0]?.by) c[h.shots[0].by] = (c[h.shots[0].by] ?? 0) + 1;
    return c;
  }, [holes]);
  const maxAbs = Math.max(1.5, ...SG_CATEGORIES.map((c) => Math.abs(sg.byCategory[c])));

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-4 flex items-center gap-3">
        <button onClick={onScorecard} aria-label="Scorecard" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md active:scale-95"><ChevronLeft size={16} /></button>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white">{t('recap.title')}</h2>
      </div>

      <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-24">
        {!sg.shots ? (
          <p className="rounded-xl border border-white/10 bg-black/40 p-4 text-[12px] text-white/60">{t('recap.notEnough')}</p>
        ) : (
          <>
            <div className="mb-4 rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">{t('recap.sg')}</div>
              <div className={`font-mono text-5xl font-semibold ${sg.total >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>{f1(sg.total)}</div>
              <div className="mb-3 text-[11px] text-white/45">{courseName} · {scoreLabel} · {sg.shots} shots</div>
              <div className="flex flex-col gap-2.5">
                {SG_CATEGORIES.map((c) => {
                  const v = sg.byCategory[c];
                  const w = `${(Math.abs(v) / maxAbs) * 50}%`;
                  return (
                    <div key={c} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2">
                      <span className="text-[11px] text-white/75">{labels[c]}</span>
                      <span className="relative h-2 rounded-full bg-white/10">
                        <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
                        <span className={`absolute inset-y-0 rounded-full ${v >= 0 ? 'left-1/2 bg-emerald-500' : 'right-1/2 bg-rose-400'}`} style={{ width: w }} />
                      </span>
                      <span className={`text-right font-mono text-[12px] ${v >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{f1(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {tips.length > 0 && (
              <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300"><Sparkles size={12} /> Caddie notes</div>
                <ul className="flex flex-col gap-1 text-[12px] leading-snug text-white/80">{tips.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}

            {(ledger || Object.keys(drives).length > 0) && (
              <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-[11px] text-white/75">
                {Object.keys(drives).length > 0 && (
                  <div className="mb-1">{t('recap.drives')}: {Object.entries(drives).map(([id, n]) => `${players.find((p) => p.id === id)?.name ?? id} ${n}`).join(' · ')}</div>
                )}
                {ledger && <div>{t('mull.title')}: {ledger.used.length} used · ${Object.values(ledger.packs).reduce((a, n) => a + n, 0) * ledger.price} {t('mull.raised')}</div>}
              </div>
            )}

            <canvas ref={preview} width={1080} height={1350} className="mx-auto block w-3/4 rounded-2xl border border-white/10 shadow-2xl" aria-label="Share card preview" />
          </>
        )}
      </div>

      <div className="absolute inset-x-5 bottom-6 z-20">
        <div className="flex gap-2 rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-xl">
          <button onClick={onDone} className="rounded-xl border border-white/5 bg-white/10 px-4 text-[10px] font-bold uppercase tracking-widest text-white">{t('recap.done')}</button>
          <button
            disabled={!sg.shots}
            onClick={async () => setShareState(await shareCard(card))}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-xs font-black uppercase tracking-widest text-black disabled:opacity-40"
          >
            <Share2 size={14} /> {shareState === 'downloaded' ? 'Saved ✓' : t('recap.share')}
          </button>
        </div>
      </div>
    </div>
  );
}
