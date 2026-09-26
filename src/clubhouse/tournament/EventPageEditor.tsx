import { useRef, useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { BANNER_MAX_BYTES, BANNER_TYPES, cleanOrganizerText, validBanner, type EventBanner, type EventDetails } from '../../ops/model';
import { BannerThumb } from '../../tournaments/EventDetailsView';
import type { EventInfo } from '../../tournaments/events';
import { field, Modal } from '../ui';

/** Organizer branding for the player-facing signup page: message + banner image or PDF flyer. */
export function EventPageEditor({ event, details, onSave, onClose }: {
  event: EventInfo; details?: EventDetails; onSave: (p: { text: string; banner: EventBanner | null }) => void; onClose: () => void;
}) {
  const [text, setText] = useState(details?.text ?? event.organizerText);
  const [banner, setBanner] = useState<EventBanner | undefined>(details?.banner);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (!BANNER_TYPES.includes(f.type)) return setErr('Use a PNG, JPG, WebP image or a PDF.');
    if (f.size > BANNER_MAX_BYTES) return setErr(`File is ${(f.size / 1e6).toFixed(1)} MB — the limit is ${BANNER_MAX_BYTES / 1e6} MB.`);
    const r = new FileReader();
    r.onload = () => {
      const b = { name: f.name, type: f.type, dataUrl: String(r.result) };
      if (validBanner(b)) setBanner(b);
      else setErr('That file could not be read.');
    };
    r.readAsDataURL(f);
  };

  return (
    <Modal title="Event page" onClose={onClose} wide>
      <div className="grid gap-4 @container">
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50">Banner / flyer</div>
          <BannerThumb banner={banner} tall />
          <div className="flex gap-2">
            <input ref={input} type="file" accept={BANNER_TYPES.join(',')} aria-label="Upload banner or flyer" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <button onClick={() => input.current?.click()} className="flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-widest text-white"><FileUp size={13} /> Upload image or PDF</button>
            {banner && <button onClick={() => setBanner(undefined)} className="flex h-10 items-center gap-1.5 rounded-xl border border-red-400/30 px-3 text-[10px] font-bold uppercase tracking-widest text-red-300"><Trash2 size={13} /> Remove</button>}
          </div>
          {err && <p role="alert" className="mt-1.5 text-[11px] text-rose-300">{err}</p>}
          <p className="mt-1 text-[10px] text-white/40">PNG, JPG, WebP or PDF up to {BANNER_MAX_BYTES / 1e6} MB. Wide images (3:1) look best.</p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Message to players</span>
          <textarea aria-label="Organizer message" value={text} maxLength={800} rows={6} onChange={(e) => setText(e.target.value)} className={`${field} resize-none leading-relaxed`} />
          <span className="text-right text-[9px] text-white/35">{cleanOrganizerText(text).length}/800</span>
        </label>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/55">
          Shown to players with: <b className="text-white/80">{event.longDate}</b> · {event.time} · {event.location}
        </div>
        <button onClick={() => { onSave({ text, banner: banner ?? null }); onClose(); }} className="h-11 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-widest text-black">Save event page</button>
      </div>
    </Modal>
  );
}
