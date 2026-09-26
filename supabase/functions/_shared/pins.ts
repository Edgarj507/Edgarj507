/**
 * Crowdsourced pin (cup) positions. Pure math shared by the app and mirrored in SQL
 * (migrations/20260925010000_pin_tracking.sql).
 *
 * A report is a cup coordinate computed on-device: GPS fix of the phone + (optionally) a LiDAR
 * range/bearing to the cup from Putt View. LiDAR reports are far more precise (≈0.3 m) than GPS
 * alone (≈3–8 m), so consensus weights by reported accuracy.
 */

export interface LatLng { lat: number; lng: number }

export interface PinReport extends LatLng {
  userId: string;
  /** Horizontal accuracy (m, 1σ) reported by the device. */
  accuracyM: number;
  source: 'lidar' | 'gps';
  /** epoch ms */
  reportedAt: number;
}

export interface PinConsensus extends LatLng {
  reports: number;
  /** Robust spread of accepted reports around the consensus (m). */
  spreadM: number;
  status: 'verified' | 'provisional';
  updatedAt: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LatLng, b: LatLng) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point `dist` metres from `p` along `bearing` (degrees true). */
export function offsetPoint(p: LatLng, bearing: number, dist: number): LatLng {
  const d = dist / R;
  const b = rad(bearing);
  const lat1 = rad(p.lat);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = rad(p.lng) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

/**
 * Pin position relative to the green centre as seen along the line of play.
 * depthM > 0 → pin is BACK of centre; lateralM > 0 → pin is RIGHT of centre.
 */
export function pinOffset(greenCenter: LatLng, pin: LatLng, playBearingDeg: number) {
  const d = distanceM(greenCenter, pin);
  if (d < 0.01) return { depthM: 0, lateralM: 0 };
  const rel = rad(bearingDeg(greenCenter, pin) - playBearingDeg);
  return { depthM: d * Math.cos(rel), lateralM: d * Math.sin(rel) };
}

/** Human label for an offset, e.g. "2m front", "3m back · 1m left". Sub-metre components are omitted. */
export function describeOffset(depthM: number, lateralM: number, unit: 'm' | 'yd' = 'm') {
  const k = unit === 'yd' ? 1.09361 : 1;
  const parts: string[] = [];
  const d = Math.round(Math.abs(depthM) * k);
  const l = Math.round(Math.abs(lateralM) * k);
  if (d >= 1) parts.push(`${d}${unit} ${depthM < 0 ? 'front' : 'back'}`);
  if (l >= 1) parts.push(`${l}${unit} ${lateralM < 0 ? 'left' : 'right'}`);
  return parts.length ? parts.join(' · ') : 'centre';
}

// Consensus parameters (kept in sync with the SQL implementation).
export const PIN_WINDOW_MS = 10 * 60 * 60 * 1000; // pins move daily; ignore reports older than 10 h
export const PIN_OUTLIER_M = 6; // reports further than this from the robust centre are rejected
export const PIN_VERIFIED_MIN = 3; // distinct reporters needed for "verified"
export const PIN_VERIFIED_SPREAD_M = 2.5;

/** Median with linear interpolation — identical to Postgres percentile_cont(0.5). */
function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const pos = (v.length - 1) / 2;
  const lo = Math.floor(pos);
  return v[lo] + (v[Math.ceil(pos)] - v[lo]) * (pos - lo);
}

/**
 * Robust consensus: newest report per user inside the window → median centre → drop outliers →
 * accuracy-weighted (1/σ²) mean of inliers. Returns null when there's nothing usable.
 */
export function consensus(reports: PinReport[], now: number): PinConsensus | null {
  const latest = new Map<string, PinReport>();
  for (const r of reports) {
    if (now - r.reportedAt > PIN_WINDOW_MS || r.reportedAt > now + 60_000) continue;
    if (!(r.accuracyM > 0 && r.accuracyM <= 10)) continue;
    const prev = latest.get(r.userId);
    if (!prev || r.reportedAt > prev.reportedAt) latest.set(r.userId, r);
  }
  const rs = [...latest.values()];
  if (!rs.length) return null;

  const centre = { lat: median(rs.map((r) => r.lat)), lng: median(rs.map((r) => r.lng)) };
  const inliers = rs.filter((r) => distanceM(centre, r) <= PIN_OUTLIER_M);
  if (!inliers.length) return null;

  const wi = inliers.map((r) => 1 / r.accuracyM ** 2);
  const sw = wi.reduce((a, b) => a + b, 0);
  const pin = {
    lat: inliers.reduce((a, r, i) => a + r.lat * wi[i], 0) / sw,
    lng: inliers.reduce((a, r, i) => a + r.lng * wi[i], 0) / sw,
  };
  const dists = inliers.map((r) => distanceM(pin, r)).sort((a, b) => a - b);
  const spreadM = dists[Math.floor(dists.length / 2)];
  return {
    ...pin,
    reports: inliers.length,
    spreadM,
    status: inliers.length >= PIN_VERIFIED_MIN && spreadM <= PIN_VERIFIED_SPREAD_M ? 'verified' : 'provisional',
    updatedAt: Math.max(...inliers.map((r) => r.reportedAt)),
  };
}

/**
 * Distance from the ball to the live pin, given the static distance to green centre and the
 * pin's offset from centre along the line of play.
 */
export function liveDistance(toCenter: number, depth: number, lateral: number) {
  return Math.sqrt((toCenter + depth) ** 2 + lateral ** 2);
}
