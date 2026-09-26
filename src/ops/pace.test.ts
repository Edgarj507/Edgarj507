import { alongPath, demoGroups, placeGroups } from './pace';

describe('pace radar', () => {
  it('interpolates along a hole line', () => {
    const p: [number, number][] = [[0, 0], [0, 0.001], [0.001, 0.001]];
    expect(alongPath(p, 0)).toEqual([0, 0]);
    expect(alongPath(p, 1)).toEqual([0.001, 0.001]);
    const mid = alongPath(p, 0.5);
    expect(mid[0]).toBeCloseTo(0, 6);
    expect(mid[1]).toBeCloseTo(0.001, 6);
  });
  it('places groups on the course and flags slow ones', () => {
    const now = Date.UTC(2026, 8, 26, 17);
    const holes = Array.from({ length: 18 }, (_, i): [number, number][] => [[44 + i * 0.001, -92], [44 + i * 0.001, -92.001]]);
    const placed = placeGroups(demoGroups(now), holes, now);
    expect(placed).toHaveLength(16);
    expect(placed.some((g) => g.behindMin > 15 && g.at)).toBe(true);
    expect(placed.some((g) => !g.started)).toBe(true);
    for (const g of placed.filter((x) => x.at)) expect(g.at![0]).toBeCloseTo(44 + (g.hole - 1) * 0.001, 6);
  });
});
