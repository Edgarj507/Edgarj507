import { alongPath, eventGroups, placeGroups } from './pace';
import type { Registration } from './model';

const reg = (i: number): Registration => ({
  id: `team-${i}`, eventId: 'e', teamName: `Team ${i}`, total: 600, paid: 600, paidAt: 0, teeTime: '',
  captain: { first: 'Cap', last: `Smith${i}`, phone: '', email: '' },
  roster: [{ first: 'A', last: 'B', phone: '', email: '' }, { first: '', last: '', phone: '', email: '' }, { first: '', last: '', phone: '', email: '' }],
});

describe('pace radar', () => {
  it('interpolates along a hole line', () => {
    const p: [number, number][] = [[0, 0], [0, 0.001], [0.001, 0.001]];
    expect(alongPath(p, 0)).toEqual([0, 0]);
    expect(alongPath(p, 1)).toEqual([0.001, 0.001]);
    const mid = alongPath(p, 0.5);
    expect(mid[0]).toBeCloseTo(0, 6);
    expect(mid[1]).toBeCloseTo(0.001, 6);
  });
  it('shotgun-starts every team on its own hole and flags slow groups', () => {
    const t0 = Date.UTC(2026, 9, 17, 13);
    const groups = eventGroups(Array.from({ length: 20 }, (_, i) => reg(i)), t0, 14);
    expect(groups.map((g) => g.startHole).slice(0, 3)).toEqual([1, 2, 3]);
    expect(groups[18].startHole).toBe(1);
    expect(groups[0].name).toBe('Group 1 (Smith0)');
    expect(groups[0].players).toEqual(['Cap Smith0', 'A B']);
    const holes = Array.from({ length: 18 }, (_, i): [number, number][] => [[44 + i * 0.001, -92], [44 + i * 0.001, -92.001]]);
    const before = placeGroups(groups, holes, t0 - 60_000, 14);
    expect(before.every((g) => !g.started && !g.at)).toBe(true); // nothing to track before the start
    const placed = placeGroups(groups, holes, t0 + 150 * 60_000, 14);
    expect(placed.some((g) => g.behindMin > 15)).toBe(true);
    expect(placed.some((g) => g.behindMin <= 0)).toBe(true);
    for (const g of placed.filter((x) => x.at)) expect(g.at![0]).toBeCloseTo(44 + (g.hole - 1) * 0.001, 6);
  });
});
