import { useState } from 'react';
import { Car, CheckCircle2, MapPin, MessageSquareText, Phone, RotateCcw, ShoppingBag, Siren, Truck, X } from 'lucide-react';
import { isOpenOrder, localDate, type OpsState, type Order } from '../../ops/model';
import type { BevCart } from '../../ops/carts';
import { ago, glass, hhmm, Toggle } from '../ui';

/**
 * Beverage Cart OS — the screen the cart attendant uses (tablet or phone mounted in the cart).
 * Shows only the orders dispatched to the selected cart: golfer, phone, hole, items and notes,
 * split into Pending and Fulfilled, with a large "Complete" control per order.
 */
export function BevCartView({ ops, now, cartId, onCartId, onStatus, onCart, onAssign, onMessage, onSos, onExit }: {
  ops: OpsState; now: number; cartId: string; onCartId: (id: string) => void;
  onStatus: (id: string, s: Order['status'], label: string) => void;
  onCart: (id: string, patch: Partial<Pick<BevCart, 'hole' | 'active'>>) => void;
  onAssign: (orderId: string, cartId: string) => void;
  onMessage: (o: { name: string; phone?: string }) => void;
  onSos: (cart: BevCart) => void;
  /** Present in full-screen cart mode. */
  onExit?: () => void;
}) {
  const [tab, setTab] = useState<'pending' | 'fulfilled'>('pending');
  const [sosArm, setSosArm] = useState(false);
  const cart = ops.carts.find((c) => c.id === cartId) ?? ops.carts[0];
  if (!cart) return <p className="p-6 text-white/50">No beverage carts configured.</p>;
  const today = localDate(now);
  const mine = ops.orders.filter((o) => o.cartId === cart.id);
  const pending = mine.filter(isOpenOrder).sort((a, b) => a.createdAt - b.createdAt);
  const fulfilled = mine.filter((o) => o.status === 'completed' && o.completedAt && localDate(o.completedAt) === today).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const others = ops.carts.filter((c) => c.id !== cart.id);
  const who = (o: Order) => `${o.kind === 'hail' ? 'cart hail' : 'order'} for ${o.player}`;
  const list = tab === 'pending' ? pending : fulfilled;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="bev-cart-os">
      <section className={`${glass} flex flex-wrap items-center gap-3 rounded-3xl p-3`}>
        <div role="tablist" aria-label="Beverage cart" className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {ops.carts.map((c) => {
            const n = ops.orders.filter((o) => o.cartId === c.id && isOpenOrder(o)).length;
            return (
              <button key={c.id} role="tab" aria-selected={c.id === cart.id} onClick={() => onCartId(c.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${c.id === cart.id ? 'bg-violet-500/25 text-violet-100' : 'text-white/50'}`}>
                <Car size={12} />{c.name}{n > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[9px] font-black text-black">{n}</span>}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/60">
          <MapPin size={12} /> At hole
          <select aria-label="Cart is at hole" value={cart.hole} onChange={(e) => onCart(cart.id, { hole: Number(e.target.value) })} className="rounded-lg border border-white/10 bg-black/50 px-2 py-1 font-mono text-[13px] text-white">
            {Array.from({ length: 18 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <div className="w-56"><Toggle label="On duty" sub={cart.active ? 'Receiving new orders' : 'New orders go to other carts'} on={cart.active} onChange={(v) => onCart(cart.id, { active: v })} /></div>
        <div className="ml-auto flex items-center gap-2">
          {sosArm ? (
            <span className="flex items-center gap-1.5">
              <button onClick={() => { onSos(cart); setSosArm(false); }} className="flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-[11px] font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(220,38,38,0.7)]"><Siren size={14} /> Send SOS</button>
              <button onClick={() => setSosArm(false)} aria-label="Cancel SOS" className="grid h-10 w-10 place-items-center rounded-xl border border-white/15"><X size={14} /></button>
            </span>
          ) : (
            <button onClick={() => setSosArm(true)} className="flex h-10 items-center gap-1.5 rounded-xl border-2 border-red-500/70 px-4 text-[11px] font-black uppercase tracking-widest text-red-300"><Siren size={14} /> SOS</button>
          )}
          {onExit && <button onClick={onExit} className="h-10 rounded-xl border border-white/15 px-3 text-[10px] font-bold uppercase tracking-widest text-white/70">Exit cart mode</button>}
        </div>
      </section>

      <div role="tablist" aria-label="Cart orders" className="flex gap-1 self-start rounded-xl border border-white/10 bg-black/40 p-1">
        {([['pending', `Pending · ${pending.length}`], ['fulfilled', `Fulfilled · ${fulfilled.length}`]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest ${tab === id ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50'}`}>{label}</button>
        ))}
      </div>

      <ul aria-label={tab === 'pending' ? 'Pending cart orders' : 'Fulfilled cart orders'} className="eg-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto pr-1 @3xl:grid-cols-2">
        {list.map((o) => (
          <li key={o.id} className={`${glass} flex flex-col gap-2 rounded-2xl p-3 ${o.status === 'enroute' ? 'ring-1 ring-emerald-400/40' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[15px] font-black">
                  {o.kind === 'hail' ? <Car size={15} className="text-sky-300" /> : <ShoppingBag size={15} className="text-amber-300" />}
                  {o.player}
                  {o.source === 'phone' && <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-300">Phone-in</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-white/65">
                  <span className="font-bold text-white">Hole {o.hole}</span>
                  {o.phone && <a href={`tel:${encodeURIComponent(o.phone)}`} className="flex items-center gap-1 text-emerald-300 underline-offset-2 hover:underline"><Phone size={11} />{o.phone}</a>}
                  <span>{o.status === 'completed' ? `done ${hhmm(o.completedAt!)}` : ago(o.createdAt, now)}</span>
                </div>
              </div>
              {o.kind !== 'hail' && <span className="font-mono text-[14px] font-bold text-emerald-300">${o.total.toFixed(2)}</span>}
            </div>
            {o.kind === 'hail' ? <div className="text-[12px] text-sky-200">Cart hail — golfer asked for the cart at their spot</div>
              : <ul className="text-[13px] text-white/85">{o.items.map((i) => <li key={i.sku}>{i.qty}× {i.name}</li>)}</ul>}
            {o.note && <div className="rounded-lg bg-amber-300/10 px-2 py-1.5 text-[12px] text-amber-100">Note: {o.note}</div>}
            {o.status !== 'completed' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => onStatus(o.id, 'completed', `Completed ${who(o)}`)} aria-label={`Complete: ${who(o)}`} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-[11px] font-black uppercase tracking-widest text-black active:scale-95"><CheckCircle2 size={14} /> Complete</button>
                {o.status === 'new'
                  ? <button onClick={() => onStatus(o.id, 'enroute', `En route: ${who(o)}`)} className="flex h-11 items-center gap-1 rounded-xl border border-white/15 px-3 text-[10px] font-bold uppercase tracking-widest text-white/75"><Truck size={12} /> En route</button>
                  : <button onClick={() => onStatus(o.id, 'new', `Back to new: ${who(o)}`)} className="flex h-11 items-center gap-1 rounded-xl border border-white/10 px-3 text-[10px] font-bold uppercase tracking-widest text-white/50"><RotateCcw size={12} /> Not en route</button>}
                <button onClick={() => onMessage({ name: o.player, phone: o.phone })} aria-label={`Message ${o.player}`} className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 text-white/75"><MessageSquareText size={14} /></button>
                {others.length > 0 && (
                  <select aria-label={`Reassign ${o.player}`} value="" onChange={(e) => e.target.value && onAssign(o.id, e.target.value)} className="h-11 rounded-xl border border-white/10 bg-black/50 px-2 text-[11px] text-white/70">
                    <option value="">Reassign…</option>
                    {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
            ) : (
              <button onClick={() => onStatus(o.id, 'new', `Reopened ${who(o)}`)} className="flex h-9 items-center justify-center gap-1 self-start rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 text-[10px] font-black uppercase tracking-widest text-amber-100"><RotateCcw size={12} /> Undo complete</button>
            )}
          </li>
        ))}
        {!list.length && <li className="col-span-full py-12 text-center text-[12px] text-white/40">{tab === 'pending' ? `No pending orders for ${cart.name}.` : 'Nothing fulfilled yet today.'}</li>}
      </ul>
    </div>
  );
}
