import type { Hole } from '../data/course';
import { bearingDeg, distanceM, type LatLng } from '../../supabase/functions/_shared/pins.ts';

const YD = 0.9144;

export interface HoleGeometry {
  tee: LatLng;
  green: LatLng;
  /** Hole centre line, tee → green, following doglegs. */
  path: LatLng[];
  lengthM: number;
}

const toLL = ([lat, lng]: [number, number]): LatLng => ({ lat, lng });
const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });

/** Point `meters` back from the green along the hole line (clamped to the back tee). */
export function pointFromGreen(path: LatLng[], meters: number): LatLng {
  let left = Math.max(0, meters);
  for (let i = path.length - 1; i > 0; i--) {
    const seg = distanceM(path[i], path[i - 1]);
    if (left <= seg) return lerp(path[i], path[i - 1], seg ? left / seg : 0);
    left -= seg;
  }
  return path[0];
}

/** Real hole geometry: the mapped centre line, shortened at the tee end for forward tees. */
export function holeGeometry(hole: Hole): HoleGeometry {
  const full = hole.path.map(toLL);
  const green = toLL(hole.green);
  full[full.length - 1] = green;
  const fullM = full.slice(1).reduce((s, p, i) => s + distanceM(full[i], p), 0);
  const teeM = Math.min(hole.yards * YD, fullM);
  const tee = pointFromGreen(full, teeM);
  // Drop path vertices behind the selected tee.
  let acc = 0;
  const keep: LatLng[] = [green];
  for (let i = full.length - 1; i > 0; i--) {
    acc += distanceM(full[i], full[i - 1]);
    if (acc >= teeM) break;
    keep.unshift(full[i - 1]);
  }
  const path = [tee, ...keep];
  return { tee, green, path, lengthM: teeM };
}

/** Ball position: `pinYds` from the green along the hole line. */
export const ballPosition = (g: HoleGeometry, pinYds: number) => pointFromGreen(g.path, Math.min(pinYds * YD, g.lengthM));

/** Aim point: the pin when the shot reaches it, else `lineYds` further along the hole line (layup). */
export function aimPosition(g: HoleGeometry, pinYds: number, lineYds: number, pin: LatLng): LatLng {
  const remainingM = (pinYds - lineYds) * YD;
  return remainingM <= 1 ? pin : pointFromGreen(g.path, remainingM);
}

/** Direction of the current shot (ball → aim); used for map rotation, wind and pin offsets. */
export const shotBearing = (ball: LatLng, aim: LatLng) => bearingDeg(ball, aim);
