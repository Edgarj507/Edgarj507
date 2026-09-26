import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export const glass = 'border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.45)]';
export const field = 'w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-white placeholder-white/30 focus:border-emerald-500/50 focus:outline-none';
export const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

export function Panel({ title, aside, children, className = '' }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${glass} flex min-h-0 flex-col rounded-3xl p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-white/85">{title}</h2>
        {aside}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

export function Toggle({ label, on, onChange, sub }: { label: string; on: boolean; onChange: (v: boolean) => void; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/80">{label}</span>
        {sub && <span className="text-[10px] text-white/45">{sub}</span>}
      </span>
      <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.5)]' : 'bg-white/15'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'red' | 'amber' | 'green' }) {
  const c = tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-300' : tone === 'green' ? 'text-emerald-400' : 'text-white';
  return (
    <span className="flex flex-col leading-none">
      <span className={`font-mono text-lg font-semibold ${c}`}>{value}</span>
      <span className="mt-1 text-[8px] font-bold uppercase tracking-widest text-white/45">{label}</span>
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}
        className={`${glass} relative max-h-full w-full overflow-y-auto rounded-3xl bg-zinc-950/80 p-5 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/60"><X size={14} /></button>
        <h3 className="mb-4 pr-10 text-[12px] font-black uppercase tracking-[0.2em] text-white">{title}</h3>
        {children}
      </div>
    </div>
  );
}
