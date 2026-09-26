import { playsLike, recommendClub, windArrowDeg, windComponents } from './caddie';

const calm = { windFromDeg: 0, windMph: 0, tempF: 70, elevationDeltaYds: 0 };
const bag = [
  { label: '9i', carry: 140 },
  { label: '7i', carry: 165 },
  { label: '8i', carry: 152 },
  { label: '6i', carry: 176 },
];

describe('windComponents', () => {
  it('wind from target bearing is pure headwind', () => {
    const w = windComponents(90, 10, 90);
    expect(w.headwindMph).toBeCloseTo(10);
    expect(w.crosswindMph).toBeCloseTo(0);
  });
  it('wind from behind is tailwind', () => {
    expect(windComponents(270, 10, 90).headwindMph).toBeCloseTo(-10);
  });
});

describe('windArrowDeg', () => {
  it('tailwind points up the target line', () => expect(windArrowDeg(270, 90)).toBe(0));
  it('headwind points back at the golfer', () => expect(windArrowDeg(90, 90)).toBe(180));
});

describe('playsLike', () => {
  it('is identity in calm, flat, 70F', () => expect(playsLike(150, 0, calm).yards).toBe(150));
  it('headwind costs more than tailwind helps', () => {
    const into = playsLike(150, 0, { ...calm, windFromDeg: 0, windMph: 10 });
    const down = playsLike(150, 0, { ...calm, windFromDeg: 180, windMph: 10 });
    expect(into.windAdj).toBe(15);
    expect(down.windAdj).toBe(-7);
  });
  it('uphill adds, heat subtracts', () => {
    const r = playsLike(150, 0, { ...calm, elevationDeltaYds: 6, tempF: 90 });
    expect(r.elevAdj).toBe(6);
    expect(r.tempAdj).toBe(-3);
    expect(r.yards).toBe(153);
  });
  it('never negative', () => expect(playsLike(5, 0, { ...calm, elevationDeltaYds: -20 }).yards).toBe(0));
});

describe('recommendClub', () => {
  it('picks the shortest club that carries the number', () => expect(recommendClub(160, bag)?.label).toBe('7i'));
  it('falls back to the longest club', () => expect(recommendClub(250, bag)?.label).toBe('6i'));
  it('handles empty bag', () => expect(recommendClub(100, [])).toBeUndefined());
});
