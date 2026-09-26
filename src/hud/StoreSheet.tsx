import { useState } from 'react';
import { haptic } from '../lib/haptics';
import { ChefHat, HandCoins, HeartHandshake, Lock, Minus, Plus, ScanFace, ShoppingBag, X } from 'lucide-react';
import { cartTotal } from '../ops/menu';
import { charityOpen, fmtTime, isOpenAt, type OpsSettings, type OrderItem } from '../ops/model';
import { CATEGORY_LABEL, kindOf, MULLIGAN_SKU, type StoreCategory, type StoreItem } from '../ops/store';
import { isEnrolled, verify } from '../lib/webauthn';

interface Props {
  mode: 'store' | 'charity';
  settings: OpsSettings;
  /** Live catalog managed in the Clubhouse OS (price, stock, visibility). */
  menu: StoreItem[];
  hole: number;
  /** Charity mulligans this player already bought in this event window. */
  mulligansBought: number;
  onPlace: (items: OrderItem[], note?: string) => string;
  onCancel: (id: string) => void;
  onClose: () => void;
}

/**
 * Clubhouse Store (F&B + Pro Shop) and the Charity/Event Store. Purchases are confirmed with
 * Face ID on enrolled devices; the organizer's mulligan limit caps the charity quantity.
 */
const ORDER: StoreCategory[] = ['food', 'beverage', 'proshop', 'apparel'];

export function StoreSheet({ mode, settings, menu, hole, mulligansBought, onPlace, onCancel, onClose }: Props) {
  const [note, setNote] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  const charity = mode === 'charity';
  // Charity items exist only during a live in-house tournament; hidden items never show.
  const catalog = (charity
    ? (charityOpen(settings) ? menu.filter((m) => m.visible && m.category === 'charity') : [])
    : menu.filter((m) => m.visible && m.category !== 'charity').sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category)))
    .map((m) => ({ ...m, kind: kindOf(m.category), section: CATEGORY_LABEL[m.category] }));
  const mullRoom = Math.max(0, settings.mulliganLimit - mulligansBought);
  // Restaurant hours come from the Clubhouse OS; F&B locks when the kitchen is closed (no ghost orders).
  const kitchenOpen = isOpenAt(settings.kitchenHours, Date.now());
  const locked = (kind: string) => kind === 'fnb' && !kitchenOpen;
  const max = (sku: string) => {
    const m = catalog.find((x) => x.sku === sku);
    return Math.min(sku === MULLIGAN_SKU ? mullRoom : 10, m?.stock ?? 10);
  };
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
    if (!ok) { haptic('error'); return setErr('Face ID didn’t confirm the purchase.'); }
    setOrderId(onPlace(items, charity ? undefined : note.trim() || undefined));
    setPlaced(true);
    haptic('success');
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
            {!charity && orderId && !undone && (
              <button onClick={() => { onCancel(orderId); setUndone(true); haptic('warning'); }} className="mt-2 h-10 w-full rounded-2xl border border-amber-300/40 bg-amber-300/10 text-[11px] font-black uppercase tracking-widest text-amber-100">Undo order</button>
            )}
            {undone && <p role="status" className="text-[11px] text-amber-200">Order cancelled — nothing will be delivered.</p>}
            <button onClick={onClose} className="mt-3 h-10 w-full rounded-2xl bg-white/10 text-[11px] font-bold uppercase tracking-widest text-white">Back to round</button>
          </div>
        ) : charity && !charityOpen(settings) ? (
          <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-center text-[12px] text-amber-200">Charity mulligans are sold only during a live in-house tournament.</p>
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
                  {locked(m.kind) ? (
                    (i === 0 || catalog[i - 1].kind !== m.kind) && (
                      <div role="status" className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-3 py-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/5 ring-1 ring-white/10"><Lock size={15} className="text-white/60" /></span>
                        <span className="flex flex-col">
                          <span className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-widest text-white/80"><ChefHat size={13} /> Kitchen Closed</span>
                          <span className="text-[10px] text-white/45">Food & drink open {fmtTime(settings.kitchenHours.open)} – {fmtTime(settings.kitchenHours.close)}</span>
                        </span>
                      </div>
                    )
                  ) : (
                  <div className={`flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 ${m.stock === 0 ? 'opacity-50' : ''}`}>
                    <span className="flex flex-col">
                      <span className="text-[12px] font-semibold text-white/90">{m.name}</span>
                      <span className="font-mono text-[10px] text-white/45">${m.price}{m.stock === 0 ? ' · Sold out' : m.stock !== null && m.stock <= 5 ? ` · only ${m.stock} left` : ''}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button onClick={() => bump(m.sku, -1)} aria-label={`Remove ${m.name}`} disabled={!qty[m.sku]} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 disabled:opacity-30"><Minus size={12} /></button>
                      <span className="w-4 text-center font-mono text-sm text-white">{qty[m.sku] ?? 0}</span>
                      <button onClick={() => bump(m.sku, 1)} aria-label={`Add ${m.name}`} disabled={m.stock === 0 || (qty[m.sku] ?? 0) >= max(m.sku)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 disabled:opacity-30"><Plus size={12} /></button>
                    </span>
                  </div>
                  )}
                </li>
              ))}
            </ul>
            {!charity && (
              <textarea aria-label="Order note" value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="Note for the cart (e.g. no ice, gluten-free)"
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white placeholder-white/30 focus:outline-none" />
            )}
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
