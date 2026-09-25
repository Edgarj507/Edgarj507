import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { COURSE, greenCenter } from '../data/course';
import { consensus, offsetPoint, pinOffset, type PinConsensus, type PinReport } from '../../supabase/functions/_shared/pins.ts';

export interface PinFeed {
  /** Pin offset from green centre along the line of play (m). Zero when no community data. */
  depthM: number;
  lateralM: number;
  live: PinConsensus | null;
  /** Share this device's cup fix. Resolves to an error code or null. */
  report: () => Promise<string | null>;
}

// Deterministic PRNG so the simulated community is stable for a hole within a day.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const dayKey = (t: number) => Math.floor(t / 86_400_000);

/**
 * Stand-in for the live network when signed out/offline: a handful of players' reports around
 * today's cup (LiDAR ≈0.3 m, GPS ≈4 m, occasionally a bad actor), fed through the same consensus.
 */
export function simulatedReports(holeNo: number, bearingDeg: number, now: number): PinReport[] {
  const r = rng(holeNo * 7919 + dayKey(now));
  const g = greenCenter(holeNo);
  const depth = Math.round((r() * 12 - 6) * 2) / 2;
  const lateral = Math.round((r() * 8 - 4) * 2) / 2;
  const cup = offsetPoint(offsetPoint(g, bearingDeg, depth), bearingDeg + 90, lateral);
  const n = 1 + Math.floor(r() * 7); // 1–7 players have reported today
  const out: PinReport[] = [];
  for (let i = 0; i < n; i++) {
    const lidar = r() < 0.7;
    const acc = lidar ? 0.3 : 4;
    const p = offsetPoint(cup, r() * 360, r() * acc);
    out.push({ userId: `sim-${i}`, ...p, accuracyM: acc, source: lidar ? 'lidar' : 'gps', reportedAt: now - Math.floor(r() * 5 * 3600_000) });
  }
  if (r() < 0.25) out.push({ userId: 'sim-spoof', ...offsetPoint(cup, r() * 360, 20), accuracyM: 0.5, source: 'lidar', reportedAt: now - 60_000 });
  return out;
}

interface Opts {
  holeNo: number;
  bearingDeg: number;
  enabled: boolean;
  /** Server round id; when set (signed in + synced) the live network is used. */
  remoteRoundId?: string;
}

export function usePinFeed({ holeNo, bearingDeg, enabled, remoteRoundId }: Opts): PinFeed {
  const cloud = !!supabase && !!remoteRoundId;
  const [remote, setRemote] = useState<PinConsensus | null>(null);
  const [mine, setMine] = useState<PinReport[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Cloud: current consensus + realtime updates for this hole.
  useEffect(() => {
    if (!cloud || !enabled || !supabase) return;
    const sb = supabase;
    const toConsensus = (row: Record<string, unknown> | null): PinConsensus | null =>
      row ? { lat: Number(row.lat), lng: Number(row.lng), reports: Number(row.reports), spreadM: Number(row.spread_m), status: row.status as PinConsensus['status'], updatedAt: Date.parse(String(row.updated_at)) } : null;
    let alive = true;
    sb.from('pin_positions').select('*').eq('course_name', COURSE.name).eq('hole', holeNo).maybeSingle()
      .then(({ data }) => alive && setRemote(toConsensus(data)));
    const ch = sb
      .channel(`pins:${holeNo}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pin_positions', filter: `hole=eq.${holeNo}` }, (p) => {
        const row = (p.new ?? null) as Record<string, unknown> | null;
        if (row && row.course_name === COURSE.name) setRemote(toConsensus(row));
      })
      .subscribe();
    return () => { alive = false; void sb.removeChannel(ch); };
  }, [cloud, enabled, holeNo]);

  // Local: refresh the simulated network each minute.
  useEffect(() => {
    if (cloud || !enabled) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [cloud, enabled]);

  const local = useMemo(
    () => (cloud || !enabled ? null : consensus([...simulatedReports(holeNo, bearingDeg, now), ...mine.filter((m) => m.userId === `me-${holeNo}`)], now)),
    [cloud, enabled, holeNo, bearingDeg, now, mine],
  );

  const live = enabled ? (cloud ? remote : local) : null;
  const off = live ? pinOffset(greenCenter(holeNo), live, bearingDeg) : { depthM: 0, lateralM: 0 };

  const report = useCallback(async (): Promise<string | null> => {
    if (cloud && supabase) {
      // On the real network the fix comes from the device: stand at the cup and share GPS.
      // (Native builds replace this with the ARKit/LiDAR cup vector for ≈0.3 m accuracy.)
      const fix = await new Promise<GeolocationPosition | null>((res) =>
        navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }) : res(null));
      if (!fix) return 'location_unavailable';
      const { error } = await supabase.rpc('report_pin', {
        p_round: remoteRoundId, p_hole: holeNo, p_lat: fix.coords.latitude, p_lng: fix.coords.longitude,
        p_accuracy: Math.max(0.5, fix.coords.accuracy), p_source: 'gps',
      });
      return error ? (error.message.match(/[a-z_]+/)?.[0] ?? 'failed') : null;
    }
    // Offline demo: a simulated LiDAR fix on today's consensus cup.
    const base = live ?? greenCenter(holeNo);
    const t = Date.now();
    setMine((m) => [...m.filter((x) => x.userId !== `me-${holeNo}`), { userId: `me-${holeNo}`, ...offsetPoint(base, Math.random() * 360, 0.15), accuracyM: 0.3, source: 'lidar', reportedAt: t }]);
    setNow(t);
    return null;
  }, [cloud, remoteRoundId, holeNo, live]);

  return { depthM: off.depthM, lateralM: off.lateralM, live, report };
}
