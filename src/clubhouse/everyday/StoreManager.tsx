import { useState } from 'react';
import { Eye, EyeOff, HandCoins, Minus, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_LABEL, validateItem, type StoreCategory, type StoreItem } from '../../ops/store';
import { field, glass, Modal } from '../ui';

const CATS = Object.keys(CATEGORY_LABEL) as StoreCategory[];

/** Clubhouse store / inventory: add, edit and remove items; stock, price and visibility. */
export function StoreManager({ menu, charityLive, inHouse, onUpsert, onRemove }: {
  menu: StoreItem[]; charityLive: boolean; inHouse: boolean;
  onUpsert: (i: StoreItem, label: string) => void; onRemove: (i: StoreItem) => void;
}) {
  const [edit, setEdit] = useState<{ item: StoreItem; isNew: boolean } | null>(null);
  const [cat, setCat] = useState<StoreCategory | 'all'>('all');
  const shown = menu.filter((m) => cat === 'all' || m.category === cat);
  const low = menu.filter((m) => m.stock !== null && m.stock <= 5).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="store-manager">
      <section className={`${glass} flex flex-wrap items-center gap-3 rounded-3xl p-3`}>
        <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]"><Package size={13} /> Store & Inventory</h2>
        <div role="tablist" aria-label="Category" className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {(['all', ...CATS] as const).map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`rounded-lg px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${cat === c ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50'}`}>{c === 'all' ? 'All' : CATEGORY_LABEL[c]}</button>
          ))}
        </div>
        {low > 0 && <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-200">{low} low / out of stock</span>}
        <button onClick={() => setEdit({ item: { sku: '', name: '', category: cat === 'all' ? 'beverage' : cat, price: 5, stock: null, visible: true }, isNew: true })}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-widest text-black"><Plus size={13} /> Add item</button>
      </section>

      <div className={`rounded-2xl border px-3 py-2 text-[11px] ${charityLive ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-white/55'}`}>
        <HandCoins size={12} className="mr-1 inline" />
        Charity items (mulligans) {charityLive ? 'are on sale now — in-house tournament is live.' : inHouse ? 'go on sale when the in-house tournament starts.' : 'only sell during a live in-house tournament.'}
      </div>

      <ul aria-label="Store items" className="eg-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto pr-1 @3xl:grid-cols-2">
        {shown.map((m) => (
          <li key={m.sku} className={`${glass} flex items-center gap-3 rounded-2xl p-3 ${m.visible ? '' : 'opacity-55'}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[13px] font-bold"><span className="truncate">{m.name}</span>{!m.visible && <span className="rounded bg-white/10 px-1 text-[8px] uppercase tracking-widest">Hidden</span>}</div>
              <div className="text-[10px] text-white/45">{CATEGORY_LABEL[m.category]} · <span className="font-mono">{m.sku}</span> · <span className="font-mono text-emerald-300">${m.price.toFixed(2)}</span></div>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label={`Stock for ${m.name}`}>
              {m.stock === null ? <span className="px-2 text-[10px] text-white/40">Unlimited</span> : (
                <>
                  <button aria-label={`Less ${m.name}`} disabled={m.stock <= 0} onClick={() => onUpsert({ ...m, stock: m.stock! - 1 }, `${m.name} stock → ${m.stock! - 1}`)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 disabled:opacity-30"><Minus size={11} /></button>
                  <span className={`w-9 text-center font-mono text-[13px] ${m.stock === 0 ? 'text-red-300' : m.stock <= 5 ? 'text-amber-300' : ''}`} aria-label={`${m.name} stock`}>{m.stock === 0 ? 'OUT' : m.stock}</span>
                  <button aria-label={`More ${m.name}`} onClick={() => onUpsert({ ...m, stock: m.stock! + 1 }, `${m.name} stock → ${m.stock! + 1}`)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><Plus size={11} /></button>
                </>
              )}
            </div>
            <button aria-label={`${m.visible ? 'Hide' : 'Show'} ${m.name}`} onClick={() => onUpsert({ ...m, visible: !m.visible }, `${m.visible ? 'Hid' : 'Showed'} ${m.name}`)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/70">{m.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
            <button aria-label={`Edit ${m.name}`} onClick={() => setEdit({ item: m, isNew: false })} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/70"><Pencil size={13} /></button>
            <button aria-label={`Remove ${m.name}`} onClick={() => onRemove(m)} className="grid h-8 w-8 place-items-center rounded-full border border-red-400/30 text-red-300"><Trash2 size={13} /></button>
          </li>
        ))}
        {!shown.length && <li className="col-span-full py-10 text-center text-[11px] text-white/40">No items in this category.</li>}
      </ul>

      {edit && <ItemEditor start={edit.item} isNew={edit.isNew} taken={menu.map((m) => m.sku)} onClose={() => setEdit(null)}
        onSave={(i) => { onUpsert(i, `${edit.isNew ? 'Added' : 'Edited'} ${i.name}`); setEdit(null); }} />}
    </div>
  );
}

function ItemEditor({ start, isNew, taken, onSave, onClose }: { start: StoreItem; isNew: boolean; taken: string[]; onSave: (i: StoreItem) => void; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [priceText, setPriceText] = useState(String(start.price));
  const [touched, setTouched] = useState(false);
  const v = validateItem({ ...i, price: Number(priceText) });
  const dup = isNew && taken.includes(i.sku);
  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-white/50';
  const err = (t?: string) => (touched && t ? <span className="text-[10px] text-rose-300">{t}</span> : null);
  const save = () => { setTouched(true); if (v.ok && !dup) onSave({ ...i, price: Number(priceText) }); };
  return (
    <Modal title={isNew ? 'Add store item' : `Edit ${start.name}`} onClose={onClose}>
      <div className="grid gap-3">
        <label className="flex flex-col gap-1"><span className={lbl}>Name</span><input aria-label="Item name" value={i.name} maxLength={60} onChange={(e) => setI({ ...i, name: e.target.value })} className={field} />{err(v.errors.name)}</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><span className={lbl}>SKU</span><input aria-label="SKU" value={i.sku} disabled={!isNew} maxLength={32} onChange={(e) => setI({ ...i, sku: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} className={`${field} font-mono disabled:opacity-50`} />{err(dup ? 'SKU already used' : v.errors.sku)}</label>
          <label className="flex flex-col gap-1"><span className={lbl}>Category</span>
            <select aria-label="Category" value={i.category} onChange={(e) => setI({ ...i, category: e.target.value as StoreCategory })} className={field}>{CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><span className={lbl}>Price ($)</span><input aria-label="Price" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} className={`${field} font-mono`} />{err(v.errors.price)}</label>
          <label className="flex flex-col gap-1"><span className={lbl}>Stock</span>
            <span className="flex items-center gap-2">
              <input aria-label="Stock" type="number" min={0} max={9999} disabled={i.stock === null} value={i.stock ?? ''} onChange={(e) => setI({ ...i, stock: e.target.value === '' ? 0 : Math.floor(Number(e.target.value)) })} className={`${field} font-mono disabled:opacity-40`} />
              <label className="flex shrink-0 items-center gap-1 text-[10px] text-white/60"><input type="checkbox" checked={i.stock === null} onChange={(e) => setI({ ...i, stock: e.target.checked ? null : 10 })} className="accent-emerald-500" /> Unlimited</label>
            </span>{err(v.errors.stock)}</label>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-white/80"><input type="checkbox" checked={i.visible} onChange={(e) => setI({ ...i, visible: e.target.checked })} className="accent-emerald-500" /> Visible to golfers</label>
        {i.category === 'charity' && <p className="rounded-xl bg-amber-300/10 p-2 text-[11px] text-amber-100">Charity items only appear to golfers during a live in-house tournament.</p>}
        <button onClick={save} className="h-11 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-[0.18em] text-black">Save item</button>
      </div>
    </Modal>
  );
}
