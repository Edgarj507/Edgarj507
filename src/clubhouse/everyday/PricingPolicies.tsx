import { useEffect, useState, type ReactNode } from 'react';
import { BadgeDollarSign, Car, Clock, FileText, Plus, RotateCcw, Save, Shirt, Trash2 } from 'lucide-react';
import { fmtTime } from '../../ops/model';
import { quote, validatePricing, type RateBand, type TeePricing } from '../../ops/teetimes';
import { field, glass, Toggle } from '../ui';

const lbl = 'text-[10px] font-bold uppercase tracking-widest text-white/50';
const INTERVALS = [5, 7, 8, 9, 10, 12, 15, 20];

/**
 * Pricing & Policies — staff set tee-time rates by time of day and weekday/weekend, cart fees
 * (per golfer or per reservation), booking rules and course policies. "Publish" pushes the
 * change to every golfer's booking screen immediately (and it can be undone from History).
 */
export function PricingPolicies({ pricing, onPublish }: { pricing: TeePricing; onPublish: (p: TeePricing) => void }) {
  const [draft, setDraft] = useState<TeePricing>(pricing);
  // Someone else published (another tablet, or Undo) → pick it up unless we're mid-edit.
  const [base, setBase] = useState(pricing);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  useEffect(() => { if (!dirty) { setDraft(pricing); setBase(pricing); } else setBase(pricing); }, [pricing]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = validatePricing(draft);
  const setBand = (i: number, patch: Partial<RateBand>) => setDraft((d) => ({ ...d, bands: d.bands.map((b, k) => (k === i ? { ...b, ...patch } : b)) }));
  const num = (s: string) => (s === '' ? NaN : Number(s));
  const sample = (weekend: boolean) => (weekend ? '2026-10-17' : '2026-10-14');

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="pricing-policies">
      <section className={`${glass} flex flex-wrap items-center gap-3 rounded-3xl p-3`}>
        <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]"><BadgeDollarSign size={14} className="text-emerald-300" /> Pricing & Policies</h2>
        <span role="status" className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${dirty ? 'bg-amber-300/15 text-amber-200' : 'bg-emerald-500/15 text-emerald-300'}`}>{dirty ? 'Unpublished changes' : 'Live on golfer app'}</span>
        <div className="ml-auto flex gap-2">
          {dirty && <button onClick={() => setDraft(base)} className="flex h-9 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-[10px] font-bold uppercase tracking-widest text-white/70"><RotateCcw size={12} /> Discard</button>}
          <button disabled={!dirty || !v.ok} onClick={() => { onPublish(draft); setBase(draft); }} className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40"><Save size={12} /> Publish</button>
        </div>
        {!v.ok && <p role="alert" className="w-full text-[11px] text-rose-300">{v.errors.join(' · ')}</p>}
      </section>

      <div className="eg-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto pr-1 @5xl:grid-cols-2">
        <Card icon={<Clock size={14} />} title="Green fees · per golfer">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" aria-label="Rate bands">
              <thead><tr className="text-left text-[9px] uppercase tracking-widest text-white/45">
                <th className="pb-1 pr-2">Band</th><th className="pb-1 pr-2">From</th><th className="pb-1 pr-1">Wkday 18</th><th className="pb-1 pr-1">Wkday 9</th><th className="pb-1 pr-1">Wkend 18</th><th className="pb-1 pr-1">Wkend 9</th><th />
              </tr></thead>
              <tbody>
                {draft.bands.map((b, i) => (
                  <tr key={b.id}>
                    <td className="pr-2 py-0.5"><input aria-label={`Band ${i + 1} name`} value={b.label} maxLength={30} onChange={(e) => setBand(i, { label: e.target.value })} className={`${field} py-1.5`} /></td>
                    <td className="pr-2"><input aria-label={`${b.label} starts`} type="time" step={600} value={b.from} onChange={(e) => e.target.value && setBand(i, { from: e.target.value.slice(0, 5) })} className={`${field} py-1.5 font-mono [color-scheme:dark]`} /></td>
                    {(['weekday18', 'weekday9', 'weekend18', 'weekend9'] as const).map((k) => (
                      <td key={k} className="pr-1"><input aria-label={`${b.label} ${k.replace(/(\d+)/, ' $1')}`} inputMode="decimal" value={Number.isNaN(b[k]) ? '' : b[k]} onChange={(e) => setBand(i, { [k]: num(e.target.value) })} className={`${field} w-16 py-1.5 font-mono`} /></td>
                    ))}
                    <td><button aria-label={`Remove ${b.label}`} disabled={draft.bands.length <= 1} onClick={() => setDraft((d) => ({ ...d, bands: d.bands.filter((_, k) => k !== i) }))} className="grid h-8 w-8 place-items-center rounded-lg border border-red-400/30 text-red-300 disabled:opacity-30"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button disabled={draft.bands.length >= 6} onClick={() => setDraft((d) => ({ ...d, bands: [...d.bands, { id: crypto.randomUUID(), label: 'New band', from: '18:00', weekday18: 30, weekday9: 20, weekend18: 35, weekend9: 22 }] }))}
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/15 text-[10px] font-bold uppercase tracking-widest text-white/70 disabled:opacity-30"><Plus size={12} /> Add time band</button>
          <p className="text-[10px] text-white/45">Weekend = Saturday and Sunday. Each band runs until the next band starts.</p>
        </Card>

        <Card icon={<Car size={14} />} title="Cart fees & transport">
          <div role="radiogroup" aria-label="Cart fee applies" className="grid grid-cols-2 gap-2">
            {([['per-golfer', 'Per golfer', 'Each rider pays the cart fee'], ['per-reservation', 'Per reservation', 'One cart fee for the group']] as const).map(([id, t, sub]) => (
              <button key={id} role="radio" aria-checked={draft.cart.mode === id} onClick={() => setDraft((d) => ({ ...d, cart: { ...d.cart, mode: id } }))}
                className={`rounded-xl border px-3 py-2 text-left ${draft.cart.mode === id ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/10 bg-black/30'}`}>
                <div className={`text-[11px] font-black uppercase tracking-widest ${draft.cart.mode === id ? 'text-emerald-300' : 'text-white/70'}`}>{t}</div>
                <div className="text-[10px] text-white/45">{sub}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1"><span className={lbl}>Cart · 18 holes</span><input aria-label="Cart fee 18 holes" inputMode="decimal" value={Number.isNaN(draft.cart.price18) ? '' : draft.cart.price18} onChange={(e) => setDraft((d) => ({ ...d, cart: { ...d.cart, price18: num(e.target.value) } }))} className={`${field} font-mono`} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>Cart · 9 holes</span><input aria-label="Cart fee 9 holes" inputMode="decimal" value={Number.isNaN(draft.cart.price9) ? '' : draft.cart.price9} onChange={(e) => setDraft((d) => ({ ...d, cart: { ...d.cart, price9: num(e.target.value) } }))} className={`${field} font-mono`} /></label>
          </div>
          <Toggle label="Walking allowed" sub={draft.walking ? 'Golfers can choose walking or riding' : 'Carts required for every round'} on={draft.walking} onChange={(w) => setDraft((d) => ({ ...d, walking: w }))} />
        </Card>

        <Card icon={<FileText size={14} />} title="Booking rules">
          <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
            <label className="flex flex-col gap-1"><span className={lbl}>Tee interval</span>
              <select aria-label="Tee time interval" value={draft.interval} onChange={(e) => setDraft((d) => ({ ...d, interval: Number(e.target.value) }))} className={field}>{INTERVALS.map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className={lbl}>Book ahead (days)</span><input aria-label="Booking window days" type="number" min={1} max={60} value={draft.bookingWindowDays} onChange={(e) => setDraft((d) => ({ ...d, bookingWindowDays: Math.floor(num(e.target.value)) }))} className={`${field} font-mono`} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>Free cancel (hours)</span><input aria-label="Free cancellation hours" type="number" min={0} max={168} value={draft.cancelHours} onChange={(e) => setDraft((d) => ({ ...d, cancelHours: Math.floor(num(e.target.value)) }))} className={`${field} font-mono`} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>Max per golfer</span><input aria-label="Max upcoming reservations" type="number" min={1} max={10} value={draft.maxUpcoming} onChange={(e) => setDraft((d) => ({ ...d, maxUpcoming: Math.floor(num(e.target.value)) }))} className={`${field} font-mono`} /></label>
          </div>
          <label className="flex flex-col gap-1"><span className={lbl}>Cancellation policy</span>
            <textarea aria-label="Cancellation policy" rows={3} maxLength={600} value={draft.policies.cancellation} onChange={(e) => setDraft((d) => ({ ...d, policies: { ...d.policies, cancellation: e.target.value } }))} className={`${field} resize-none`} /></label>
        </Card>

        <Card icon={<Shirt size={14} />} title="Course rules & dress code">
          <label className="flex flex-col gap-1"><span className={lbl}>Course rules</span>
            <textarea aria-label="Course rules" rows={4} maxLength={800} value={draft.policies.rules} onChange={(e) => setDraft((d) => ({ ...d, policies: { ...d.policies, rules: e.target.value } }))} className={`${field} resize-none`} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>Dress code</span>
            <textarea aria-label="Dress code" rows={2} maxLength={300} value={draft.policies.dressCode} onChange={(e) => setDraft((d) => ({ ...d, policies: { ...d.policies, dressCode: e.target.value } }))} className={`${field} resize-none`} /></label>
        </Card>

        {v.ok && (
          <Card icon={<BadgeDollarSign size={14} />} title="What golfers will pay · foursome" wide>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]" aria-label="Price preview">
                <thead><tr className="text-left text-[9px] uppercase tracking-widest text-white/45"><th className="pb-1">Band</th><th>Weekday 18 walk</th><th>Weekday 18 ride</th><th>Weekend 18 ride</th><th>Weekend 9 ride</th></tr></thead>
                <tbody>
                  {[...draft.bands].sort((a, b) => a.from.localeCompare(b.from)).map((b) => (
                    <tr key={b.id} className="font-mono">
                      <td className="py-0.5 font-sans text-white/80">{b.label} · {fmtTime(b.from)}</td>
                      <td>${quote(draft, sample(false), b.from, '18', 'walk', 4).total}</td>
                      <td>${quote(draft, sample(false), b.from, '18', 'ride', 4).total}</td>
                      <td>${quote(draft, sample(true), b.from, '18', 'ride', 4).total}</td>
                      <td>${quote(draft, sample(true), b.from, 'front9', 'ride', 4).total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ icon, title, children, wide }: { icon: ReactNode; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section aria-label={title} className={`${glass} flex flex-col gap-3 rounded-3xl p-4 ${wide ? '@5xl:col-span-2' : ''}`}>
      <h3 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-white/85"><span className="text-emerald-300">{icon}</span>{title}</h3>
      {children}
    </section>
  );
}
