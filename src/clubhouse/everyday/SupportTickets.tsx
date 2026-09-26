import { useState } from 'react';
import { Bug, Image as ImageIcon, LifeBuoy, Mail, Phone } from 'lucide-react';
import { TICKET_STATUSES, type SupportTicket, type TicketStatus } from '../../ops/model';
import { ago, field, glass, Modal, Panel } from '../ui';

const TONE: Record<TicketStatus, string> = {
  open: 'bg-red-500/15 text-red-300', investigating: 'bg-amber-300/15 text-amber-100', resolved: 'bg-emerald-500/15 text-emerald-300',
};

/** Staff / developer inbox for player and staff bug reports. All ticket content is untrusted text. */
export function SupportTickets({ tickets, now, onStatus }: { tickets: SupportTicket[]; now: number; onStatus: (id: string, status: TicketStatus, note: string) => void }) {
  const [filter, setFilter] = useState<TicketStatus | 'all'>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const shown = tickets.filter((t) => filter === 'all' || t.status === filter);
  const sel = tickets.find((t) => t.id === openId) ?? null;
  const [note, setNote] = useState('');

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 @4xl:grid-cols-[1fr_1.2fr] @4xl:grid-rows-[minmax(0,1fr)]" data-testid="support-tickets">
      <Panel scroll="thin" title={<><LifeBuoy size={13} /> Support Tickets</>}
        aside={<span className="font-mono text-[10px] text-white/50">{tickets.filter((t) => t.status !== 'resolved').length} unresolved</span>}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(['open', 'investigating', 'resolved', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${filter === f ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/50'}`}>
              {f} · {f === 'all' ? tickets.length : tickets.filter((t) => t.status === f).length}
            </button>
          ))}
        </div>
        <ul className="flex flex-col gap-1.5">
          {shown.map((t) => (
            <li key={t.id}>
              <button onClick={() => { setOpenId(t.id); setNote(t.note ?? ''); }} aria-current={openId === t.id}
                className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2 text-left ${openId === t.id ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/5 bg-white/[0.03]'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-white"><Bug size={12} className="text-white/50" />{t.category}{t.screenshot && <ImageIcon size={11} className="text-white/40" aria-label="has screenshot" />}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${TONE[t.status]}`}>{t.status}</span>
                </span>
                <span className="line-clamp-1 text-[11px] text-white/60">{t.description}</span>
                <span className="text-[9px] text-white/35">{t.reporter} · {t.source} · {ago(t.createdAt, now)} · #{t.id.slice(0, 8).toUpperCase()}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="py-8 text-center text-[11px] text-white/40">No {filter === 'all' ? '' : filter} tickets.</li>}
        </ul>
      </Panel>

      {sel ? (
        <Panel scroll="thin" title={<>#{sel.id.slice(0, 8).toUpperCase()} · {sel.category}</>} aside={<span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${TONE[sel.status]}`}>{sel.status}</span>}>
          <div aria-label="Ticket detail" className="flex flex-col gap-3">
            <div className="text-[11px] text-white/55">
              From <b className="text-white/85">{sel.reporter}</b> ({sel.source}) · {new Date(sel.createdAt).toLocaleString()}
              {sel.contact && (
                <a className="ml-2 inline-flex items-center gap-1 text-emerald-300 hover:underline" href={sel.contact.includes('@') ? `mailto:${encodeURIComponent(sel.contact)}` : `tel:${encodeURIComponent(sel.contact)}`}>
                  {sel.contact.includes('@') ? <Mail size={11} /> : <Phone size={11} />}{sel.contact}
                </a>
              )}
            </div>
            <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-[12px] leading-relaxed text-white/85">{sel.description}</p>
            {sel.screenshot && (
              <button onClick={() => setZoom(true)} aria-label="Enlarge screenshot" className="overflow-hidden rounded-xl border border-white/10">
                <img src={sel.screenshot} alt="Bug report screenshot" className="max-h-56 w-full bg-black object-contain" />
              </button>
            )}
            <div role="radiogroup" aria-label="Ticket status" className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
              {TICKET_STATUSES.map((st) => (
                <button key={st} role="radio" aria-checked={sel.status === st} onClick={() => onStatus(sel.id, st, note)} className={`rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest ${sel.status === st ? TONE[st] : 'text-white/50'}`}>{st}</button>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Internal note</span>
              <textarea aria-label="Internal note" value={note} rows={2} maxLength={500} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (sel.note ?? '') && onStatus(sel.id, sel.status, note)} className={`${field} resize-none`} />
            </label>
            <section aria-label="Diagnostics" className={`${glass} rounded-2xl p-3`}>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50">Auto-diagnostics</div>
              <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[10px]">
                {Object.entries(sel.diagnostics).filter(([k]) => k !== 'recentErrors').map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-white/40">{k}</dt><dd className="break-all font-mono text-white/75">{String(v)}</dd></div>
                ))}
              </dl>
              <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-widest text-white/50">Recent errors</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/50 p-2 font-mono text-[10px] text-rose-200/80">
                {Array.isArray(sel.diagnostics.recentErrors) && sel.diagnostics.recentErrors.length ? sel.diagnostics.recentErrors.join('\n') : 'No errors captured.'}
              </pre>
            </section>
          </div>
        </Panel>
      ) : (
        <section className={`${glass} hidden place-items-center rounded-3xl p-6 text-center text-[12px] text-white/40 @4xl:grid`}>Select a ticket to see details, screenshot and diagnostics.</section>
      )}
      {zoom && sel?.screenshot && (
        <Modal title="Screenshot" onClose={() => setZoom(false)} wide><img src={sel.screenshot} alt="Bug report screenshot, full size" className="w-full rounded-xl" /></Modal>
      )}
    </div>
  );
}
