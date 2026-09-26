import { groupStatus, initialOps, opsReducer, validateTeam, STANDARD_MIN_PER_HOLE, type Order } from './model';

const order = (over: Partial<Order> = {}): Order => ({ id: 'o1', kind: 'order', createdAt: 1, player: 'Edgar', hole: 4, lat: 44, lng: -92, items: [], total: 9, status: 'new', ...over });

describe('ops reducer RBAC', () => {
  it('players cannot change settings or order status; staff can', () => {
    let s = initialOps();
    s = opsReducer(s, { type: 'order', order: order() }, 'player');
    expect(opsReducer(s, { type: 'setting', patch: { liveOrdering: false } }, 'player')).toBe(s);
    expect(opsReducer(s, { type: 'status', id: 'o1', status: 'enroute' }, 'player')).toBe(s);
    const staff = opsReducer(s, { type: 'status', id: 'o1', status: 'enroute' }, 'staff');
    expect(staff.orders[0].status).toBe('enroute');
  });
  it('master toggles block ordering and hailing course-wide', () => {
    let s = opsReducer(initialOps(), { type: 'setting', patch: { liveOrdering: false, hailCart: false } }, 'staff');
    s = opsReducer(s, { type: 'order', order: order() }, 'player');
    s = opsReducer(s, { type: 'order', order: order({ id: 'h', kind: 'hail' }) }, 'player');
    expect(s.orders).toHaveLength(0);
  });
  it('enforces the organizer mulligan limit per player; charity keeps selling with ordering off', () => {
    const m = (id: string, qty: number, player = 'Edgar') =>
      order({ id, player, items: [{ sku: 'MULLIGAN', name: 'Mulligan', price: 10, qty, kind: 'charity' }], total: 10 * qty });
    let s = opsReducer(initialOps(), { type: 'setting', patch: { mulliganLimit: 3, liveOrdering: false } }, 'staff');
    s = opsReducer(s, { type: 'order', order: m('a', 2) }, 'player');
    expect(s.orders[0].status).toBe('delivered');
    expect(opsReducer(s, { type: 'order', order: m('b', 2) }, 'player')).toBe(s);
    s = opsReducer(s, { type: 'order', order: m('c', 1) }, 'player');
    s = opsReducer(s, { type: 'order', order: m('d', 3, 'Sam') }, 'player');
    expect(s.orders.map((o) => o.id)).toEqual(['d', 'c', 'a']);
  });
  it('clamps the mulligan limit', () => {
    expect(opsReducer(initialOps(), { type: 'setting', patch: { mulliganLimit: 99 } }, 'staff').settings.mulliganLimit).toBe(10);
  });
});

describe('verified roster', () => {
  const cap = { first: 'Edgar', last: 'Chavira Rios', phone: '507-555-0100', email: 'edgar@example.com' };
  const p = (n: number) => ({ first: `P${n}`, last: 'Golfer', phone: `507-555-01${10 + n}`, email: `p${n}@example.com` });
  it('accepts a complete roster', () => expect(validateTeam('Fore Play', [p(1), p(2), p(3)], cap).ok).toBe(true));
  it('rejects missing fields, bad phone/email, duplicates and a missing team name', () => {
    const r = validateTeam('', [{ first: '', last: 'X', phone: '12', email: 'nope' }, p(2), { ...p(3), phone: cap.phone }], cap);
    expect(r.ok).toBe(false);
    expect(r.errors.team).toBeDefined();
    expect(r.errors.roster[0]).toMatchObject({ first: 'Required', phone: expect.any(String), email: expect.any(String) });
    expect(r.errors.duplicate).toBeDefined();
  });
});

describe('pace of play', () => {
  const t0 = 0;
  it('on-pace group is not behind; slow group accumulates delay', () => {
    const now = t0 + 4 * STANDARD_MIN_PER_HOLE * 60_000;
    expect(groupStatus({ id: 'a', name: '', players: [], teeTime: t0, minPerHole: STANDARD_MIN_PER_HOLE }, now)).toMatchObject({ hole: 5, behindMin: 0 });
    const slow = groupStatus({ id: 'b', name: '', players: [], teeTime: t0, minPerHole: 19 }, now + 60 * 60_000);
    expect(slow.behindMin).toBeGreaterThan(15);
  });
  it('shotgun starts wrap around the course', () => {
    const s = groupStatus({ id: 'c', name: '', players: [], teeTime: 0, minPerHole: 14.5, startHole: 17 }, 3 * 14.5 * 60_000);
    expect(s.hole).toBe(2);
  });
});
