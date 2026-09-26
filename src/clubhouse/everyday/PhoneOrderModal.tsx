import { useMemo, useState } from 'react';
import { Minus, PhoneIncoming, Plus } from 'lucide-react';
import { charityOpen, type OpsState, type Order } from '../../ops/model';
import { nearestCart, holePoint } from '../../ops/carts';
import { CATEGORY_LABEL } from '../../ops/store';
import { normalizePhone } from '../../lib/sms';
import { newId } from '../../ops/useOps';
import { field, Modal } from '../ui';

/** Staff takes an order over the phone → goes straight to the queue and the nearest beverage cart. */
export function PhoneOrderModal({ ops, onSubmit, onClose }: { ops: OpsState; onSubmit: (o: Order) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hole, setHole] = useState(1);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const items = ops.menu.filter((m) => m.visible && (m.category !== 'charity' || charityOpen(ops.settings)) && m.stock !== 0);
  const chosen = items.filter((m) => qty[m.sku]);
  const total = chosen.reduce((t, m) => t + m.price * qty[m.sku], 0);
  const cart = useMemo(() => nearestCart(ops.carts, hole), [ops.carts, hole]);
  const errors = { name: name.trim().length < 2, phone: !normalizePhone(phone), what: !chosen.length && note.trim().length < 3 };

  const submit = () => {
    setTouched(true);
    if (errors.name || errors.phone || errors.what) return;
    const [lat, lng] = holePoint(hole);
    onSubmit({
      id: newId(), kind: 'order', createdAt: Date.now(), player: name, phone, hole, lat, lng, source: 'phone', note: note || undefined,
      items: chosen.map((m) => ({ sku: m.sku, name: m.name, price: m.price, qty: qty[m.sku], kind: m.category === 'food' || m.category === 'beverage' ? 'fnb' : m.category === 'charity' ? 'charity' : 'shop' })),
      total, status: 'new',
    });
  };
  const err = (on: boolean, t: string) => (touched && on ? <span className="text-[10px] text-rose-300">{t}</span> : null);
  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-white/50';

  return (
    <Modal title="Phone-In Order" onClose={onClose} wide>
      <div className="grid gap-3 @container">
        <div className="grid grid-cols-[1fr_1fr_110px] gap-2">
          <label className="flex flex-col gap-1"><span className={lbl}>Golfer name</span><input aria-label="Golfer name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} />{err(errors.name, 'Required')}</label>
          <label className="flex flex-col gap-1"><span className={lbl}>Phone</span><input aria-label="Golfer phone" type="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="(507) 555-0142" className={field} />{err(errors.phone, 'Valid phone')}</label>
          <label className="flex flex-col gap-1"><span className={lbl}>Hole</span>
            <select aria-label="Current hole" value={hole} onChange={(e) => setHole(Number(e.target.value))} className={field}>{Array.from({ length: 18 }, (_, i) => <option key={i} value={i + 1}>Hole {i + 1}</option>)}</select></label>
        </div>
        <div className="grid max-h-[40vh] grid-cols-1 gap-1.5 overflow-y-auto @xl:grid-cols-2 eg-scroll">
          {items.map((m) => (
            <div key={m.sku} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5">
              <span className="flex flex-col"><span className="text-[12px] font-semibold text-white">{m.name}</span><span className="text-[10px] text-white/45">{CATEGORY_LABEL[m.category]} · ${m.price}{m.stock !== null ? ` · ${m.stock} left` : ''}</span></span>
              <span className="flex items-center gap-1.5">
                <button aria-label={`Remove ${m.name}`} disabled={!qty[m.sku]} onClick={() => setQty((q) => ({ ...q, [m.sku]: Math.max(0, (q[m.sku] ?? 0) - 1) }))} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 disabled:opacity-30"><Minus size={11} /></button>
                <span className="w-4 text-center font-mono text-sm">{qty[m.sku] ?? 0}</span>
                <button aria-label={`Add ${m.name}`} disabled={(qty[m.sku] ?? 0) >= Math.min(10, m.stock ?? 10)} onClick={() => setQty((q) => ({ ...q, [m.sku]: (q[m.sku] ?? 0) + 1 }))} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 disabled:opacity-30"><Plus size={11} /></button>
              </span>
            </div>
          ))}
        </div>
        <label className="flex flex-col gap-1"><span className={lbl}>Details / notes</span>
          <textarea aria-label="Order notes" value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="e.g. gluten-free, no ice, Miller Lite if out of draft" className={`${field} resize-none`} />
          {err(errors.what, 'Add an item or describe the request')}</label>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px]">
          <span className="text-white/60">Dispatch to <b className="text-white">{cart?.name ?? 'no active cart'}</b>{cart ? ` (at hole ${cart.hole})` : ''}</span>
          <span className="font-mono font-bold text-emerald-300">${total.toFixed(2)}</span>
        </div>
        <button onClick={submit} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-[0.18em] text-black"><PhoneIncoming size={15} /> Send to queue & cart</button>
      </div>
    </Modal>
  );
}
