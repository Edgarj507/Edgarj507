import { useState } from 'react';
import { AlertTriangle, Megaphone, Send } from 'lucide-react';
import { BROADCAST_TEMPLATES, type Broadcast, type BroadcastAudience, type BroadcastKind } from '../../ops/comms';
import { newId } from '../../ops/useOps';
import { ago, field, glass } from '../ui';

const AUDIENCE: Record<BroadcastAudience, string> = { 'on-course': 'Golfers on the course now', event: 'Tournament field', all: 'Everyone with the app' };
export const SEVERITY_STYLE: Record<Broadcast['severity'], string> = {
  critical: 'border-red-400/60 bg-red-500/15 text-red-100',
  warning: 'border-amber-300/50 bg-amber-300/10 text-amber-100',
  info: 'border-sky-300/40 bg-sky-400/10 text-sky-100',
};

/** Compose a push/banner alert (weather, frost delay, closures, announcements) + history. */
export function BroadcastsView({ broadcasts, now, author, eventId, organizer, onSend, preset = 'general' }: {
  broadcasts: Broadcast[]; now: number; author: string; eventId?: string;
  /** Template to start from (e.g. 'lightning' from the Weather hub). */
  preset?: BroadcastKind;
  /** Organizers can only reach their own event's field. */
  organizer?: boolean;
  onSend: (b: Broadcast) => void;
}) {
  const [kind, setKind] = useState<BroadcastKind>(preset);
  const [title, setTitle] = useState(BROADCAST_TEMPLATES[preset].title);
  const [body, setBody] = useState(BROADCAST_TEMPLATES[preset].body);
  const [audience, setAudience] = useState<BroadcastAudience>(organizer || preset === 'cancellation' ? 'event' : 'on-course');
  const [confirm, setConfirm] = useState(false);
  const sev = BROADCAST_TEMPLATES[kind].severity;
  const pick = (k: BroadcastKind) => { setKind(k); setTitle(BROADCAST_TEMPLATES[k].title); setBody(BROADCAST_TEMPLATES[k].body); setConfirm(false); if (k === 'cancellation' && !organizer) setAudience('event'); };
  const ok = title.trim().length > 0 && body.trim().length > 0;
  const send = () => {
    if (!ok) return;
    if (!confirm) { setConfirm(true); return; }
    onSend({ id: newId(), kind, severity: sev, title: title.trim(), body: body.trim(), audience, eventId, author, at: Date.now() });
    setConfirm(false); pick('general');
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 @4xl:grid-cols-[1.1fr_1fr]" data-testid="broadcasts-view">
      <section aria-label="New broadcast" className={`${glass} flex flex-col gap-3 rounded-3xl p-4`}>
        <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]"><Megaphone size={13} /> Broadcast alert</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Templates">
          {(Object.keys(BROADCAST_TEMPLATES) as BroadcastKind[]).map((k) => (
            <button key={k} onClick={() => pick(k)} aria-pressed={kind === k} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${kind === k ? SEVERITY_STYLE[BROADCAST_TEMPLATES[k].severity] : 'border-white/10 text-white/55'}`}>{BROADCAST_TEMPLATES[k].label}</button>
          ))}
        </div>
        <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Title</span>
          <input aria-label="Broadcast title" value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setConfirm(false); }} className={field} /></label>
        <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Message</span>
          <textarea aria-label="Broadcast message" value={body} maxLength={600} rows={4} onChange={(e) => { setBody(e.target.value); setConfirm(false); }} className={`${field} resize-none`} /></label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/50">Send to</legend>
          {(Object.keys(AUDIENCE) as BroadcastAudience[]).filter((a) => !organizer || a === 'event').map((a) => (
            <label key={a} className="flex items-center gap-2 text-[12px] text-white/80">
              <input type="radio" name="audience" checked={audience === a} onChange={() => setAudience(a)} className="accent-emerald-500" /> {AUDIENCE[a]}
            </label>
          ))}
        </fieldset>
        <div className={`rounded-2xl border p-3 ${SEVERITY_STYLE[sev]}`} aria-label="Preview">
          <div className="text-[9px] font-black uppercase tracking-[0.25em] opacity-70">Preview · {sev}</div>
          <div className="mt-0.5 text-[13px] font-black">{title || '—'}</div>
          <div className="text-[12px] opacity-85">{body || '—'}</div>
        </div>
        <button onClick={send} disabled={!ok} className={`flex h-12 items-center justify-center gap-2 rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] disabled:opacity-40 ${confirm ? 'bg-red-500 text-white' : 'bg-emerald-500 text-black'}`}>
          {confirm ? <><AlertTriangle size={15} /> Confirm — send to {AUDIENCE[audience].toLowerCase()}</> : <><Send size={15} /> Send broadcast</>}
        </button>
        <p className="text-[10px] text-white/45">Shows as a banner in the app and, where golfers allowed notifications, as a phone notification.</p>
      </section>

      <section aria-label="Broadcast history" className={`${glass} flex min-h-0 flex-col rounded-3xl p-3`}>
        <h2 className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.2em]">Sent</h2>
        <ul className="eg-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {broadcasts.map((b) => (
            <li key={b.id} className={`rounded-2xl border px-3 py-2 ${SEVERITY_STYLE[b.severity]}`}>
              <div className="flex items-center justify-between gap-2 text-[12px] font-bold"><span className="truncate">{b.title}</span><span className="shrink-0 text-[9px] font-normal opacity-60">{ago(b.at, now)}</span></div>
              <div className="line-clamp-2 text-[11px] opacity-80">{b.body}</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-widest opacity-50">{AUDIENCE[b.audience]} · {b.author}</div>
            </li>
          ))}
          {!broadcasts.length && <li className="py-8 text-center text-[11px] text-white/40">No broadcasts yet.</li>}
        </ul>
      </section>
    </div>
  );
}
