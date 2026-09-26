export interface Conditions {
  /** Direction wind blows FROM, degrees true (meteorological convention). */
  windFromDeg: number;
  windMph: number;
  tempF: number;
  /** Target elevation minus ball elevation, yards. Positive = uphill. */
  elevationDeltaYds: number;
}

export interface PlaysLike {
  yards: number;
  windAdj: number;
  elevAdj: number;
  tempAdj: number;
  /** + = headwind, - = tailwind (mph along the target line). */
  headwindMph: number;
  /** + = wind pushing right-to-left... sign follows sin(); magnitude is what matters for UI. */
  crosswindMph: number;
}

export interface Club {
  label: string;
  carry: number;
}

const HEAD_PCT_PER_MPH = 0.01;
const TAIL_PCT_PER_MPH = 0.005;
const TEMP_PCT_PER_F = 0.001;
const TEMP_BASELINE_F = 70;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

export function windComponents(windFromDeg: number, windMph: number, shotBearingDeg: number) {
  const rel = toRad(windFromDeg - shotBearingDeg);
  return { headwindMph: windMph * Math.cos(rel), crosswindMph: windMph * Math.sin(rel) };
}

/** Rotation (deg, clockwise from "up the target line") for a wind arrow drawn in shot-relative space. */
export function windArrowDeg(windFromDeg: number, shotBearingDeg: number) {
  return norm360(windFromDeg + 180 - shotBearingDeg);
}

export function playsLike(lineYds: number, shotBearingDeg: number, c: Conditions): PlaysLike {
  const { headwindMph, crosswindMph } = windComponents(c.windFromDeg, c.windMph, shotBearingDeg);
  const windPct = headwindMph >= 0 ? headwindMph * HEAD_PCT_PER_MPH : headwindMph * TAIL_PCT_PER_MPH;
  const windAdj = Math.round(lineYds * windPct);
  const elevAdj = Math.round(c.elevationDeltaYds);
  const tempAdj = Math.round(-lineYds * (c.tempF - TEMP_BASELINE_F) * TEMP_PCT_PER_F);
  return {
    yards: Math.max(0, lineYds + windAdj + elevAdj + tempAdj),
    windAdj,
    elevAdj,
    tempAdj,
    headwindMph,
    crosswindMph,
  };
}

/** Shortest club whose carry covers the target; longest club if nothing reaches. */
export function recommendClub(targetYds: number, bag: readonly Club[]): Club | undefined {
  if (bag.length === 0) return undefined;
  const sorted = [...bag].sort((a, b) => a.carry - b.carry);
  return sorted.find((c) => c.carry >= targetYds) ?? sorted[sorted.length - 1];
}
