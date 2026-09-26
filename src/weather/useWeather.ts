import { useEffect, useRef, useState } from 'react';
import { fetchAlerts, fetchConditions, lightningRisk, type Conditions, type LightningAssessment, type WeatherAlert } from './weather';
import { haptic } from '../lib/haptics';

/** Poll conditions + alerts for a point (default every 5 minutes). */
export function useWeather(lat: number | null, lng: number | null, intervalMs = 5 * 60_000) {
  const [conditions, setConditions] = useState<Conditions | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (lat == null || lng == null) return;
    let alive = true;
    const load = async () => {
      try {
        const [c, a] = await Promise.all([fetchConditions(lat, lng), fetchAlerts(lat, lng)]);
        if (!alive) return;
        setConditions(c); setAlerts(a); setError(false);
      } catch { if (alive) setError(true); }
    };
    void load();
    const id = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [lat == null ? null : Math.round(lat * 100), lng == null ? null : Math.round(lng * 100), intervalMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const lightning: LightningAssessment = lightningRisk(conditions, alerts);
  return { conditions, alerts, lightning, error };
}

/**
 * Personal weather guard for golfers, including at courses that don't run Exclusive.Golf: uses
 * the device's GPS (or the course location) to check storms during a round and alerts on the
 * phone. Location is used only to look up weather (rounded to ~1 km); nothing is shared with
 * the course.
 */
export function useWeatherGuard(active: boolean, fallback: { lat: number; lng: number }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    if (!navigator.geolocation) { setPos(fallback); return; }
    navigator.geolocation.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setPos(fallback), { maximumAge: 10 * 60_000, timeout: 10_000 });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = useWeather(active ? pos?.lat ?? null : null, active ? pos?.lng ?? null : null);
  const [dismissed, setDismissed] = useState(0);
  const last = useRef(0);
  const alarm = active && w.lightning.risk === 'high' && Date.now() - dismissed > 30 * 60_000;
  useEffect(() => {
    if (!alarm || Date.now() - last.current < 30 * 60_000) return;
    last.current = Date.now();
    haptic('error');
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      new Notification('⚡ Lightning risk — seek shelter', { body: w.lightning.reasons.join(' · '), tag: 'eg-lightning' });
    }
  }, [alarm, w.lightning.reasons]);
  return { ...w, alarm, dismiss: () => setDismissed(Date.now()), source: pos ? 'gps' : 'course' };
}
