import { useEffect, useRef, useState } from 'react';
import { BellRing, CloudLightning, MessageSquareText, Phone, Send, ShieldCheck, Siren, X } from 'lucide-react';
import type { Broadcast } from '../ops/comms';
import { Bubble } from '../clubhouse/everyday/MessagesView';
import { SEVERITY_STYLE } from '../clubhouse/everyday/BroadcastsView';
import type { PlayerComms } from './usePlayerComms';
import { ago } from '../clubhouse/ui';

/** Newest unseen alert as a banner at the top of any golfer screen. */
export function BroadcastBanner({ comms, onOpen }: { comms: PlayerComms; onOpen: () => void }) {
  const b = comms.unseen[0];
  if (!b) return null;
  return (
    <div role="alert" aria-label="Clubhouse alert" className={`absolute inset-x-3 top-3 z-[60] rounded-2xl border p-3 shadow-2xl backdrop-blur-2xl pt-safe ${SEVERITY_STYLE[b.severity]} ${b.severity === 'critical' ? 'animate-[pulse_1.6s_ease-in-out_3]' : ''}`}>
      <div className="flex items-start gap-2">
        {b.kind === 'lightning' ? <CloudLightning size={18} className="mt-0.5 shrink-0" /> : <BellRing size={18} className="mt-0.5 shrink-0" />}
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="text-[13px] font-black leading-tight">{b.title}</div>
          <div className="mt-0.5 line-clamp-3 text-[12px] opacity-90">{b.body}</div>
          <div className="mt-1 text-[9px] uppercase tracking-widest opacity-60">{b.author} · {ago(b.at, comms.now)}{comms.unseen.length > 1 ? ` · +${comms.unseen.length - 1} more` : ''}</div>
        </button>
        <button onClick={() => comms.markSeen([b.id])} aria-label="Dismiss alert" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/30"><X size={14} /></button>
      </div>
    </div>
  );
}

