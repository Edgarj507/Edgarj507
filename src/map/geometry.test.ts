import { holeGeometry, ballPosition, aimPosition } from './geometry';
import { imageryProvider } from './providers';
import { COURSE, greenCenter } from '../data/course';
import { distanceM } from '../../supabase/functions/_shared/pins.ts';

const hole = COURSE.holes[0];

describe('hole geometry', () => {
  it('tee is the hole length back from the surveyed green, bearing points at the green', () => {
    const g = holeGeometry(hole);
    expect(g.green).toEqual(greenCenter(1));
    expect(g.lengthM).toBeCloseTo(hole.yards * 0.9144, 0);
    expect(Math.abs(((g.bearing - hole.bearingDeg + 540) % 360) - 180)).toBeLessThan(0.5);
  });
  it('ball sits pinYds short of the green; aim is layup or pin', () => {
    const g = holeGeometry(hole);
    const ball = ballPosition(g, 164);
    expect(distanceM(ball, g.green)).toBeCloseTo(164 * 0.9144, 0);
    expect(ballPosition(g, 9999)).toEqual(expect.objectContaining({ lat: expect.closeTo(g.tee.lat, 6) }));
    const pin = g.green;
    expect(aimPosition(g, ball, 164, pin)).toBe(pin);
    const layup = aimPosition(g, ballPosition(g, 412), 250, pin);
    expect(distanceM(ballPosition(g, 412), layup)).toBeCloseTo(250 * 0.9144, 0);
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
