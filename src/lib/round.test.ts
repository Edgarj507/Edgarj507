import { fmtToPar, HOLES, isRoundState, newRound, roundReducer, totals } from './round';
import { COURSE, lieFor, planLies } from '../data/course';

const shot = { club: '7i', line: 160, playsLike: 162, t: 0 };

describe('roundReducer', () => {
  it('logs and undoes on the current hole only', () => {
    let s = roundReducer(newRound(), { type: 'goto', hole: 3 });
    s = roundReducer(s, { type: 'log', shot });
    s = roundReducer(s, { type: 'log', shot });
    expect(s.shots[3]).toHaveLength(2);
    expect(s.shots[2]).toHaveLength(0);
    s = roundReducer(s, { type: 'undo' });
    expect(s.shots[3]).toHaveLength(1);
  });
  it('undo on empty hole is a no-op', () => {
    const s = newRound();
    expect(roundReducer(s, { type: 'undo' })).toBe(s);
  });
  it('next clamps at hole 18; goto rejects out of range', () => {
    let s = roundReducer(newRound(), { type: 'goto', hole: HOLES - 1 });
    expect(roundReducer(s, { type: 'next' }).current).toBe(HOLES - 1);
    s = roundReducer(s, { type: 'goto', hole: 99 });
    expect(s.current).toBe(HOLES - 1);
  });
});

describe('isRoundState', () => {
  it('accepts a fresh round and rejects junk', () => {
    expect(isRoundState(newRound())).toBe(true);
    expect(isRoundState({ v: 2, current: 40, shots: [] })).toBe(false);
    expect(isRoundState(null)).toBe(false);
  });
});

describe('totals', () => {
  it('counts only played holes toward par', () => {
    const pars = COURSE.holes.map((h) => h.par);
    const shots = newRound().shots;
    shots[0] = [shot, shot, shot, shot, shot]; // par 4 → +1
    shots[2] = [shot, shot]; // par 3 → -1
    expect(totals(shots, pars)).toEqual({ strokes: 7, parPlayed: 7, toPar: 0, thru: 2 });
    expect(fmtToPar(1)).toBe('+1');
    expect(fmtToPar(0)).toBe('E');
  });
});

describe('course', () => {
  it('is a par-72, 18-hole layout', () => {
    expect(COURSE.holes).toHaveLength(18);
    expect(COURSE.holes.reduce((a, h) => a + h.par, 0)).toBe(72);
  });
  it('plans lies that approach the pin and clamp at the end', () => {
    const lies = planLies(538, 2);
    expect(lies[0]).toMatchObject({ line: 250, pin: 538 });
    for (let i = 1; i < lies.length; i++) expect(lies[i].pin).toBeLessThan(lies[i - 1].pin);
    const h = COURSE.holes[1];
    expect(lieFor(h, 99)).toBe(h.lies[h.lies.length - 1]);
  });
  it('par 3 tee shot aims at the pin', () => {
    const l = planLies(176, 3)[0];
    expect(l.line).toBe(l.pin);
  });
});
