import { bufferedBox, convexHull, courseBoundary, GEOFENCE_BUFFER_M, metresOutside, onProperty, type LL } from './geofence';
import { SOMERBY_DATA } from '../data/course';

// ~1 km square near Byron, MN.
const sq: LL[] = [[44.04, -92.64], [44.049, -92.64], [44.049, -92.6275], [44.04, -92.6275]];
const east = (m: number): LL => [44.0445, -92.6275 + m / (111_320 * Math.cos((44.0445 * Math.PI) / 180))];

describe('geofence', () => {
  it('hull drops interior points', () => {
    expect(convexHull([...sq, [44.045, -92.635]])).toHaveLength(4);
  });
  it('250 ft buffer absorbs GPS drift and the parking lot, nothing beyond', () => {
    expect(GEOFENCE_BUFFER_M).toBeCloseTo(250 * 0.3048, 3);
    expect(metresOutside([44.045, -92.635], sq)).toBe(0);
    expect(metresOutside(east(50), sq)).toBeCloseTo(50, 0);
    expect(onProperty(east(70), sq)).toBe(true);
    expect(onProperty(east(80), sq)).toBe(false);
  });
  it('real Somerby boundary: course is on property, a Rochester home is not', () => {
    const b = courseBoundary(SOMERBY_DATA.holes);
    expect(onProperty(SOMERBY_DATA.holes[0].path[0], b)).toBe(true);
    expect(onProperty([44.0121, -92.4802], b)).toBe(false);
    const box = bufferedBox(b);
    expect(box.minLat).toBeLessThan(SOMERBY_DATA.center[0]);
    expect(box.maxLng).toBeGreaterThan(SOMERBY_DATA.center[1]);
  });
});

it('server geofence box matches the app boundary (+250 ft)', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../../supabase/migrations/20260928000000_tournament_ops.sql', import.meta.url), 'utf8');
  const box = JSON.parse(sql.match(/set geofence = '(\{[^']+\})'/)![1]);
  const b = bufferedBox(courseBoundary(SOMERBY_DATA.holes));
  expect(box.min_lat).toBeCloseTo(b.minLat, 4);
  expect(box.max_lat).toBeCloseTo(b.maxLat, 4);
  expect(box.min_lng).toBeCloseTo(b.minLng, 4);
  expect(box.max_lng).toBeCloseTo(b.maxLng, 4);
});
