/**
 * Course geofence. Live location is shared only while a player is physically on the property:
 * inside the course boundary or within a 250 ft buffer of it, which absorbs phone GPS drift and
 * covers the parking lot on arrival. Outside it, nothing is sent.
 *
 * The boundary is the convex hull of every mapped hole (tee → green lines). Where OSM has the
 * course's own `leisure=golf_course` polygon it can be passed in instead.
 */
export type LL = [number, number]; // [lat, lng]

/** 250 feet in metres. */
export const GEOFENCE_BUFFER_M = 76.2;

interface XY { x: number; y: number }

function projector(origin: LL) {
  const kx = 111_320 * Math.cos((origin[0] * Math.PI) / 180);
  const ky = 110_540;
  return (p: LL): XY => ({ x: (p[1] - origin[1]) * kx, y: (p[0] - origin[0]) * ky });
}

/** Convex hull (Andrew's monotone chain) of [lat, lng] points, counter-clockwise. */
export function convexHull(points: LL[]): LL[] {
  const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (pts.length < 3) return pts;
  const cross = (o: LL, a: LL, b: LL) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const lower: LL[] = [], upper: LL[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export const courseBoundary = (holes: { path: LL[] }[]) => convexHull(holes.flatMap((h) => h.path));

function segDist(p: XY, a: XY, b: XY) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Metres outside the boundary (0 when inside). Ray-casting for containment, then the distance to
 * the nearest edge.
 */
export function metresOutside(pt: LL, boundary: LL[]): number {
  if (boundary.length < 3) return Infinity;
  const proj = projector(boundary[0]);
  const p = proj(pt);
  const poly = boundary.map(proj);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  if (inside) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** On the property = inside the boundary or within the GPS-drift buffer (250 ft) of it. */
export const onProperty = (pt: LL, boundary: LL[], bufferM = GEOFENCE_BUFFER_M) => metresOutside(pt, boundary) <= bufferM;

/** Axis-aligned box around the boundary grown by the buffer (what the server re-checks). */
export function bufferedBox(boundary: LL[], bufferM = GEOFENCE_BUFFER_M) {
  const lats = boundary.map((p) => p[0]), lngs = boundary.map((p) => p[1]);
  const dLat = bufferM / 110_540;
  const dLng = bufferM / (111_320 * Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180));
  return { minLat: Math.min(...lats) - dLat, maxLat: Math.max(...lats) + dLat, minLng: Math.min(...lngs) - dLng, maxLng: Math.max(...lngs) + dLng };
}
