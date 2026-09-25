import { aimPosition, ballPosition, holeGeometry, pointFromGreen, shotBearing } from './geometry';
import { imageryProvider } from './providers';
import { COURSE, greenCenter, holesFor } from '../data/course';
import { distanceM } from '../../supabase/functions/_shared/pins.ts';

describe('real hole geometry (Somerby, OSM)', () => {
  it('uses the mapped green and a tee the hole length back along the (dogleg) line', () => {
    const hole = COURSE.holes[0];
    const g = holeGeometry(hole);
    expect(g.green).toEqual(greenCenter(1));
    expect(g.lengthM).toBeCloseTo(hole.yards * 0.9144, 0);
    const along = g.path.slice(1).reduce((s, p, i) => s + distanceM(g.path[i], p), 0);
    expect(along).toBeCloseTo(g.lengthM, 0);
    expect(hole.path.length).toBeGreaterThan(2); // hole 1 is a dogleg in OSM
  });

  it('forward tees start further up the same line', () => {
    const back = holeGeometry(holesFor('black')[0]);
    const red = holeGeometry(holesFor('red')[0]);
    expect(red.lengthM).toBeLessThan(back.lengthM);
    expect(distanceM(red.tee, pointFromGreen(back.path, red.lengthM))).toBeLessThan(1);
  });

  it('ball and aim follow the lie', () => {
    const g = holeGeometry(COURSE.holes[0]);
    const ball = ballPosition(g, 300);
    const layup = aimPosition(g, 300, 250, g.green);
    expect(distanceM(layup, g.green)).toBeLessThan(50 * 0.9144 + 5);
    expect(aimPosition(g, 150, 150, g.green)).toBe(g.green);
    expect(shotBearing(ball, layup)).toBeGreaterThanOrEqual(0);
  });
});

describe('imageryProvider', () => {
  it('defaults to Esri, uses Mapbox with a token, can be disabled', () => {
    expect(imageryProvider({})?.id).toBe('esri');
    const mb = imageryProvider({ VITE_MAPBOX_TOKEN: 'pk.abc' })!;
    expect(mb.id).toBe('mapbox');
    expect(mb.tiles[0]).toContain('access_token=pk.abc');
    expect(imageryProvider({ VITE_MAP_PROVIDER: 'none' })).toBeNull();
    expect(imageryProvider({ VITE_MAPBOX_TOKEN: 'pk.abc', VITE_MAP_PROVIDER: 'esri' })?.id).toBe('esri');
  });
});
