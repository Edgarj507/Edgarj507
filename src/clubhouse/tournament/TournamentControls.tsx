import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Modal } from '../ui';
import type { PaceToast } from './useLiveEvent';

/** Master "Start Tournament" switch with a privacy confirmation in both directions. */
export function StartTournamentSwitch({ live, onChange }: { live: boolean; onChange: (live: boolean) => void }) {
  const [confirm, setConfirm] = useState<'start' | 'end' | null>(null);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest ${live ? 'text-red-300' : 'text-amber-100/80'}`}>
          {live ? <span className="flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />Live</span> : 'Start Tournament'}
        </span>
        <button role="switch" aria-checked={live} aria-label="Start Tournament" onClick={() => setConfirm(live ? 'end' : 'start')}
          className={`relative h-6 w-11 rounded-full transition-colors ${live ? 'bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.55)]' : 'bg-white/15'}`}>
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${live ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {confirm && (
        <Modal title={confirm === 'start' ? 'Start the tournament?' : 'End the tournament?'} onClose={() => setConfirm(null)}>
          {confirm === 'start' ? (
            <ul className="mb-5 flex flex-col gap-2 text-[12px] leading-snug text-white/75">
              <li>• The Pre-Tournament CRM switches to the <b className="text-white">Live Event Radar</b>.</li>
              <li>• Registered players’ phones start sharing location, <b className="text-white">only while on the property</b> (course boundary + 250 ft). Off-property phones send nothing.</li>
              <li>• Captains can no longer edit rosters.</li>
            </ul>
          ) : (
            <p className="mb-5 text-[12px] leading-snug text-white/75">Location sharing stops on every phone and all stored positions are deleted. The CRM comes back.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirm(null)} className="h-11 rounded-2xl border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/70">Cancel</button>
            <button onClick={() => { onChange(confirm === 'start'); setConfirm(null); }} className={`h-11 rounded-2xl text-[10px] font-black uppercase tracking-widest ${confirm === 'start' ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
              {confirm === 'start' ? 'Go live' : 'End tournament'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Global pace alerts (visible on every Clubhouse OS view while the tournament is live). */
export function PaceAlerts({ toasts, onOpen, onDismiss }: { toasts: PaceToast[]; onOpen: (group: string) => void; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none absolute bottom-14 left-6 z-40 flex w-[360px] max-w-[calc(100%-3rem)] flex-col-reverse gap-2" aria-live="assertive">
      {toasts.map((t) => (
        <div key={t.id} role="alert" className="pointer-events-auto flex items-start gap-2.5 rounded-2xl border border-red-400/40 bg-red-950/80 p-3 shadow-[0_0_30px_rgba(239,68,68,0.35)] backdrop-blur-2xl">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
          <button onClick={() => onOpen(t.group)} className="flex-1 text-left text-[12px] font-semibold leading-snug text-red-50">{t.text}</button>
          <button onClick={() => onDismiss(t.id)} aria-label="Dismiss alert" className="text-red-200/60"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
