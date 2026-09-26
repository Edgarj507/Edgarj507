import { Car, CheckCheck, MapPin, ShoppingBag } from 'lucide-react';
import type { Order } from '../ops/model';
import { ago } from './ui';

/** Live fulfillment queue: every open order/hail with the hole and GPS fix it was placed from. */
export function Queue({ orders, now, selected, onSelect, onStatus }: {
  orders: Order[]; now: number; selected?: string | null; onSelect?: (id: string) => void; onStatus: (id: string, s: Order['status']) => void;
}) {
  const active = orders.filter((o) => o.status !== 'delivered').sort((a, b) => a.createdAt - b.createdAt);
  const delivered = orders.filter((o) => o.status === 'delivered' && o.items.some((i) => i.kind !== 'charity')).length;
  if (!active.length) return <p className="py-6 text-center text-[11px] text-white/40">No open orders.{delivered ? ` ${delivered} delivered today.` : ''}</p>;
  return (
    <ul className="flex flex-col gap-2" aria-label="Fulfillment queue">
      {active.map((o) => (
        <li key={o.id} className={`rounded-2xl border p-3 ${selected === o.id ? 'border-amber-300/60' : 'border-white/10'} ${o.status === 'enroute' ? 'bg-emerald-500/[0.07]' : 'bg-white/[0.04]'}`}>
          <div className="flex items-start justify-between gap-2">
            <button onClick={() => onSelect?.(o.id)} className="min-w-0 text-left">
              <div className="flex items-center gap-1.5 text-[12px] font-bold">
                {o.kind === 'hail' ? <Car size={13} className="text-sky-300" /> : <ShoppingBag size={13} className="text-amber-300" />}
                {o.kind === 'hail' ? 'Cart hail' : `$${o.total}`} · {o.player}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/55"><MapPin size={10} /> Hole {o.hole} · <span className="font-mono">{o.lat.toFixed(5)}, {o.lng.toFixed(5)}</span> · {ago(o.createdAt, now)}</div>
              {o.items.length > 0 && <div className="mt-1 text-[11px] text-white/75">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>}
            </button>
            {o.status === 'new' ? (
              <button onClick={() => onStatus(o.id, 'enroute')} className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black active:scale-95">En Route</button>
            ) : (
              <button onClick={() => onStatus(o.id, 'delivered')} className="flex shrink-0 items-center gap-1 rounded-xl border border-emerald-400/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 active:scale-95"><CheckCheck size={12} /> Delivered</button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
