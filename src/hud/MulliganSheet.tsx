import { HandCoins, Minus, X } from 'lucide-react';
import { ledgerTotal, mulligansLeft, type MulliganLedger } from '../lib/round';
import { usePrefs } from '../i18n/prefs';

export function MulliganSheet({ ledger, players, onUse, onUndo, onClose }: {
  ledger: MulliganLedger;
  players: { id: string; name: string }[];
  onUse: (player: string) => void;
  onUndo: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = usePrefs();
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/55 p-4 pb-safe backdrop-blur-[2px]" role="dialog" aria-label={t('mull.title')}>
      <div className="mx-auto w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.08] p-4 shadow-2xl backdrop-blur-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HandCoins size={16} className="text-amber-300" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">{t('mull.title')}</span>
          </div>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-200">${ledgerTotal(ledger)} {t('mull.raised')}</span>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/70"><X size={14} /></button>
        </div>
        <div className="flex flex-col gap-1.5">
          {players.filter((p) => (ledger.packs[p.id] ?? 0) > 0).map((p) => {
            const left = mulligansLeft(ledger, p.id);
            return (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <span className="text-[12px] font-semibold text-white/85">{p.name}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-white/50">{left}/{ledger.packs[p.id]}</span>
                  <button disabled={left <= 0} onClick={() => onUse(p.id)} className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-30">{t('mull.use')}</button>
                </span>
              </div>
            );
          })}
        </div>
        {ledger.used.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/40">{t('mull.ledger')}</div>
            <ul className="no-scrollbar flex max-h-28 flex-col gap-1 overflow-y-auto">
              {ledger.used.map((u, i) => (
                <li key={u.t + i} className="flex items-center justify-between text-[11px] text-white/65">
                  <span>{t('hud.hole')} {u.hole} · {name(u.player)}</span>
                  <button onClick={() => onUndo(i)} aria-label="Undo mulligan" className="p-1 text-white/35 hover:text-rose-300"><Minus size={11} /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
