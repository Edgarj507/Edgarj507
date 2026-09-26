import { useState } from 'react';
import { Car, CheckCircle2, History, MapPin, RotateCcw, ShoppingBag, Truck } from 'lucide-react';
import { isOpenOrder, localDate, type Order } from '../ops/model';
import { ago, hhmm } from './ui';

/**
 * Fulfillment queue with two tabs:
 *  • Active — open orders/hails with hole + GPS; "Mark Completed" clears them.
 *  • Completed — today's completed orders; "Undo" puts a mistaken completion back in the queue
 *    (and out of the End of Day tally).
 */
export function Queue({ orders, now, selected, onSelect, onStatus }: {
  orders: Order[]; now: number; selected?: string | null; onSelect?: (id: string) => void; onStatus: (id: string, s: Order['status'], label: string) => void;
}) {
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const active = orders.filter(isOpenOrder).sort((a, b) => a.createdAt - b.createdAt);
  const today = localDate(now);
  // Physical deliveries completed today (digital charity mulligans aren't fulfilled by staff).
  const done = orders.filter((o) => o.status === 'completed' && !!o.completedAt && localDate(o.completedAt) === today && (o.kind === 'hail' || o.items.some((i) => i.kind !== 'charity')))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const who = (o: Order) => `${o.kind === 'hail' ? 'cart hail' : `$${o.total} order`} for ${o.player}`;

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Queue view" className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
        {([['active', `Active · ${active.length}`, Truck], ['completed', `Completed · ${done.length}`, History]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[9px] font-bold uppercase tracking-widest ${tab === id ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50'}`}><Icon size={11} />{label}</button>
        ))}
      </div>

      {tab === 'active' ? (
        !active.length ? <p className="py-6 text-center text-[11px] text-white/40">Queue clear — no open orders.</p> : (
          <ul className="flex flex-col gap-2" aria-label="Fulfillment queue">
            {active.map((o) => (
              <li key={o.id} className={`rounded-2xl border p-3 transition-colors ${selected === o.id ? 'border-amber-300/60' : 'border-white/10'} ${o.status === 'enroute' ? 'bg-emerald-500/[0.07]' : 'bg-white/[0.04]'}`}>
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => onSelect?.(o.id)} className="min-w-0 text-left">
                    <div className="flex items-center gap-1.5 text-[12px] font-bold">
                      {o.kind === 'hail' ? <Car size={13} className="text-sky-300" /> : <ShoppingBag size={13} className="text-amber-300" />}
                      {o.kind === 'hail' ? 'Cart hail' : `$${o.total}`} · {o.player}
                      {o.status === 'enroute' && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-300">En route</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/55"><MapPin size={10} /> Hole {o.hole} · <span className="font-mono">{o.lat.toFixed(5)}, {o.lng.toFixed(5)}</span> · {ago(o.createdAt, now)}</div>
                    {o.items.length > 0 && <div className="mt-1 text-[11px] text-white/75">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>}
                  </button>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button onClick={() => onStatus(o.id, 'completed', `Completed ${who(o)}`)} aria-label={`Mark completed: ${who(o)}`}
                      className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black active:scale-95">
                      <CheckCircle2 size={12} /> Mark Completed
                    </button>
                    {o.status === 'new' ? (
                      <button onClick={() => onStatus(o.id, 'enroute', `En route: ${who(o)}`)} className="flex items-center justify-center gap-1 rounded-xl border border-white/15 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/70 active:scale-95">
                        <Truck size={11} /> En Route
                      </button>
                    ) : (
                      <button onClick={() => onStatus(o.id, 'new', `Back to new: ${who(o)}`)} className="flex items-center justify-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/50 active:scale-95">
                        <RotateCcw size={11} /> Not en route
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        !done.length ? <p className="py-6 text-center text-[11px] text-white/40">Nothing completed yet today.</p> : (
          <ul className="flex flex-col gap-1.5" aria-label="Completed orders">
            {done.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white/85">
                    <CheckCircle2 size={12} className="text-emerald-400" /> {o.kind === 'hail' ? 'Cart hail' : `$${o.total}`} · {o.player}
                  </span>
                  <span className="block truncate text-[10px] text-white/45">Hole {o.hole} · completed {hhmm(o.completedAt!)}{o.items.length ? ` · ${o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}` : ''}</span>
                </span>
                <button onClick={() => onStatus(o.id, 'new', `Reopened ${who(o)}`)} aria-label={`Undo completion: ${who(o)}`}
                  className="flex shrink-0 items-center gap-1 rounded-xl border border-amber-300/40 bg-amber-300/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-amber-100 active:scale-95">
                  <RotateCcw size={11} /> Undo
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
