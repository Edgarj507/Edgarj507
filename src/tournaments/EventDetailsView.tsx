import type React from 'react';
import { CalendarDays, Clock, FileText, HeartHandshake, ImageIcon, MapPin, Trophy, Users } from 'lucide-react';
import type { EventBanner, EventDetails } from '../ops/model';
import type { EventInfo } from './events';

/** Open a stored flyer in a new tab via a blob URL (browsers block data: navigation; CSP blocks fetching data:). */
export function openBanner(b: EventBanner) {
  const bin = atob(b.dataUrl.slice(b.dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: b.type }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Banner area: the uploaded image, a PDF flyer tile, or a placeholder. */
export function BannerThumb({ banner, tall = false, interactive = true }: { banner?: EventBanner; tall?: boolean; interactive?: boolean }) {
  const h = tall ? 'h-44' : 'h-24';
  if (banner?.type.startsWith('image/')) {
    return <img src={banner.dataUrl} alt="Tournament banner" className={`mb-3 ${h} w-full rounded-2xl object-cover`} />;
  }
  if (banner) {
    return (
      <span {...(interactive ? { role: 'button', tabIndex: 0, onClick: (e: React.MouseEvent) => { e.stopPropagation(); openBanner(banner); }, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') openBanner(banner); } } : {})}
        className={`mb-3 flex ${h} w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-900/50 to-black text-left`}
        aria-label={`Open tournament flyer ${banner.name}`}>
        <FileText size={28} className="text-emerald-300" />
        <span className="flex flex-col"><b className="text-[12px] text-white">Event flyer (PDF)</b><span className="text-[10px] text-white/55">{banner.name}{interactive ? ' · tap to view' : ''}</span></span>
      </span>
    );
  }
  return (
    <div aria-label="Tournament banner placeholder" className={`mb-3 flex ${h} w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/15 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.18),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.15),transparent_60%)] text-white/40`}>
      <ImageIcon size={tall ? 26 : 18} />
      <span className="text-[9px] font-bold uppercase tracking-widest">Tournament banner / flyer</span>
    </div>
  );
}

/** Rich event page shown before signup: banner, date/time/location, organizer message, price. */
export function EventDetailsView({ event, details, onRegister }: { event: EventInfo; details?: EventDetails; onRegister: () => void }) {
  const text = details?.text ?? event.organizerText;
  return (
    <article aria-label={`${event.name} details`} className="flex flex-col gap-3">
      <BannerThumb banner={details?.banner} tall />
      <div>
        <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-300"><Trophy size={12} /> Charity event</div>
        <h3 className="text-xl font-black leading-tight tracking-tight text-white">{event.name}</h3>
      </div>
      <dl className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-[12px] backdrop-blur-xl">
        <div className="flex items-center gap-2"><CalendarDays size={14} className="text-emerald-400" /><dt className="sr-only">Date</dt><dd className="text-white">{event.longDate}</dd></div>
        <div className="flex items-center gap-2"><Clock size={14} className="text-emerald-400" /><dt className="sr-only">Time</dt><dd className="text-white">{event.time}</dd></div>
        <div className="flex items-center gap-2"><MapPin size={14} className="text-emerald-400" /><dt className="sr-only">Location</dt><dd className="text-white">{event.location}</dd></div>
        <div className="flex items-center gap-2"><Users size={14} className="text-emerald-400" /><dt className="sr-only">Format</dt><dd className="text-white/75">{event.format} · {event.teams} teams max</dd></div>
      </dl>
      <section aria-label="From the organizer" className="rounded-2xl border border-white/10 bg-black/30 p-3">
        <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/45">From the organizer</div>
        {text.split('\n').filter(Boolean).map((l, i) => <p key={i} className="mb-1.5 text-[12px] leading-relaxed text-white/80">{l}</p>)}
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300/80"><HeartHandshake size={12} /> {event.cause}</p>
      </section>
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
        <span className="font-mono text-xl font-semibold text-emerald-400">${event.foursomePrice}<span className="text-[10px] text-white/40"> / foursome</span></span>
        <button onClick={onRegister} className="rounded-full bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black active:scale-95">Register a foursome</button>
      </div>
    </article>
  );
}
