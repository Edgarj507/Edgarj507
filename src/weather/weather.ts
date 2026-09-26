/**
 * Weather intelligence.
 *  • Conditions: Open-Meteo (no key) — temperature, wind, rain chance, UV, WMO weather code, CAPE.
 *  • Official alerts: US National Weather Service (api.weather.gov) for the point.
 *  • Radar: RainViewer composite radar tiles (animated past frames).
 *
 * Lightning: these free feeds don't report individual strikes. `lightningRisk()` flags storms
 * from thunderstorm weather codes, NWS thunderstorm/tornado warnings and storm energy (CAPE).
 * For strike-level detection (e.g. "strike within 8 miles") plug a licensed feed (Xweather,
 * Earth Networks, Vaisala) into `LightningProvider`.
 *
 * Privacy: coordinates sent to these services are rounded to ~1 km.
 */
export interface Conditions { tempF: number; windMph: number; windFromDeg: number; rainPct: number; uv: number; code: number; cape: number; at: number }
export interface WeatherAlert { id: string; event: string; severity: string; headline: string; description: string; expires: string }
export type Risk = 'low' | 'elevated' | 'high';
export interface LightningAssessment { risk: Risk; reasons: string[] }
export interface LightningProvider { nearestStrikeMiles(lat: number, lng: number): Promise<number | null> }

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const OPEN_METEO = env.VITE_OPEN_METEO_URL ?? 'https://api.open-meteo.com';
const NWS = env.VITE_NWS_URL ?? 'https://api.weather.gov';
const RAINVIEWER = env.VITE_RAINVIEWER_URL ?? 'https://api.rainviewer.com';
export const WEATHER_ORIGINS = [OPEN_METEO, NWS, RAINVIEWER, 'https://tilecache.rainviewer.com'];

const round = (n: number) => Math.round(n * 100) / 100; // ≈ 1 km

export async function fetchConditions(lat: number, lng: number, fetchFn: typeof fetch = fetch): Promise<Conditions> {
  const q = new URLSearchParams({
    latitude: String(round(lat)), longitude: String(round(lng)), timezone: 'auto', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
    current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability,uv_index,cape',
  });
  const res = await fetchFn(`${OPEN_METEO}/v1/forecast?${q}`);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const c = (await res.json()).current ?? {};
  return {
    tempF: Math.round(c.temperature_2m ?? 0), windMph: Math.round(c.wind_speed_10m ?? 0), windFromDeg: Math.round(c.wind_direction_10m ?? 0),
    rainPct: Math.round(c.precipitation_probability ?? 0), uv: Math.round(c.uv_index ?? 0), code: c.weather_code ?? 0, cape: c.cape ?? 0, at: Date.now(),
  };
}

/** NWS alerts for a US point; [] outside the US or on failure. */
export async function fetchAlerts(lat: number, lng: number, fetchFn: typeof fetch = fetch): Promise<WeatherAlert[]> {
  try {
    const res = await fetchFn(`${NWS}/alerts/active?point=${round(lat)},${round(lng)}`, { headers: { Accept: 'application/geo+json' } });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.features ?? []).slice(0, 10).map((f: { id: string; properties: Record<string, string> }) => ({
      id: f.id, event: String(f.properties.event ?? ''), severity: String(f.properties.severity ?? ''),
      headline: String(f.properties.headline ?? f.properties.event ?? '').slice(0, 200), description: String(f.properties.description ?? '').slice(0, 800),
      expires: String(f.properties.expires ?? ''),
    }));
  } catch { return []; }
}

/** WMO codes 95/96/99 = thunderstorm (with/without hail). */
export const isThunder = (code: number) => code === 95 || code === 96 || code === 99;

export function lightningRisk(c: Pick<Conditions, 'code' | 'cape' | 'rainPct'> | null, alerts: WeatherAlert[], strikeMiles: number | null = null): LightningAssessment {
  const reasons: string[] = [];
  let risk: Risk = 'low';
  const warn = alerts.find((a) => /thunderstorm warning|tornado warning|lightning/i.test(a.event));
  const watch = alerts.find((a) => /thunderstorm watch|tornado watch/i.test(a.event));
  if (strikeMiles !== null && strikeMiles <= 10) { risk = 'high'; reasons.push(`Lightning ${strikeMiles.toFixed(0)} mi away`); }
  if (c && isThunder(c.code)) { risk = 'high'; reasons.push('Thunderstorm reported at the course'); }
  if (warn) { risk = 'high'; reasons.push(warn.event); }
  if (risk !== 'high') {
    if (watch) { risk = 'elevated'; reasons.push(watch.event); }
    if (c && c.cape >= 1000 && c.rainPct >= 40) { risk = 'elevated'; reasons.push(`Unstable air (CAPE ${Math.round(c.cape)}) with ${c.rainPct}% rain chance`); }
  }
  return { risk, reasons };
}

export interface RadarFrames { host: string; frames: { time: number; path: string }[] }
export async function fetchRadarFrames(fetchFn: typeof fetch = fetch): Promise<RadarFrames> {
  const res = await fetchFn(`${RAINVIEWER}/public/weather-maps.json`);
  if (!res.ok) throw new Error(`radar ${res.status}`);
  const j = await res.json();
  return { host: j.host, frames: (j.radar?.past ?? []).slice(-8) };
}
/** Tile template for one radar frame (color scheme 2 = universal blue, smoothed, with snow). */
export const radarTiles = (r: RadarFrames, i: number) => `${r.host}${r.frames[i].path}/256/{z}/{x}/{y}/2/1_1.png`;
