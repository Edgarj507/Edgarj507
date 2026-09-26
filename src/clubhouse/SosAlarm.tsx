import { useEffect, useRef } from 'react';
import { MapPin, MessageSquareText, Phone, ShieldAlert, Siren } from 'lucide-react';
import type { SosAlert } from '../ops/comms';
import { ago } from './ui';

/** Two-tone alarm synthesized with Web Audio (no media files), repeating until stopped. */
function useAlarm(on: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!on) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx.current ??= new AC();
    const ac = ctx.current;
    void ac.resume();
    let stop = false;
    const beep = () => {
      if (stop) return;
      const t = ac.currentTime;
      for (const [f, dt] of [[880, 0], [660, 0.28], [880, 0.56], [660, 0.84]] as const) {
        const o = ac.createOscillator(); const g = ac.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.25, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
        o.connect(g).connect(ac.destination); o.start(t + dt); o.stop(t + dt + 0.27);
      }
    };
    beep();
    const id = setInterval(beep, 1600);
    (window as unknown as { __egAlarm?: boolean }).__egAlarm = true; // test hook
    return () => { stop = true; clearInterval(id); (window as unknown as { __egAlarm?: boolean }).__egAlarm = false; };
  }, [on]);
}

/**
 * High-priority SOS: forced, centered modal over the whole Clubhouse OS with an audible alarm
 * until a staff member acknowledges it. After acknowledgement a slim banner stays until resolved.
 */
export function SosAlarm({ alerts, now, staffName, onAck, onResolve, onMessage }: {
  alerts: SosAlert[]; now: number; staffName: string;
  onAck: (id: string) => void; onResolve: (id: string) => void; onMessage: (a: SosAlert) => void;
}) {
  const active = alerts.filter((a) => a.status === 'active');
  const acked = alerts.filter((a) => a.status === 'acknowledged');
  useAlarm(active.length > 0);
  const a = active[0];

  return (
    <>
      {acked.length > 0 && !a && (
        <div role="status" aria-label="SOS in progress" className="absolute inset-x-0 top-0 z-[70] flex items-center justify-center gap-3 bg-red-600/95 px-4 py-1.5 text-[12px] font-bold text-white">
          <ShieldAlert size={14} /> SOS in progress: {acked.map((x) => `${x.name}${x.hole ? ` (hole ${x.hole})` : ''} — ${x.ackBy}`).join(' · ')}
          {acked.map((x) => <button key={x.id} onClick={() => onResolve(x.id)} className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] uppercase tracking-widest">Resolve {x.name}</button>)}
        </div>
      )}
      {a && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-red-950/80 p-6 backdrop-blur-md">
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.35),transparent_60%)]" />
          <section role="alertdialog" aria-label="SOS emergency" aria-modal="true" className="relative w-full max-w-lg rounded-3xl border-2 border-red-400 bg-zinc-950/95 p-6 text-center shadow-[0_0_80px_rgba(239,68,68,0.6)]">
            <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-red-600 shadow-[0_0_40px_rgba(239,68,68,0.9)]"><Siren size={30} className="text-white" /></div>
            <div className="text-[11px] font-black uppercase tracking-[0.35em] text-red-300">SOS · Emergency</div>
            <h2 className="mt-1 text-2xl font-black text-white">{a.name}</h2>
            <div className="mt-1 text-[13px] text-white/75">{a.from === 'cart' ? 'Beverage cart' : 'Golfer'}{a.hole ? ` · Hole ${a.hole}` : ''} · {ago(a.at, now)}</div>
            {a.lat != null && a.lng != null && <div className="mt-1 flex items-center justify-center gap-1 font-mono text-[11px] text-white/60"><MapPin size={11} /> {a.lat.toFixed(5)}, {a.lng.toFixed(5)}</div>}
            {a.note && <p className="mx-auto mt-3 max-w-sm rounded-xl bg-red-500/15 p-2 text-[13px] text-red-50">“{a.note}”</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button autoFocus onClick={() => onAck(a.id)} className="col-span-2 h-12 rounded-2xl bg-red-500 text-[12px] font-black uppercase tracking-[0.2em] text-white active:scale-[0.98]">Acknowledge & dispatch · {staffName}</button>
              {a.phone ? (
                <a href={`tel:${encodeURIComponent(a.phone)}`} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/20 text-[11px] font-bold uppercase tracking-widest text-white"><Phone size={13} /> Call {a.phone}</a>
              ) : <span className="flex h-11 items-center justify-center rounded-2xl border border-white/10 text-[11px] text-white/40">No phone on file</span>}
              <button onClick={() => onMessage(a)} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/20 text-[11px] font-bold uppercase tracking-widest text-white"><MessageSquareText size={13} /> Message</button>
            </div>
            <p className="mt-3 text-[10px] text-white/50">Radio the nearest cart. For life-threatening emergencies call 911 first.{active.length > 1 ? ` ${active.length - 1} more SOS waiting.` : ''}</p>
          </section>
        </div>
      )}
    </>
  );
}
