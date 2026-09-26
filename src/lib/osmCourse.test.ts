import { buildCourse, estimatePar } from './osmCourse.mjs';

const way = (id: number, ref: string, coords: [number, number][], tags: Record<string, string> = {}) => ({
  type: 'way', id, tags: { golf: 'hole', ref, ...tags }, geometry: coords.map(([lat, lon]) => ({ lat, lon })),
});
const green = (lat: number, lon: number) => ({
  type: 'way', id: 99, tags: { golf: 'green' },
  geometry: [[lat - 1e-4, lon - 1e-4], [lat - 1e-4, lon + 1e-4], [lat + 1e-4, lon + 1e-4], [lat + 1e-4, lon - 1e-4]].map(([a, b]) => ({ lat: a, lon: b })),
});

describe('OSM course import', () => {
  it('keeps the longest line per hole, snaps to the green centroid, and flags par sources', () => {
    const c = buildCourse('Test', [
      way(1, '1', [[44, -92], [44.003, -92]]),                   // ~334 m
      way(2, '1', [[44.0015, -92], [44.003, -92]]),              // forward tee, shorter
      way(3, '2', [[44.01, -92], [44.0118, -92]], { par: '3' }),
      green(44.0031, -92.00005),
    ], { 1: 5 });
    expect(c.holes.map((h) => h.number)).toEqual([1, 2]);
    expect(c.holes[0].path[0]).toEqual([44, -92]);
    expect(c.holes[0].green).toEqual([44.0031, -92.00005]);
    expect(c.holes[0]).toMatchObject({ par: 5, parSource: 'manual' });
    expect(c.holes[1]).toMatchObject({ par: 3, parSource: 'osm' });
    expect(c.attribution).toMatch(/OpenStreetMap/);
  });
  it('estimates par from length', () => {
    expect([estimatePar(180), estimatePar(420), estimatePar(540)]).toEqual([3, 4, 5]);
  });
});
