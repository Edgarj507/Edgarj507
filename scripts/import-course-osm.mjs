#!/usr/bin/env node
/**
 * Import a course's hole geometry from OpenStreetMap (golf=hole ways, golf=green polygons).
 *
 *   node scripts/import-course-osm.mjs "<Course name>" <lat> <lng> <out.json> [radiusM] [--par 12=4,...]
 *   (Node ≥ 22 behind a proxy: prefix with NODE_USE_ENV_PROXY=1)
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 — keep the attribution in the app.
 * Pars come from the hole's `par` tag; missing pars are estimated from length and flagged.
 */
import { writeFileSync } from 'node:fs';
import { buildCourse } from '../src/lib/osmCourse.mjs';

const args = process.argv.slice(2);
const parFlag = args.indexOf('--par');
// Manual par corrections (e.g. from the official scorecard) for holes OSM doesn't tag.
const parOverrides = parFlag >= 0 ? Object.fromEntries(args.splice(parFlag, 2)[1].split(',').map((kv) => kv.split('=').map(Number))) : {};
const [name, lat, lng, out, radius = '2500'] = args;
if (!name || !lat || !lng || !out) {
  console.error('usage: import-course-osm.mjs "<Course name>" <lat> <lng> <out.json> [radiusM]');
  process.exit(2);
}
const q = `[out:json][timeout:90];(nwr(around:${radius},${lat},${lng})["golf"~"^(hole|green|tee)$"];);out geom tags;`;
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'exclusive-golf-course-import' },
  body: new URLSearchParams({ data: q }),
});
if (!res.ok) throw new Error(`Overpass ${res.status}`);
const course = buildCourse(name, (await res.json()).elements, parOverrides);
writeFileSync(out, JSON.stringify(course, null, 1) + '\n');
const par = course.holes.reduce((a, h) => a + h.par, 0);
console.log(`✓ ${course.holes.length} holes, par ${par}, ${course.holes.filter((h) => h.parSource === 'estimated').length} pars estimated → ${out}`);
