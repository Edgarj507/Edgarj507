import { lazy, Suspense, useState } from 'react';
import { AlertTriangle, CloudLightning, CloudRain, Megaphone, Snowflake, Sun, Thermometer, Wind, XCircle, Zap } from 'lucide-react';
import { useWeather } from './useWeather';
import { BROADCAST_TEMPLATES, type BroadcastKind } from '../ops/comms';
import { glass } from '../clubhouse/ui';

const WeatherRadarMap = lazy(() => import('./WeatherRadarMap'));

const WMO: Record<number, string> = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Severe thunderstorm, hail' };
const compass = (d: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];

/**
 * Weather intelligence for the course: live conditions, official NWS alerts, lightning risk,
 * animated Doppler radar, and one-tap broadcasts (lightning, severe weather, frost delay,
 * weather cancellation) to golfers' phones.
 */
export function WeatherHub({ lat, lng, place, onBroadcast }: {
  lat: number; lng: number; place: string;
  /** Opens a pre-filled broadcast (Clubhouse / Organizer). */
  onBroadcast?: (kind: BroadcastKind) => void;
}) {
  const { conditions: c, alerts, lightning, error } = useWeather(lat, lng);
  const [radarFailed, setRadarFailed] = useState(false);
  const riskStyle = lightning.risk === 'high' ? 'border-red-400/60 bg-red-500/15' : lightning.risk === 'elevated' ? 'border-amber-300/50 bg-amber-300/10' : 'border-emerald-400/30 bg-emerald-500/10';
  const quick: { kind: BroadcastKind; icon: typeof Zap }[] = [
    { kind: 'lightning', icon: Zap }, { kind: 'weather', icon: CloudRain }, { kind: 'frost', icon: Snowflake }, { kind: 'cancellation', icon: XCircle },
  ];

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto @4xl:grid-cols-[1.4fr_1fr] @4xl:overflow-hidden" data-testid="weather-hub">
      <section aria-label="Doppler radar" className="relative min-h-[360px] overflow-hidden rounded-3xl border border-white/10 bg-black">
        {radarFailed ? <p className="grid h-full place-items-center p-6 text-center text-[12px] text-white/50">Radar unavailable right now (no connection or WebGL).</p> : (
          <Suspense fallback={<p className="grid h-full place-items-center text-[11px] text-white/40">Loading radar…</p>}>
            <WeatherRadarMap lat={lat} lng={lng} onFail={() => setRadarFailed(true)} />
          </Suspense>
        )}
        <div className={`${glass} pointer-events-none absolute left-3 top-3 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-sky-200`}>Doppler radar · {place}</div>
      </section>

      <div className="eg-scroll flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        <section aria-label="Lightning risk" role="status" className={`rounded-3xl border p-4 ${riskStyle}`}>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]"><CloudLightning size={15} /> Lightning risk: <span data-testid="lightning-risk">{lightning.risk}</span></div>
          <ul className="mt-1 text-[12px] text-white/80">{lightning.reasons.length ? lightning.reasons.map((r) => <li key={r}>• {r}</li>) : <li>No thunderstorms reported or forecast near the course.</li>}</ul>
          {lightning.risk !== 'low' && onBroadcast && (
            <button onClick={() => onBroadcast('lightning')} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-red-500 text-[11px] font-black uppercase tracking-[0.18em] text-white"><Zap size={14} /> Broadcast lightning alert</button>
          )}
          <p className="mt-2 text-[9px] text-white/45">Risk combines thunderstorm reports, NWS warnings and storm energy — not individual strike detection. Always follow the 30-minute rule.</p>
        </section>

        <section aria-label="Current conditions" className={`${glass} rounded-3xl p-4`}>
          <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/85">Now at {place}</h2>
          {c ? (
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <span className="col-span-2 flex items-center gap-1.5 text-[15px] font-bold"><Sun size={15} className="text-amber-300" /> {WMO[c.code] ?? `Code ${c.code}`}</span>
              <span className="flex items-center gap-1.5"><Thermometer size={13} /> {c.tempF}°F</span>
              <span className="flex items-center gap-1.5"><Wind size={13} /> {c.windMph} mph {compass(c.windFromDeg)}</span>
              <span className="flex items-center gap-1.5"><CloudRain size={13} /> {c.rainPct}% rain</span>
              <span className="flex items-center gap-1.5"><Sun size={13} /> UV {c.uv}</span>
            </div>
          ) : <p className="text-[11px] text-white/45">{error ? 'Weather service unreachable — retrying.' : 'Loading…'}</p>}
        </section>

        <section aria-label="Severe weather alerts" className={`${glass} rounded-3xl p-4`}>
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-white/85"><AlertTriangle size={13} /> NWS alerts</h2>
          <ul className="flex flex-col gap-1.5">
            {alerts.map((a) => (
              <li key={a.id} className={`rounded-xl border px-3 py-2 ${/extreme|severe/i.test(a.severity) ? 'border-red-400/50 bg-red-500/10' : 'border-amber-300/40 bg-amber-300/10'}`}>
                <div className="text-[12px] font-bold">{a.event}</div>
                <div className="line-clamp-3 text-[11px] text-white/70">{a.headline}</div>
              </li>
            ))}
            {!alerts.length && <li className="text-[11px] text-white/45">No active watches or warnings.</li>}
          </ul>
        </section>

        {onBroadcast && (
          <section aria-label="Weather broadcasts" className={`${glass} rounded-3xl p-4`}>
            <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-white/85"><Megaphone size={13} /> Notify golfers</h2>
            <div className="grid grid-cols-2 gap-1.5">
              {quick.map(({ kind, icon: I }) => (
                <button key={kind} onClick={() => onBroadcast(kind)} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] text-[10px] font-bold uppercase tracking-widest text-white/80"><I size={13} /> {BROADCAST_TEMPLATES[kind].label}</button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
