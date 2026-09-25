import { greenCenter, type Hole } from '../data/course';
import { bearingDeg, distanceM, offsetPoint, type LatLng } from '../../supabase/functions/_shared/pins.ts';

const YD = 0.9144;

export interface HoleGeometry {
  tee: LatLng;
  green: LatLng;
  /** Bearing tee → green (map is rotated so this points up). */
  bearing: number;
  lengthM: number;
}

/**
 * Tee/green positions for a hole. Greens come from course survey data (greenCenter); the tee is
 * placed back along the hole's bearing by its yardage. Replace with surveyed tee coordinates
 * (e.g. OSM golf=hole ways) when available — nothing else needs to change.
 */
export function holeGeometry(hole: Hole): HoleGeometry {
  const green = greenCenter(hole.number);
  const tee = offsetPoint(green, (hole.bearingDeg + 180) % 360, hole.yards * YD);
  return { tee, green, bearing: bearingDeg(tee, green), lengthM: distanceM(tee, green) };
}

/** Where the ball is for the current lie: `pinYds` short of the green along the hole line. */
export function ballPosition(g: HoleGeometry, pinYds: number): LatLng {
  const remaining = Math.min(pinYds * YD, g.lengthM);
  return offsetPoint(g.green, (g.bearing + 180) % 360, remaining);
}

/** Aim point: `lineYds` from the ball toward the green (the pin when aiming at the flag). */
export function aimPosition(g: HoleGeometry, ball: LatLng, lineYds: number, pin: LatLng): LatLng {
  const toPin = distanceM(ball, pin);
  return lineYds * YD >= toPin - 1 ? pin : offsetPoint(ball, bearingDeg(ball, g.green), lineYds * YD);
}
