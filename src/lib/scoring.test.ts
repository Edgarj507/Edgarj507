import { mockPartnerScore, stablefordPoints, summarize } from './scoring';

const pars = [4, 5, 3, 4, 4];

describe('stableford', () => {
  it('awards 2 for par, +1 per stroke under, floors at 0', () => {
    expect(stablefordPoints(4, 4)).toBe(2);
    expect(stablefordPoints(3, 4)).toBe(3);
    expect(stablefordPoints(7, 4)).toBe(0);
  });
  it('totals played holes only', () => {
    const s = summarize({ format: 'Stableford', pars, mine: [4, 4, null, 6], partner: [] });
    expect(s.headline).toBe('5 pts');
    expect(s.holes[2]).toBeNull();
  });
});

describe('match play', () => {
  it('tracks holes up/down vs opponent', () => {
    const s = summarize({ format: 'Match Play', pars, mine: [4, 4, 3, null, null], partner: [5, 5, 3, 4, 4], partnerName: 'Jordan' });
    expect(s.headline).toBe('2 UP');
    expect(s.caption).toBe('vs Jordan');
    expect(s.holes.map((h) => h?.cell)).toEqual(['W', 'W', 'H', undefined, undefined]);
  });
  it('closes out when lead exceeds holes left', () => {
    const s = summarize({ format: 'Match Play', pars: [4, 4, 4], mine: [3, 3, null], partner: [4, 4, 4], partnerName: 'J' });
    expect(s.headline).toBe('2&1');
    expect(s.caption).toMatch(/^Won/);
  });
  it('solo match play is against par', () => {
    expect(summarize({ format: 'Match Play', pars, mine: [5, null, null, null, null], partner: [] }).headline).toBe('1 DN');
  });
});

describe('best ball', () => {
  it('uses the lower of the two scores', () => {
    const s = summarize({ format: 'Best Ball', pars, mine: [5, 5], partner: [4, 6], partnerName: 'J' });
    expect(s.holes.map((h) => h?.cell)).toEqual(['4', '5']);
    expect(s.headline).toBe('E');
  });
});

describe('stroke-based formats', () => {
  it('reports to-par with no extra column', () => {
    const s = summarize({ format: 'Scramble', pars, mine: [3, 5, null, null], partner: [] });
    expect(s.headline).toBe('-1');
    expect(s.column).toBeNull();
  });
});

it('mock partner scores are stable and near par', () => {
  const a = mockPartnerScore('f1', 3, 4);
  expect(mockPartnerScore('f1', 3, 4)).toBe(a);
  expect(a).toBeGreaterThanOrEqual(3);
  expect(a).toBeLessThanOrEqual(6);
});
