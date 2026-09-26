import { downloadCourseData, nearbyCourses, searchCourses, toSummaries, DirectoryError, type Fetch } from './courseDirectory';
import { buildCourseModel } from '../data/course';
import { courseTileUrls } from '../courses/tiles';

const ROCH = { lat: 44.0121, lng: -92.4802 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('toSummaries', () => {
  it('sorts by distance, drops unnamed and duplicate entries', () => {
    const s = toSummaries([
      { type: 'way', id: 1, center: { lat: 44.05, lon: -92.63 }, tags: { name: 'Somerby Golf Club', 'addr:city': 'Byron' } },
      { type: 'way', id: 2, center: { lat: 44.02, lon: -92.44 }, tags: { name: 'Eastwood Golf Course' } },
      { type: 'node', id: 3, lat: 44.0201, lon: -92.4401, tags: { name: 'Eastwood Golf Course' } },
      { type: 'way', id: 4, center: { lat: 44.0, lon: -92.4 }, tags: {} },
      { type: 'way', id: 5, center: { lat: 44.1, lon: -92.5 }, tags: { name: '<b>Evil</b> Links' } },
    ], ROCH);
    expect(s.map((c) => c.name)).toEqual(['Eastwood Golf Course', 'bEvil/b Links', 'Somerby Golf Club']);
    expect(s[2]).toMatchObject({ id: 'osm-way-1', location: 'Byron' });
    expect(s[0].distanceM).toBeLessThan(s[2].distanceM!);
  });
});

describe('nearbyCourses', () => {
  it('uses Nominatim first, filtering disc golf and far results', async () => {
    const f: Fetch = async (u) => {
      expect(String(u)).toContain('bounded=1');
      return json([
        { osm_type: 'way', osm_id: 1, lat: '44.02', lon: '-92.47', name: 'Soldiers Field Golf Course', display_name: '', category: 'leisure', type: 'golf_course', address: { city: 'Rochester', state: 'Minnesota' } },
        { osm_type: 'way', osm_id: 2, lat: '44.03', lon: '-92.47', name: 'IBM Disc Golf Course', display_name: '', category: 'leisure', type: 'golf_course' },
        { osm_type: 'way', osm_id: 3, lat: '44.05', lon: '-92.63', name: 'Somerby Golf Club', display_name: '', category: 'leisure', type: 'golf_course', address: { town: 'Byron' } },
      ]);
    };
    const r = await nearbyCourses(ROCH, 50_000, f);
    expect(r.map((c) => [c.name, c.location])).toEqual([['Soldiers Field Golf Course', 'Rochester, Minnesota'], ['Somerby Golf Club', 'Byron']]);
    // Default: strict 10-mile radius — Somerby (≈8 mi) stays, a 12-mile course is dropped.
    const g: Fetch = async () => json([
      { osm_type: 'way', osm_id: 3, lat: '44.05', lon: '-92.63', name: 'Somerby Golf Club', display_name: '', category: 'leisure', type: 'golf_course' },
      { osm_type: 'way', osm_id: 4, lat: '44.18', lon: '-92.47', name: 'Far Away Golf Club', display_name: '', category: 'leisure', type: 'golf_course' },
    ]);
    expect((await nearbyCourses(ROCH, undefined, g)).map((c) => c.name)).toEqual(['Somerby Golf Club']);
  });

  it('falls back to Overpass, retries a busy server, then reports busy', async () => {
    let calls = 0;
    const f: Fetch = async (u) => { if (String(u).includes('nominatim')) return json([]); calls++; return new Response('busy', { status: 429 }); };
    vi.useFakeTimers();
    const p = nearbyCourses(ROCH, 40_000, f).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    vi.useRealTimers();
    expect(err).toBeInstanceOf(DirectoryError);
    expect(err.code).toBe('busy');
    expect(calls).toBe(3);
  });
});

describe('searchCourses', () => {
  it('keeps golf results and retries with " golf" when needed', async () => {
    const urls: string[] = [];
    const f: Fetch = async (u) => {
      urls.push(String(u));
      return String(u).includes('golf')
        ? json([
            { osm_type: 'way', osm_id: 9, lat: '36.568', lon: '-121.95', name: 'Pebble Beach Golf Links', display_name: 'x', category: 'leisure', type: 'golf_course', address: { village: 'Pebble Beach', state: 'California' } },
            { osm_type: 'node', osm_id: 8, lat: '36.5', lon: '-121.9', name: 'Pebble Beach Market', display_name: 'y', category: 'shop', type: 'supermarket', address: {} },
          ])
        : json([{ osm_type: 'node', osm_id: 7, lat: '1', lon: '1', name: 'Pebble Beach', display_name: 'z', category: 'place', type: 'village' }]);
    };
    const r = await searchCourses('Pebble Beach', ROCH, f);
    expect(urls).toHaveLength(2);
    expect(r).toEqual([expect.objectContaining({ id: 'osm-way-9', name: 'Pebble Beach Golf Links', location: 'Pebble Beach, California' })]);
    expect(await searchCourses('ab', ROCH, f)).toEqual([]);
  });
});

describe('downloadCourseData', () => {
  const hole = (id: number, ref: string, a: [number, number], b: [number, number]) =>
    ({ type: 'way', id, tags: { golf: 'hole', ref }, geometry: [{ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }] });
  it('falls back to a radius query when the course area has no holes, and builds a model', async () => {
    const queries: string[] = [];
    const nine = Array.from({ length: 9 }, (_, i) => hole(i + 1, String(i + 1), [44 + i * 0.004, -92], [44.003 + i * 0.004, -92]));
    const f: Fetch = async (_u, init) => {
      const q = String((init?.body as URLSearchParams).get('data'));
      queries.push(q);
      return json({ elements: q.includes('map_to_area') ? [] : nine });
    };
    const data = await downloadCourseData({ id: 'osm-way-5', name: 'Nine Hole CC', lat: 44, lng: -92 }, f);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('way(5)');
    const m = buildCourseModel(data);
    expect(m).toMatchObject({ holeCount: 9, playable: true });
    expect(m.holesFor('blue')).toHaveLength(9);
    const urls = courseTileUrls(data, { id: 'esri', tiles: ['https://t/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: '', origins: [] });
    expect(urls.length).toBeGreaterThan(20);
    expect(new Set(urls).size).toBe(urls.length);
  });
  it('errors when nothing is mapped', async () => {
    const f: Fetch = async () => json({ elements: [] });
    await expect(downloadCourseData({ id: 'osm-way-1', name: 'X', lat: 0, lng: 0 }, f)).rejects.toMatchObject({ code: 'no_holes' });
  });
});
