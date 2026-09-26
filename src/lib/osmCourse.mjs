// Pure transform: Overpass elements → course JSON. Shared by the importer and its test.
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
export function dist(a, b) {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const pathLen = (p) => p.slice(1).reduce((s, q, i) => s + dist(p[i], q), 0);
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const round6 = (p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];

/** Typical men's par by length (yards) when OSM has no par tag. */
export const estimatePar = (yds) => (yds <= 250 ? 3 : yds <= 480 ? 4 : 5);

export function buildCourse(name, elements, parOverrides = {}) {
  const pts = (e) => (e.geometry ?? []).map((g) => [g.lat, g.lon]);
  const greens = elements.filter((e) => e.tags?.golf === 'green' && e.geometry?.length > 2).map((e) => centroid(pts(e)));
  const byRef = new Map();
  for (const e of elements) {
    if (e.tags?.golf !== 'hole' || !e.tags.ref || !(e.geometry?.length >= 2)) continue;
    const ref = Number(e.tags.ref);
    if (!Number.isInteger(ref) || ref < 1 || ref > 18) continue;
    const path = pts(e);
    const cur = byRef.get(ref);
    // Several lines per hole = one per tee set; keep the longest (back tees).
    if (!cur || pathLen(path) > pathLen(cur.path)) byRef.set(ref, { path, par: Number(e.tags.par) || null });
  }
  const holes = [...byRef.entries()].sort((a, b) => a[0] - b[0]).map(([number, { path, par }]) => {
    const end = path[path.length - 1];
    // Green centre = centroid of the green polygon nearest the hole line's end (≤ 40 m), else the line end.
    const near = greens.map((g) => [g, dist(g, end)]).sort((a, b) => a[1] - b[1])[0];
    const green = near && near[1] <= 40 ? near[0] : end;
    const fullPath = [...path.slice(0, -1), green];
    const yards = Math.round(pathLen(fullPath) / 0.9144);
    const override = parOverrides[number];
    return {
      number,
      par: par ?? override ?? estimatePar(yards),
      parSource: par ? 'osm' : override ? 'manual' : 'estimated',
      yards,
      path: fullPath.map(round6),
      green: round6(green),
    };
  });
  return { name, source: 'OpenStreetMap', attribution: '© OpenStreetMap contributors', license: 'ODbL-1.0', holes };
}
