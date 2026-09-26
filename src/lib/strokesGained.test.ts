import { expectedStrokes, insights, strokesGained } from './strokesGained';

const s = (club: string) => ({ club, line: 0, playsLike: 0, t: 0 });

describe('strokes gained', () => {
  it('baseline tables are monotonic and match known anchors', () => {
    expect(expectedStrokes('green', 10 / 3)).toBeCloseTo(1.61, 2);
    expect(expectedStrokes('tee', 400)).toBeCloseTo(3.99, 1);
    expect(expectedStrokes('fairway', 150)).toBeGreaterThan(expectedStrokes('fairway', 100));
  });

  it('a Tour-average par sums to ~0 and categories add up', () => {
    // 400y par 4: drive to 150, approach to 20 ft, two-putt.
    const r = strokesGained([{ number: 1, par: 4, startYds: [400, 150, 20 / 3], shots: [s('Dr'), s('8i'), s('Putter'), s('Putter')].slice(0, 4) }]);
    expect(r.shots).toBe(4);
    expect(Object.values(r.byCategory).reduce((a, b) => a + b, 0)).toBeCloseTo(r.total, 6);
    expect(Math.abs(r.total)).toBeLessThan(1.1);
  });

  it('holing a long putt gains strokes putting', () => {
    const r = strokesGained([{ number: 3, par: 3, startYds: [180, 20], shots: [s('5i'), s('Putter')] }]);
    expect(r.byCategory.putting).toBeGreaterThan(0.9);
    expect(r.byCategory.approach).toBeLessThan(0);
    const tips = insights(r, { offTee: 'Off the tee', approach: 'Approach', aroundGreen: 'Around the green', putting: 'Putting' });
    expect(tips[0]).toMatch(/Putting/);
  });

  it('skips unplayed holes', () => {
    expect(strokesGained([{ number: 1, par: 4, startYds: [400], shots: [] }]).byHole).toEqual([]);
  });
});
