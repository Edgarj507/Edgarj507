import { fmtToPar, HOLES, holeRange, isRoundState, newRound, roundReducer, totals } from './round';
import { COURSE, holesFor, lieFor, planLies } from '../data/course';

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
    expect(isRoundState({ v: 2, current: 0, shots: [] })).toBe(false);
    expect(isRoundState({ ...newRound({ tee: 'blue', format: 'Stroke Play', length: 'back' }), current: 2 })).toBe(false);
    expect(isRoundState(null)).toBe(false);
  });
});

describe('totals', () => {
  it('counts only played holes toward par', () => {
    const pars = COURSE.holes.map((h) => h.par);
    const shots = newRound().shots;
    shots[0] = Array(pars[0] + 1).fill(shot); // bogey
    shots[2] = Array(pars[2] - 1).fill(shot); // birdie
    const parPlayed = pars[0] + pars[2];
    expect(totals(shots, pars)).toEqual({ strokes: parPlayed, parPlayed, toPar: 0, thru: 2 });
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

describe('round length', () => {
  it('back nine starts on hole 10 and cannot leave 10–18', () => {
    let s = newRound({ tee: 'blue', format: 'Stroke Play', length: 'back' });
    expect(s.current).toBe(9);
    expect(roundReducer(s, { type: 'goto', hole: 3 }).current).toBe(9);
    s = roundReducer(s, { type: 'goto', hole: 17 });
    expect(roundReducer(s, { type: 'next' }).current).toBe(17);
  });
  it('front nine stops at hole 9', () => {
    let s = newRound({ tee: 'blue', format: 'Stroke Play', length: 'front' });
    s = roundReducer(s, { type: 'goto', hole: 8 });
    expect(roundReducer(s, { type: 'next' }).current).toBe(8);
    expect(roundReducer(s, { type: 'goto', hole: 9 }).current).toBe(8);
    expect(holeRange('front')).toEqual({ start: 0, end: 8 });
  });
  it('start resets scores with the new config', () => {
    let s = roundReducer(newRound(), { type: 'log', shot });
    s = roundReducer(s, { type: 'start', config: { tee: 'red', format: 'Stableford', length: 'back' } });
    expect(s.shots.flat()).toHaveLength(0);
    expect(s.config.tee).toBe('red');
    expect(s.current).toBe(9);
  });
});

describe('tees', () => {
  it('forward tees are shorter; par is unchanged', () => {
    const black = holesFor('black'), red = holesFor('red');
    expect(red[0].yards).toBeLessThan(black[0].yards);
    expect(red.map((h) => h.par)).toEqual(black.map((h) => h.par));
    expect(red[0].lies[0].pin).toBe(red[0].yards);
  });
});

describe('mulligan ledger', () => {
  const cfg = { tee: 'blue' as const, format: 'Scramble' as const, length: '18' as const };
  it('tracks packs, usage per player and total raised; refuses overdraw', async () => {
    const { ledgerTotal, mulligansLeft } = await import('./round');
    let s = roundReducer(newRound(), { type: 'start', config: cfg, ledger: { price: 10, packs: { me: 2, f1: 1 }, used: [] } });
    expect(ledgerTotal(s.ledger!)).toBe(30);
    s = roundReducer(s, { type: 'mulligan', player: 'f1' });
    const again = roundReducer(s, { type: 'mulligan', player: 'f1' });
    expect(again).toBe(s); // no mulligans left
    expect(mulligansLeft(s.ledger!, 'f1')).toBe(0);
    expect(s.ledger!.used[0]).toMatchObject({ player: 'f1', hole: 1 });
    s = roundReducer(s, { type: 'unmulligan', index: 0 });
    expect(mulligansLeft(s.ledger!, 'f1')).toBe(1);
    expect(isRoundState(s)).toBe(true);
  });
  it('opens a ledger when mulligans are bought mid-round', () => {
    let s = roundReducer(newRound(), { type: 'start', config: cfg });
    expect(s.ledger).toBeUndefined();
    s = roundReducer(s, { type: 'buyMulligans', player: 'me', qty: 2, price: 10 });
    expect(s.ledger).toEqual({ price: 10, packs: { me: 2 }, used: [] });
    s = roundReducer(s, { type: 'buyMulligans', player: 'me', qty: 1, price: 10 });
    expect(s.ledger!.packs.me).toBe(3);
    expect(roundReducer(s, { type: 'buyMulligans', player: 'me', qty: 0, price: 10 })).toBe(s);
    expect(isRoundState(s)).toBe(true);
  });
});