/** Messages with the clubhouse + the alert inbox. */
export function InboxSheet({ comms, tab: start = 'chat', onClose }: { comms: PlayerComms; tab?: 'chat' | 'alerts'; onClose: () => void }) {
  const [tab, setTab] = useState(start);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const { readChat, unreadChat, markSeen, unseen } = comms;
  useEffect(() => { if (tab === 'chat' && unreadChat) readChat(); }, [tab, unreadChat, readChat]);
  useEffect(() => { if (tab === 'alerts' && unseen.length) markSeen(unseen.map((b) => b.id)); }, [tab, unseen, markSeen]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [comms.chat.length, tab]);
  const send = () => { if (!text.trim()) return; comms.send(text.trim()); setText(''); };
  const askNotify = () => { if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission(); };

  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <section role="dialog" aria-label="Messages" onClick={(e) => e.stopPropagation()} className="mx-auto flex h-[78%] w-full max-w-sm flex-col rounded-t-3xl border border-white/10 bg-zinc-950/90 p-4 pb-safe backdrop-blur-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div role="tablist" aria-label="Inbox" className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
            <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${tab === 'chat' ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50'}`}>Clubhouse{comms.unreadChat ? ` · ${comms.unreadChat}` : ''}</button>
            <button role="tab" aria-selected={tab === 'alerts'} onClick={() => setTab('alerts')} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${tab === 'alerts' ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50'}`}>Alerts{comms.unseen.length ? ` · ${comms.unseen.length}` : ''}</button>
          </div>
          <button onClick={onClose} aria-label="Close messages" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60"><X size={14} /></button>
        </div>
        {tab === 'chat' ? (
          <>
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto" aria-live="polite">
              {comms.chat.map((m) => <Bubble key={m.id} m={m} mine={m.from === 'player'} now={comms.now} />)}
              {!comms.chat.length && <p className="m-auto max-w-[240px] text-center text-[12px] text-white/45"><MessageSquareText size={20} className="mx-auto mb-2 text-white/30" />Message the clubhouse or beverage cart — questions, requests, lost items.</p>}
              <div ref={end} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-2 flex gap-2">
              <input aria-label="Message the clubhouse" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Message the clubhouse…" className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-white placeholder-white/30 focus:outline-none" />
              <button type="submit" aria-label="Send" disabled={!text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500 text-black disabled:opacity-40"><Send size={15} /></button>
            </form>
          </>
        ) : (
          <ul className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto" aria-label="Alerts">
            {comms.alerts.map((b: Broadcast) => (
              <li key={b.id} className={`rounded-2xl border px-3 py-2 ${SEVERITY_STYLE[b.severity]}`}>
                <div className="text-[13px] font-black">{b.title}</div>
                <div className="text-[12px] opacity-85">{b.body}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-widest opacity-60">{b.author} · {ago(b.at, comms.now)}</div>
              </li>
            ))}
            {!comms.alerts.length && <li className="py-10 text-center text-[12px] text-white/45">No alerts. Weather warnings, frost delays and course news show up here.</li>}
            {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
              <li><button onClick={askNotify} className="mt-2 w-full rounded-xl border border-white/15 py-2 text-[10px] font-bold uppercase tracking-widest text-white/70">Allow phone notifications for alerts</button></li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

const HOLD_MS = 1500;

/** SOS: press and hold to alert the clubhouse (prevents pocket-dials), with a direct 911 option. */
export function SosSheet({ comms, where, onClose }: { comms: PlayerComms; where: { hole?: number; lat?: number; lng?: number }; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const start = () => {
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / HOLD_MS);
      setProgress(p);
      if (p >= 1) { timer.current = null; comms.raiseSos({ ...where, note: note.trim() || undefined }); return; }
      timer.current = requestAnimationFrame(tick);
    };
    timer.current = requestAnimationFrame(tick);
  };
  const stop = () => { if (timer.current) cancelAnimationFrame(timer.current); timer.current = null; setProgress(0); };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const a = comms.mySos;

  return (
    <div className="absolute inset-0 z-[70] flex items-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-label="Emergency SOS" onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-sm rounded-t-3xl border border-red-400/40 bg-zinc-950/95 p-5 pb-safe text-center">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.25em] text-red-300"><Siren size={14} /> Emergency</span>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60"><X size={14} /></button>
        </div>
        {a ? (
          <div role="status" aria-label="SOS status" className="flex flex-col items-center gap-2 py-2">
            {a.status === 'acknowledged'
              ? <><ShieldCheck size={36} className="text-emerald-400" /><div className="text-lg font-black text-white">Help is on the way</div><div className="text-[12px] text-white/65">{a.ackBy} at the clubhouse is responding{a.hole ? ` to hole ${a.hole}` : ''}.</div></>
              : <><Siren size={36} className="animate-pulse text-red-400" /><div className="text-lg font-black text-white">SOS sent</div><div className="text-[12px] text-white/65">The clubhouse has been alerted with your location{a.hole ? ` (hole ${a.hole})` : ''}. Stay where you are.</div></>}
            {a.status === 'active' && <button onClick={() => { comms.cancelSos(); onClose(); }} className="mt-2 h-10 w-full rounded-2xl border border-white/15 text-[11px] font-bold uppercase tracking-widest text-white/75">I’m OK — cancel SOS</button>}
          </div>
        ) : (
          <>
            <p className="mb-3 text-[12px] text-white/70">Alerts the clubhouse and beverage carts with your hole and GPS location. For heart attack, stroke, lightning strike or serious injury, call 911 first.</p>
            <input aria-label="What happened (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (optional)" className="mb-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-white placeholder-white/30 focus:outline-none" />
            <button
              onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(); }} onKeyUp={stop}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Hold to send SOS"
              className="relative h-16 w-full touch-none select-none overflow-hidden rounded-2xl bg-red-600 text-[13px] font-black uppercase tracking-[0.2em] text-white shadow-[0_0_30px_rgba(220,38,38,0.6)]">
              <span className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${progress * 100}%` }} />
              <span className="relative flex items-center justify-center gap-2"><Siren size={18} /> Hold to send SOS</span>
            </button>
          </>
        )}
        <a href="tel:911" className="mt-3 flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/20 text-[12px] font-black uppercase tracking-widest text-white"><Phone size={14} /> Call 911</a>
      </section>
    </div>
  );
}

/** Personal lightning guard banner (works at any course, platform or not). */
export function LightningBanner({ reasons, onDismiss }: { reasons: string[]; onDismiss: () => void }) {
  return (
    <div role="alert" aria-label="Lightning warning" className="absolute inset-x-3 top-3 z-[55] rounded-2xl border border-red-400/60 bg-red-600/90 p-3 text-white shadow-2xl backdrop-blur-xl pt-safe">
      <div className="flex items-start gap-2">
        <CloudLightning size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-black">⚡ Lightning risk — seek shelter now</div>
          <div className="text-[11px] opacity-90">{reasons.join(' · ')}. Get off the course, away from trees and open water; wait 30 minutes after the last thunder.</div>
        </div>
        <button onClick={onDismiss} aria-label="Dismiss lightning warning" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/25"><X size={14} /></button>
      </div>
    </div>
  );
}
