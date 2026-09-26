import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Download, Printer, Receipt } from 'lucide-react';
import { csvCell, eodTally, localDate, type Order } from '../../ops/model';
import { Panel, Stat } from '../ui';

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const KIND: Record<string, string> = { fnb: 'Food & Drink', shop: 'Pro Shop', charity: 'Charity' };

/** End of Day tally: every order marked Completed on a date, itemized, with revenue. */
export function EodReport({ orders, now, courseName }: { orders: Order[]; now: number; courseName: string }) {
  const [date, setDate] = useState(() => localDate(now));
  const t = useMemo(() => eodTally(orders, date), [orders, date]);
  const nice = new Date(`${date}T12:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const exportCsv = () => {
    const rows = [['Item', 'SKU', 'Category', 'Qty', 'Revenue'], ...t.items.map((l) => [l.name, l.sku, KIND[l.kind], String(l.qty), l.revenue.toFixed(2)]),
      [], ['Orders fulfilled', '', '', String(t.orders), ''], ['Cart hails', '', '', String(t.hails), ''], ['Total revenue', '', '', '', t.revenue.toFixed(2)]];
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n'); // formula-injection safe
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `eod-${date}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="eod-report">
      <Panel className="flex-1" scroll="thin" title={<><Receipt size={13} /> End of Day Tally</>}
        aside={
          <div className="flex gap-2 print:hidden">
            <label className="relative flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80">
              <CalendarDays size={13} /> {date === localDate(now) ? 'Today' : date}
              <input type="date" aria-label="Report date" value={date} max={localDate(now)} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0 [color-scheme:dark]" />
            </label>
            <button onClick={exportCsv} className="flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80"><Download size={13} /> CSV</button>
            <button onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-widest text-black"><Printer size={13} /> Print</button>
          </div>
        }>
        <div className="mb-3 text-[12px] text-white/60">{courseName} · {nice}</div>
        <div className="mb-3 grid grid-cols-2 gap-3 @3xl:grid-cols-5">
          {[
            <Stat key="o" label="Orders fulfilled" value={t.orders} />,
            <Stat key="h" label="Cart hails" value={t.hails} />,
            <Stat key="f" label="Food & Drink" value={money(t.byKind.fnb)} />,
            <Stat key="s" label="Pro Shop" value={money(t.byKind.shop)} />,
            <Stat key="c" label="Charity" value={money(t.byKind.charity)} />,
          ].map((x, i) => <div key={i} className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3">{x}</div>)}
        </div>
        {t.openOrders > 0 && date === localDate(now) && (
          <p role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">
            <AlertTriangle size={13} /> {t.openOrders} order{t.openOrders > 1 ? 's are' : ' is'} still open — mark them completed to include them.
          </p>
        )}
        <table className="w-full text-left text-[12px]" aria-label="Itemized sales">
          <thead className="text-[9px] uppercase tracking-widest text-white/40">
            <tr><th className="px-3 py-2">Item</th><th className="py-2">Category</th><th className="py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Revenue</th></tr>
          </thead>
          <tbody>
            {t.items.map((l) => (
              <tr key={l.sku} className="border-t border-white/5">
                <td className="px-3 py-2 font-semibold text-white">{l.name}</td>
                <td className="py-2 text-white/55">{KIND[l.kind]}</td>
                <td className="py-2 text-right font-mono text-white/80">{l.qty}</td>
                <td className="px-3 py-2 text-right font-mono text-white">{money(l.revenue)}</td>
              </tr>
            ))}
            {!t.items.length && <tr><td colSpan={4} className="py-8 text-center text-[11px] text-white/40">No completed orders for this day.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-emerald-500/40">
              <td colSpan={3} className="px-3 py-3 text-[11px] font-black uppercase tracking-widest text-white/80">Total revenue</td>
              <td className="px-3 py-3 text-right font-mono text-lg font-semibold text-emerald-400" data-testid="eod-total">{money(t.revenue)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-[9px] text-white/35">Counts orders marked Completed on this date (course local time). Demo prices; reconcile with your POS.</p>
      </Panel>
    </div>
  );
}
