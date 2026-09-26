import { useState } from 'react';
import { Check, Copy, MessageSquareText, Send, Share2, X } from 'lucide-react';
import type { EventInfo } from './events';
import { smsGroupLink } from '../lib/sms';
import { haptic } from '../lib/haptics';

const FAV_KEY = 'eg.favEvents.v1';
export const readFavs = (): string[] => { try { const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
export const writeFavs = (ids: string[]) => { try { localStorage.setItem(FAV_KEY, JSON.stringify(ids.slice(0, 100))); } catch { /* private mode */ } };

export const eventLink = (id: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://exclusive.golf'}/?event=${encodeURIComponent(id)}`;
export const shareText = (e: EventInfo) => `${e.name} — ${e.date} at ${e.course}. ${e.cause}. Details & registration: ${eventLink(e.id)}`;

export interface Friend { id: string; name: string; handle: string }

/** Share an event: system share sheet, SMS, copy link, or in-app to Exclusive.Golf friends. */
export function ShareEvent({ event, friends, onInApp, onClose }: { event: EventInfo; friends: Friend[]; onInApp: (handles: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = shareText(event);
  const native = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async () => { try { await navigator.clipboard.writeText(eventLink(event.id)); setCopied(true); haptic('success'); } catch { /* clipboard blocked */ } };
  const btn = 'flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] text-[11px] font-bold uppercase tracking-widest text-white/85';

  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <section role="dialog" aria-label="Share event" onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-sm rounded-t-3xl border border-white/10 bg-zinc-950/90 p-4 pb-safe backdrop-blur-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="min-w-0"><div className="text-[12px] font-black uppercase tracking-widest text-white">Share event</div><div className="truncate text-[10px] text-white/50">{event.name}</div></div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60"><X size={14} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {native && <button className={`${btn} col-span-2`} onClick={() => { void navigator.share({ title: event.name, text, url: eventLink(event.id) }).catch(() => {}); }}><Share2 size={14} /> Share…</button>}
          <a className={btn} href={smsGroupLink([], text)}><MessageSquareText size={14} /> Text (SMS)</a>
          <button className={btn} onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}</button>
        </div>
        <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-white/50">Send in the app</div>
        {friends.length ? (
          <ul className="mt-1.5 flex max-h-44 flex-col gap-1 overflow-y-auto" aria-label="Friends">
            {friends.map((f) => (
              <li key={f.id}>
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white/85">
                  <input type="checkbox" checked={picked.includes(f.handle)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.handle] : p.filter((x) => x !== f.handle)))} className="accent-emerald-500" />
                  {f.name} <span className="text-white/40">{f.handle}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-[11px] text-white/45">Add friends to share events in the app.</p>}
        {sent ? <p role="status" className="mt-2 text-center text-[11px] text-emerald-300">Sent — it shows in their Tournaments tab.</p> : (
          <button disabled={!picked.length} onClick={() => { onInApp(picked); setSent(true); setPicked([]); haptic('success'); }} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-widest text-black disabled:opacity-40"><Send size={14} /> Send to {picked.length || ''} friend{picked.length === 1 ? '' : 's'}</button>
        )}
      </section>
    </div>
  );
}
