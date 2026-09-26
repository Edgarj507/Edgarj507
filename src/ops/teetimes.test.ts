import { bandFor, canCancel, DEFAULT_PRICING, isWeekend, quote, teeAt, teeTimes, validatePricing } from './teetimes';
import { initialOps, localDate, opsReducer, type TeeBooking } from './model';

const P = DEFAULT_PRICING;
describe('tee-time pricing', () => {
  it('picks the band by time of day and weekday/weekend', () => {
    expect(bandFor(P, '06:30').id).toBe('morning');
    expect(bandFor(P, '10:59').id).toBe('morning');
    expect(bandFor(P, '11:00').id).toBe('midday');
    expect(bandFor(P, '18:40').id).toBe('twilight');
    expect(isWeekend('2026-10-17')).toBe(true); // Saturday
    expect(isWeekend('2026-10-14')).toBe(false);
  });
  it('prices holes, cart per golfer vs per reservation, players', () => {
    const wd = quote(P, '2026-10-14', '08:00', '18', 'ride', 4);
    expect(wd).toMatchObject({ greenEach: 52, greens: 208, cart: 80, total: 288 });
    expect(quote(P, '2026-10-17', '08:00', 'front9', 'walk', 2)).toMatchObject({ greenEach: 36, cart: 0, total: 72 });
    const perRes = { ...P, cart: { ...P.cart, mode: 'per-reservation' as const } };
    expect(quote(perRes, '2026-10-14', '08:00', '18', 'ride', 4).cart).toBe(20);
  });
  it('validates staff input', () => {
    expect(validatePricing(P).ok).toBe(true);
    expect(validatePricing({ ...P, cart: { ...P.cart, price18: -1 } }).ok).toBe(false);
    expect(validatePricing({ ...P, bands: [P.bands[0], { ...P.bands[1], from: P.bands[0].from }] }).ok).toBe(false);
    expect(validatePricing({ ...P, interval: 3 }).ok).toBe(false);
  });
  it('generates tee times at the configured interval', () => {
    expect(teeTimes({ open: '07:00', close: '08:00' }, 15)).toEqual(['07:00', '07:15', '07:30', '07:45']);
  });
});

describe('golfer reservations', () => {
  const tomorrow = localDate(Date.now() + 86_400_000);
  const b = (over: Partial<TeeBooking> = {}): TeeBooking => ({ id: 'r1', date: tomorrow, time: '09:00', status: 'reserved', name: 'Edgar', size: 3, phone: '(507) 555-0100', email: '', source: 'app', holes: '18', transport: 'ride', total: 1, ...over });
  it('books an open slot with a server-computed price', () => {
    const s = opsReducer(initialOps(), { type: 'reserve', booking: b() }, 'player');
    expect(s.teeSheet[0]).toMatchObject({ source: 'app', phone: '+15075550100', total: quote(P, tomorrow, '09:00', '18', 'ride', 3).total });
    expect(opsReducer(s, { type: 'reserve', booking: b({ id: 'r2' }) }, 'player')).toBe(s); // taken
  });
  it('refuses bad slots, the past, beyond the window, walking when carts are required, and hoarding', () => {
    const s0 = initialOps();
    expect(opsReducer(s0, { type: 'reserve', booking: b({ time: '09:03' }) }, 'player')).toBe(s0);
    expect(opsReducer(s0, { type: 'reserve', booking: b({ date: '2020-01-01' }) }, 'player')).toBe(s0);
    expect(opsReducer(s0, { type: 'reserve', booking: b({ date: localDate(Date.now() + 40 * 86_400_000) }) }, 'player')).toBe(s0);
    expect(opsReducer(s0, { type: 'reserve', booking: b({ size: 5 }) }, 'player')).toBe(s0);
    const cartsOnly = opsReducer(s0, { type: 'pricing', pricing: { ...P, walking: false } }, 'staff');
    expect(opsReducer(cartsOnly, { type: 'reserve', booking: b({ transport: 'walk' }) }, 'player')).toBe(cartsOnly);
    let s = s0;
    for (const t of ['09:00', '09:10', '09:20']) s = opsReducer(s, { type: 'reserve', booking: b({ id: t, time: t }) }, 'player');
    expect(s.teeSheet).toHaveLength(3);
    expect(opsReducer(s, { type: 'reserve', booking: b({ id: 'x', time: '09:30' }) }, 'player')).toBe(s); // maxUpcoming 3
  });
  it('golfers cancel their own reservation only inside the free window; only staff change pricing', () => {
    const s = opsReducer(initialOps(), { type: 'reserve', booking: b({ date: localDate(Date.now() + 3 * 86_400_000) }) }, 'player');
    expect(opsReducer(s, { type: 'cancelTee', id: 'r1', phone: '507-555-0199' }, 'player')).toBe(s);
    expect(opsReducer(s, { type: 'cancelTee', id: 'r1', phone: '507-555-0100' }, 'player').teeSheet).toHaveLength(0);
    const strict = opsReducer(s, { type: 'pricing', pricing: { ...P, cancelHours: 168 } }, 'staff');
    expect(opsReducer(strict, { type: 'cancelTee', id: 'r1', phone: '507-555-0100' }, 'player')).toBe(strict);
    expect(opsReducer(s, { type: 'pricing', pricing: { ...P, walking: false } }, 'player')).toBe(s);
    expect(canCancel(P, '2026-10-17', '08:00', teeAt('2026-10-16', '09:00'))).toBe(false);
  });
});
