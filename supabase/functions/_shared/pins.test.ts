import { bearingDeg, consensus, describeOffset, distanceM, liveDistance, offsetPoint, pinOffset, type PinReport } from './pins.ts';

const G = { lat: 52.7012, lng: -0.8531 }; // green centre
const NOW = 1_800_000_000_000;
const rep = (userId: string, p: { lat: number; lng: number }, over: Partial<PinReport> = {}): PinReport => ({
  userId, ...p, accuracyM: 0.5, source: 'lidar', reportedAt: NOW - 60_000, ...over,
});

describe('geo', () => {
  it('offsetPoint and distanceM agree', () => {
    const p = offsetPoint(G, 90, 10);
    expect(distanceM(G, p)).toBeCloseTo(10, 1);
    expect(bearingDeg(G, p)).toBeCloseTo(90, 0);
  });
  it('pinOffset resolves front/back/left/right along the line of play', () => {
    const play = 20; // golfer hits toward 20°
    const back = pinOffset(G, offsetPoint(G, play, 4), play);
    expect(back.depthM).toBeCloseTo(4, 1);
    expect(back.lateralM).toBeCloseTo(0, 1);
    const frontLeft = pinOffset(G, offsetPoint(offsetPoint(G, play + 180, 2), play - 90, 3), play);
    expect(frontLeft.depthM).toBeCloseTo(-2, 1);
    expect(frontLeft.lateralM).toBeCloseTo(-3, 1);
    expect(describeOffset(frontLeft.depthM, frontLeft.lateralM)).toBe('2m front · 3m left');
    expect(describeOffset(0.3, -0.2)).toBe('centre');
  });
  it('liveDistance adds depth and lateral geometrically', () => {
    expect(liveDistance(150, -2, 0)).toBe(148);
    expect(liveDistance(3, 0, 4)).toBe(5);
  });
});

describe('consensus', () => {
  const pin = offsetPoint(G, 200, 2); // true cup: 2 m toward 200°
  const near = (userId: string, b: number, d: number, over?: Partial<PinReport>) => rep(userId, offsetPoint(pin, b, d), over);

  it('verifies with 3+ tight reports and lands near the true cup', () => {
    const c = consensus([near('a', 0, 0.3), near('b', 120, 0.4), near('c', 240, 0.2)], NOW)!;
    expect(c.status).toBe('verified');
    expect(c.reports).toBe(3);
    expect(distanceM(c, pin)).toBeLessThan(0.5);
  });

  it('rejects a spoofed outlier and ignores stale / inaccurate reports', () => {
    const c = consensus([
      near('a', 0, 0.3), near('b', 90, 0.3), near('c', 180, 0.3),
      near('spoof', 45, 25),                                     // 25 m away → outlier
      near('old', 0, 0, { reportedAt: NOW - 11 * 3600_000 }),     // outside 10 h window
      near('bad', 0, 0, { accuracyM: 30 }),                        // GPS too poor
    ], NOW)!;
    expect(c.reports).toBe(3);
    expect(distanceM(c, pin)).toBeLessThan(0.5);
  });

  it('counts one report per user (latest wins) and weights LiDAR over GPS', () => {
    const c = consensus([
      near('a', 0, 5, { reportedAt: NOW - 3600_000 }),
      near('a', 0, 0.1),
      rep('g', offsetPoint(pin, 90, 3), { source: 'gps', accuracyM: 5 }),
    ], NOW)!;
    expect(c.reports).toBe(2);
    expect(c.status).toBe('provisional');
    expect(distanceM(c, pin)).toBeLessThan(0.3); // GPS report barely moves it
  });

  it('returns null without usable reports', () => expect(consensus([], NOW)).toBeNull());
});
