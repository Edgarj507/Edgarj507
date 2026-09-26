import { MapPinned } from 'lucide-react';

export const TRACKING_NOTICE = 'Live tracking is strictly limited to your scheduled tee time and only activates upon arrival at the facility.';

/** Consent & notice shown at checkout and round setup. */
export function TrackingNotice({ className = '' }: { className?: string }) {
  return (
    <div role="note" aria-label="Location privacy" className={`flex items-start gap-2.5 rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.08] p-3 backdrop-blur-xl ${className}`}>
      <MapPinned size={16} className="mt-0.5 shrink-0 text-emerald-400" />
      <p className="text-[11px] font-semibold leading-snug text-emerald-50/90">
        {TRACKING_NOTICE}
        <span className="mt-1 block text-[10px] font-normal text-white/50">Location is shared only on the course property (plus 250 ft for GPS drift and parking) and stops the moment you leave.</span>
      </p>
    </div>
  );
}
