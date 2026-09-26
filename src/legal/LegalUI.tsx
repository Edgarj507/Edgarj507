import { useState, type ReactNode } from 'react';
import { FileText, X } from 'lucide-react';
import { LEGAL, type LegalDocId } from './documents';

/** Full-height glass reader for one legal document. */
export function LegalModal({ doc, onClose }: { doc: LegalDocId; onClose: () => void }) {
  const d = LEGAL[doc];
  return (
    <div className="absolute inset-0 z-[60] flex items-end bg-black/70 p-3 pb-safe backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-label={d.title} onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[92%] w-full max-w-md flex-col rounded-3xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400"><FileText size={12} /> Legal</div>
            <h2 className="text-base font-black text-white">{d.title}</h2>
            <p className="text-[10px] text-white/45">Version {d.version} · updated {d.updated}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60"><X size={14} /></button>
        </header>
        <div className="no-scrollbar flex-1 overflow-y-auto p-4 text-[12px] leading-relaxed text-white/75">
          {d.sections.map((s) => (
            <section key={s.h} className="mb-4">
              <h3 className="mb-1 text-[12px] font-bold text-white">{s.h}</h3>
              {s.p.map((p, i) => <p key={i} className={`mb-1.5 ${p.startsWith('Live tracking is strictly') ? 'rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2 font-semibold text-emerald-50' : ''}`}>{p}</p>)}
            </section>
          ))}
        </div>
        <footer className="border-t border-white/10 p-3">
          <button onClick={onClose} className="h-11 w-full rounded-2xl bg-white/10 text-[11px] font-bold uppercase tracking-widest text-white">Done</button>
        </footer>
      </section>
    </div>
  );
}

/** Mandatory agreement checkbox with links that open each document. */
export function LegalConsent({ docs, checked, onChange, error }: { docs: LegalDocId[]; checked: boolean; onChange: (v: boolean) => void; error?: boolean }) {
  const [open, setOpen] = useState<LegalDocId | null>(null);
  const links: ReactNode[] = docs.map((d) => (
    <button key={d} type="button" onClick={() => setOpen(d)} className="font-semibold text-emerald-300 underline underline-offset-2">{LEGAL[d].short}</button>
  ));
  const joined = links.flatMap((l, i) => (i === 0 ? [l] : [i === links.length - 1 ? ' and ' : ', ', l]));
  return (
    <>
      <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${error ? 'border-rose-400/60 bg-rose-500/10' : 'border-white/10 bg-black/30'}`}>
        <input id={`legal-${docs.join('-')}`} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={`I agree to the ${docs.map((d) => LEGAL[d].short).join(', ')}`}
          className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500" />
        <span className="text-[11px] leading-snug text-white/70">I have read and agree to the {joined}.</span>
      </div>
      {error && <p role="alert" className="px-1 text-[10px] text-rose-300">Please accept to continue.</p>}
      {open && <LegalModal doc={open} onClose={() => setOpen(null)} />}
    </>
  );
}
