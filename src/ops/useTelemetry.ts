import { useEffect, useRef, useState } from 'react';
import { metresOutside, GEOFENCE_BUFFER_M } from '../lib/geofence';
import { COURSE_BOUNDARY, type OpsAction } from './model';

export type TelemetryStatus =
  | 'off'          // not in a live event / not on a registered team: GPS is not even read for sharing
  | 'waiting'      // live, waiting for a first GPS fix
  | 'sharing'      // on the property (inside the boundary + 250 ft): broadcasting
  | 'off-property' // live but not (or no longer) on the property: nothing sent, last fix deleted
  | 'denied';      // location permission refused

const MIN_INTERVAL_MS = 15_000;
const MIN_MOVE_M = 8;

/**
 * Tournament location sharing with a hard geofence. Only while `active` (live event + this player
 * is on a registered team inside the event window) does it watch GPS, and every fix is checked
 * against the course boundary with a 250 ft drift buffer. Off property: the broadcast is severed
 * (`unping` deletes the last stored fix) and nothing is sent until the player is back on site.
 */
export function useTelemetry({ active, player, phone, dispatch }: { active: boolean; player: string; phone: string | null; dispatch: (a: OpsAction) => void }) {
  const [status, setStatus] = useState<TelemetryStatus>('off');
  const [outsideM, setOutsideM] = useState<number | null>(null);
  const last = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const sharing = useRef(false);

  useEffect(() => {
    const sever = () => {
      if (sharing.current && phone) dispatch({ type: 'unping', phone });
      sharing.current = false;
      last.current = null;
    };
    if (!active || !phone || typeof navigator === 'undefined' || !navigator.geolocation) {
      sever();
      setStatus('off');
      return;
    }
    setStatus('waiting');
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pt: [number, number] = [p.coords.latitude, p.coords.longitude];
        const out = metresOutside(pt, COURSE_BOUNDARY);
        setOutsideM(out);
        if (out > GEOFENCE_BUFFER_M) {
          sever(); // auto-kill switch
          setStatus('off-property');
          return;
        }
        const now = Date.now();
        const prev = last.current;
        const moved = prev ? Math.hypot((pt[0] - prev.lat) * 110_540, (pt[1] - prev.lng) * 80_000) : Infinity;
        if (!prev || now - prev.t >= MIN_INTERVAL_MS || moved >= MIN_MOVE_M) {
          dispatch({ type: 'ping', pos: { player, phone, lat: pt[0], lng: pt[1], at: now } });
          last.current = { lat: pt[0], lng: pt[1], t: now };
          sharing.current = true;
        }
        setStatus('sharing');
      },
      (e) => {
        sever();
        setStatus(e.code === e.PERMISSION_DENIED ? 'denied' : 'waiting');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    const onHide = () => { if (document.visibilityState === 'hidden') sever(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      navigator.geolocation.clearWatch(id);
      document.removeEventListener('visibilitychange', onHide);
      sever();
    };
  }, [active, phone, player, dispatch]);

  return { status, outsideM };
}
