import { useState } from 'react';
import { HandCoins, HeartHandshake, Minus, Plus, ScanFace, ShoppingBag, X } from 'lucide-react';
import { MENU, MULLIGAN, cartTotal } from '../ops/menu';
import type { OpsSettings, OrderItem } from '../ops/model';
import { isEnrolled, verify } from '../lib/webauthn';

interface Props {
  mode: 'store' | 'charity';
  settings: OpsSettings;
  hole: number;
  /** Charity mulligans this player already bought in this event window. */
  mulligansBought: number;
  onPlace: (items: OrderItem[]) => void;
  onClose: () => void;
}

/**
 * Clubhouse Store (F&B + Pro Shop) and the Charity/Event Store. Purchases are confirmed with
 * Face ID on enrolled devices; the organizer's mulligan limit caps the charity quantity.
 */
export function StoreSheet({ mode, settings, hole, mulligansBought, onPlace, onClose }: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  const charity = mode === 'charity';
  const catalog = charity ? [MULLIGAN] : MENU;
  const mullRoom = Math.max(0, settings.mulliganLimit - mulligansBought);
  const max = (sku: string) => (sku === MULLIGAN.sku ? mullRoom : 10);
  const items: OrderItem[] = catalog.filter((m) => qty[m.sku]).map((m) => ({ sku: m.sku, name: m.name, price: m.price, qty: qty[m.sku], kind: m.kind }));
  const total = cartTotal(items);
  const closed = !charity && !settings.liveOrdering;
  const face = isEnrolled('player');

  const bump = (sku: string, d: number) => setQty((q) => ({ ...q, [sku]: Math.max(0, Math.min(max(sku), (q[sku] ?? 0) + d)) }));

  const checkout = async () => {
    if (!items.length || busy) return;
    setErr(null);
    setBusy(true);
    const ok = !face || (await verify('player'));
    setBusy(false);
    if (!ok) return setErr('Face ID didn’t confirm the purchase.');
    onPlace(items);
    setPlaced(true);
    navigator.vibrate?.(20);
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <section
        role="dialog"
        aria-label={charity ? 'Charity store' : 'Clubhouse store'}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-sm rounded-t-3xl border border-white/10 bg-zinc-950/85 p-4 pb-safe shadow-2xl backdrop-blur-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {charity ? <HeartHandshake size={16} className="text-amber-300" /> : <ShoppingBag size={16} className="text-emerald-400" />}
            <div>
              <div className="text-[12px] font-black uppercase tracking-widest text-white">{charity ? 'Charity Store' : 'Clubhouse Store'}</div>
              <div className="text-[9px] text-white/45">{charity ? `Kid’s Cup · limit ${settings.mulliganLimit} per player` : `Delivered to hole ${hole} · GPS tagged`}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60"><X size={14} /></button>
        </div>

        {placed ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="text-2xl">{charity ? '🎗️' : '🛺'}</span>
            <div className="text-sm font-bold text-white">{charity ? 'Mulligans added to your ledger' : 'Order sent to the clubhouse'}</div>
            <div className="text-[11px] text-white/50">{charity ? 'Thank you for supporting the Kid’s Cup.' : `The cart will find you on hole ${hole}.`}</div>
            <button onClick={onClose} className="mt-3 h-10 w-full rounded-2xl bg-white/10 text-[11px] font-bold uppercase tracking-widest text-white">Back to round</button>
          </div>
        ) : closed ? (
          <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-center text-[12px] text-amber-200">Ordering is paused by the clubhouse right now.</p>
        ) : (
          <>
            {charity && mullRoom === 0 && (
              <p className="mb-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-2.5 text-center text-[11px] text-amber-200">You’ve reached the organizer’s limit of {settings.mulliganLimit} mulligans.</p>
            )}
            <ul className="flex flex-col gap-1.5">
              {catalog.map((m, i) => (
                <li key={m.sku}>
                  {(i === 0 || catalog[i - 1].section !== m.section) && !charity && (
                    <div className="mb-1 mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">{m.section}</div>
                  )}
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                    <span className="flex flex-col">
                      <span className="text-[12px] font-semibold text-white/90">{m.name}</span>
                      <span className="font-mono text-[10px] text-white/45">${m.price}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button onClick={() => bump(m.sku, -1)} aria-label={`Remove ${m.name}`} disabled={!qty[m.sku]} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 disabled:opacity-30"><Minus size={12} /></button>
                      <span className="w-4 text-center font-mono text-sm text-white">{qty[m.sku] ?? 0}</span>
                      <button onClick={() => bump(m.sku, 1)} aria-label={`Add ${m.name}`} disabled={(qty[m.sku] ?? 0) >= max(m.sku)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 disabled:opacity-30"><Plus size={12} /></button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {charity && <p className="mt-2 text-[10px] text-white/45">{mulligansBought} bought · {mullRoom} left under the organizer limit</p>}
            {err && <p role="alert" className="mt-2 text-center text-[11px] text-rose-300">{err}</p>}
            <button
              onClick={checkout}
              disabled={!items.length || busy}
              className={`mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs font-black uppercase tracking-[0.18em] transition active:scale-[0.98] disabled:opacity-40 ${charity ? 'bg-amber-400 text-black' : 'bg-emerald-500 text-black'}`}
            >
              {face ? <ScanFace size={16} /> : charity ? <HandCoins size={16} /> : <ShoppingBag size={16} />}
              {busy ? 'Confirming…' : `${face ? 'Pay with Face ID' : 'Place order'} · $${total}`}
            </button>
            <p className="mt-2 text-center text-[9px] text-white/35">Demo checkout — charged to your tab when payments are connected.</p>
          </>
        )}
      </section>
    </div>
  );
}
