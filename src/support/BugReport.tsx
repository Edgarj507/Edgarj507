import { useMemo, useRef, useState } from 'react';
import { haptic } from '../lib/haptics';
import { Bug, CheckCircle2, ChevronDown, ImagePlus, Send, Trash2, X } from 'lucide-react';
import { cleanTicket, TICKET_CATEGORIES, type SupportTicket, type TicketCategory } from '../ops/model';
import { newId } from '../ops/useOps';
import { collectDiagnostics } from './diagnostics';
import { prepareScreenshot } from './screenshot';

const input = 'w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-white placeholder-white/30 focus:border-emerald-500/50 focus:outline-none';

/** Support & Bug Report form (Player App settings/help and Clubhouse OS header). */
export function BugReport({ role, reporter, onSubmit, onClose }: { role: 'player' | 'staff'; reporter: string; onSubmit: (t: SupportTicket) => void; onClose: () => void }) {
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [shotErr, setShotErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const diagnostics = useMemo(() => collectDiagnostics(role), [role]);

  const pick = async (f?: File) => {
    setShotErr(null);
    if (!f) return;
    setBusy(true);
    try { setShot(await prepareScreenshot(f)); } catch (e) { setShotErr((e as Error).message); }
    setBusy(false);
  };

  const submit = () => {
    setTouched(true);
    if (!category || description.trim().length < 10) { haptic('error'); return; }
    const t: SupportTicket = {
      id: newId(), createdAt: Date.now(), category, description, reporter, contact: contact || undefined, source: role, status: 'open',
      ...(shot ? { screenshot: shot } : {}), diagnostics: collectDiagnostics(role),
    };
    if (!cleanTicket(t)) { setShotErr('Report could not be prepared — try removing the screenshot.'); return; }
    onSubmit(t);
    setSent(t.id.slice(0, 8).toUpperCase());
    haptic('success');
  };

  return (
    <div className="absolute inset-0 z-[65] flex items-end justify-center bg-black/70 p-3 pb-safe backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-label="Support & Bug Report" onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[94%] w-full flex-col rounded-3xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-2xl ${role === 'staff' ? 'max-w-xl self-center' : 'max-w-md'}`}>
        <header className="flex items-start justify-between gap-3 p-4 pb-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400"><Bug size={12} /> Support</div>
            <h2 className="text-base font-black text-white">Report a problem</h2>
          </div>
          <button onClick={onClose} aria-label="Close report" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60"><X size={14} /></button>
        </header>

        {sent ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <CheckCircle2 size={36} className="text-emerald-400" />
            <div className="text-sm font-bold text-white">Thanks — report sent</div>
            <div className="text-[12px] text-white/60">Reference <span className="font-mono text-white">#{sent}</span>. Our team will look into it{contact ? ' and follow up' : ''}.</div>
            <button onClick={onClose} className="mt-3 h-11 w-full rounded-2xl bg-white/10 text-[11px] font-bold uppercase tracking-widest text-white">Done</button>
          </div>
        ) : (
          <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto p-4 pt-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Issue category</span>
              <select aria-label="Issue category" value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} className={input}>
                <option value="" disabled>Choose a category…</option>
                {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {touched && !category && <span className="text-[10px] text-rose-300">Pick a category</span>}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Explain what happened</span>
              <textarea aria-label="Explain what happened" value={description} maxLength={2000} rows={5} onChange={(e) => setDescription(e.target.value)}
                placeholder="What were you doing, what did you expect, and what happened instead?" className={`${input} resize-none leading-relaxed`} />
              {touched && description.trim().length < 10 && <span className="text-[10px] text-rose-300">Please add a few more details (10+ characters)</span>}
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Screenshot (optional)</span>
              {shot ? (
                <div className="relative">
                  <img src={shot} alt="Attached screenshot" className="max-h-48 w-full rounded-xl border border-white/10 object-contain" />
                  <button onClick={() => setShot(null)} aria-label="Remove screenshot" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white/80"><Trash2 size={13} /></button>
                </div>
              ) : (
                <button onClick={() => file.current?.click()} disabled={busy} className="flex h-16 items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-[11px] font-bold text-white/60 disabled:opacity-50">
                  <ImagePlus size={16} /> {busy ? 'Preparing…' : 'Attach a screenshot'}
                </button>
              )}
              <input ref={file} type="file" accept="image/*" aria-label="Screenshot file" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
              {shotErr && <p role="alert" className="text-[10px] text-rose-300">{shotErr}</p>}
              <span className="text-[9px] text-white/35">Location data and photo metadata are removed before sending.</span>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Contact me at (optional)</span>
              <input aria-label="Contact email or phone" value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} placeholder="Email or mobile" className={input} />
            </label>
            <div className="rounded-xl border border-white/10 bg-black/30">
              <button onClick={() => setShowDiag(!showDiag)} aria-expanded={showDiag} className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/55">
                Diagnostics attached automatically <ChevronDown size={13} className={showDiag ? 'rotate-180' : ''} />
              </button>
              {showDiag && (
                <dl aria-label="Diagnostics preview" className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 px-3 pb-3 text-[10px]">
                  {Object.entries(diagnostics).map(([k, v]) => (
                    <div key={k} className="contents"><dt className="text-white/40">{k}</dt><dd className="break-all font-mono text-white/70">{Array.isArray(v) ? (v.length ? v.join('\n') : 'none') : String(v)}</dd></div>
                  ))}
                </dl>
              )}
            </div>
            <button onClick={submit} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-[0.18em] text-black active:scale-[0.98]"><Send size={14} /> Send report</button>
          </div>
        )}
      </section>
    </div>
  );
}
