import { eodTally, validBanner, cleanOrganizerText, localDate, balance, blankContact, blockFor, blockLabel, dayBlock, filledCount, groupStatus, initialOps, isOpenAt, opsReducer, validateBlock, validateTeam, STANDARD_MIN_PER_HOLE, type Order, type Registration, type TeeBlock, type TeeBooking } from './model';

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
    expect(s.orders[0]).toMatchObject({ status: 'completed', completedAt: 1 });
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
  it('allows open slots, but not a half-filled one or a missing captain', () => {
    expect(validateTeam('Fore Play', [p(1), blankContact(), blankContact()], cap).ok).toBe(true);
    expect(validateTeam('Fore Play', [p(1), { ...blankContact(), first: 'Half' }, blankContact()], cap).ok).toBe(false);
    expect(validateTeam('Fore Play', [p(1), p(2), p(3)], blankContact()).ok).toBe(false);
  });
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

describe('pre-tournament CRM', () => {
  const cap = { first: 'Edgar', last: 'Chavira Rios', phone: '+15075550100', email: 'edgar@example.com' };
  const p2 = { first: 'Marcus', last: 'Chen', phone: '+15075550111', email: 'm@example.com' };
  const reg: Registration = { id: 'r1', eventId: 'e', teamName: 'Fore Play', captain: cap, roster: [p2, blankContact(), blankContact()], total: 600, paid: 150, paidAt: 0, teeTime: '' };
  const base = opsReducer(initialOps(), { type: 'register', reg }, 'player');
  const swap = { ...p2, first: 'Sarah', last: 'Jenkins', phone: '+15075550112' };
  it('tracks head count and balance', () => {
    expect(filledCount(reg)).toBe(2);
    expect(balance(reg)).toBe(450);
    expect(opsReducer(base, { type: 'pay', id: 'r1', amount: 1000 }, 'player').registrations[0].paid).toBe(600);
  });
  it('only the captain edits, and only before the event; staff can always override', () => {
    const edit = (actor?: string) => ({ type: 'roster' as const, id: 'r1', roster: [swap, blankContact(), blankContact()] as Registration['roster'], actor });
    expect(opsReducer(base, edit('+15075550199'), 'player')).toBe(base);
    expect(opsReducer(base, edit(), 'player')).toBe(base);
    expect(opsReducer(base, edit('507-555-0100'), 'player').registrations[0].roster[0].first).toBe('Sarah');
    const live = opsReducer(base, { type: 'setting', patch: { tournamentLive: true } }, 'staff');
    expect(live.settings.liveSince).toBeGreaterThan(0);
    expect(opsReducer(live, edit('507-555-0100'), 'player')).toBe(live);
    expect(opsReducer(live, edit(), 'staff').registrations[0].roster[0].first).toBe('Sarah');
  });
  it('rejects an invalid edit', () => {
    expect(opsReducer(base, { type: 'roster', id: 'r1', roster: [{ ...swap, phone: cap.phone }, blankContact(), blankContact()] }, 'staff')).toBe(base);
  });
});

describe('hours of operation', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 17, h, m).getTime();
  it('handles same-day and past-midnight hours', () => {
    expect(isOpenAt({ open: '11:00', close: '21:00' }, at(10, 59))).toBe(false);
    expect(isOpenAt({ open: '11:00', close: '21:00' }, at(11))).toBe(true);
    expect(isOpenAt({ open: '11:00', close: '21:00' }, at(21))).toBe(false);
    expect(isOpenAt({ open: '17:00', close: '01:00' }, at(0, 30))).toBe(true);
  });
  it('refuses food & drink while the kitchen is closed; pro shop still sells', () => {
    const food = order({ createdAt: at(22), items: [{ sku: 'WATER', name: 'Water', price: 3, qty: 1, kind: 'fnb' }] });
    const shop = order({ id: 's', createdAt: at(22), items: [{ sku: 'TEES', name: 'Tees', price: 5, qty: 1, kind: 'shop' }] });
    const s = opsReducer(initialOps(), { type: 'order', order: food }, 'player');
    expect(s.orders).toHaveLength(0);
    expect(opsReducer(s, { type: 'order', order: shop }, 'player').orders).toHaveLength(1);
    expect(opsReducer(s, { type: 'order', order: { ...food, createdAt: at(12) } }, 'player').orders).toHaveLength(1);
  });
  it('ignores malformed hours and clamps pace settings', () => {
    const s = opsReducer(initialOps(), { type: 'setting', patch: { kitchenHours: { open: '25:00', close: '21:00' }, paceMinPerHole: 3, paceAlertMin: 99 } }, 'staff');
    expect(s.settings.kitchenHours).toEqual(initialOps().settings.kitchenHours);
    expect(s.settings.paceMinPerHole).toBe(10);
    expect(s.settings.paceAlertMin).toBe(45);
  });
});

describe('tee sheet', () => {
  const b = (over: Partial<TeeBooking> = {}): TeeBooking => ({ id: 'b1', date: '2026-10-17', time: '09:10', status: 'reserved', name: 'Walk-up Jones', size: 3, phone: '507-555-0142', email: '', source: 'phone', ...over });
  const k = (over: Partial<TeeBlock> = {}): TeeBlock => ({ id: 'k1', reason: 'Maintenance', startDate: '2026-10-17', endDate: '2026-10-17', from: '09:20', to: '09:40', ...over });
  it('staff book phone reservations; one per slot; players cannot', () => {
    expect(opsReducer(initialOps(), { type: 'book', booking: b() }, 'player').teeSheet).toHaveLength(0);
    const s = opsReducer(initialOps(), { type: 'book', booking: b() }, 'staff');
    expect(s.teeSheet[0]).toMatchObject({ phone: '+15075550142', size: 3 });
    expect(opsReducer(s, { type: 'book', booking: b({ id: 'b2' }) }, 'staff')).toBe(s);
    expect(opsReducer(s, { type: 'book', booking: b({ id: 'b4', time: '09:30', phone: '12' }) }, 'staff')).toBe(s);
    expect(opsReducer(s, { type: 'unbook', id: 'b1' }, 'staff').teeSheet).toHaveLength(0);
  });
  it('blocks a time window with a reason; blocked slots cannot be booked', () => {
    expect(opsReducer(initialOps(), { type: 'block', block: k() }, 'player').teeBlocks).toHaveLength(0);
    const s = opsReducer(initialOps(), { type: 'block', block: k() }, 'staff');
    expect(blockFor(s.teeBlocks, '2026-10-17', '09:20')?.reason).toBe('Maintenance');
    expect(blockFor(s.teeBlocks, '2026-10-17', '09:40')).toBeUndefined(); // end exclusive
    expect(opsReducer(s, { type: 'book', booking: b({ time: '09:30' }) }, 'staff')).toBe(s);
    expect(opsReducer(s, { type: 'book', booking: b({ time: '09:40' }) }, 'staff').teeSheet).toHaveLength(1);
    expect(opsReducer(s, { type: 'unblock', id: 'k1' }, 'staff').teeBlocks).toHaveLength(0);
  });
  it('blocks whole days across a date range', () => {
    const s = opsReducer(initialOps(), { type: 'block', block: k({ reason: 'Season Closed', startDate: '2026-11-16', endDate: '2027-03-31', from: undefined, to: undefined }) }, 'staff');
    expect(dayBlock(s.teeBlocks, '2027-01-05')?.reason).toBe('Season Closed');
    expect(dayBlock(s.teeBlocks, '2027-04-01')).toBeUndefined();
    expect(blockFor(s.teeBlocks, '2026-12-01', '07:00')).toBeDefined();
    expect(blockLabel(s.teeBlocks[0])).toMatch(/all day$/);
  });
  it('rejects bad blocks', () => {
    for (const bad of [k({ reason: 'Because' as TeeBlock['reason'] }), k({ endDate: '2026-10-16' }), k({ to: '09:00' }), k({ to: undefined }), k({ endDate: '2027-12-31' })]) {
      expect(validateBlock(bad).ok).toBe(false);
    }
  });
});

describe('geofenced telemetry', () => {
  const onCourse = { player: 'Edgar', phone: '507-555-0100', lat: 44.0475, lng: -92.6318, at: 1 };
  const home = { ...onCourse, lat: 44.0121, lng: -92.4802 }; // Rochester, MN
  const live = opsReducer(initialOps(), { type: 'setting', patch: { tournamentLive: true } }, 'staff');
  it('records nothing before the event starts', () => {
    expect(opsReducer(initialOps(), { type: 'ping', pos: onCourse }, 'player').positions).toHaveLength(0);
  });
  it('records on-property fixes only, and leaving the property deletes the last fix', () => {
    const s = opsReducer(live, { type: 'ping', pos: onCourse }, 'player');
    expect(s.positions).toEqual([{ ...onCourse, phone: '+15075550100' }]);
    expect(opsReducer(live, { type: 'ping', pos: home }, 'player').positions).toHaveLength(0);
    expect(opsReducer(s, { type: 'ping', pos: home }, 'player').positions).toHaveLength(0);
    expect(opsReducer(s, { type: 'unping', phone: '+1 507 555 0100' }, 'player').positions).toHaveLength(0);
  });
  it('ending the event wipes all positions', () => {
    const s = opsReducer(live, { type: 'ping', pos: onCourse }, 'player');
    expect(opsReducer(s, { type: 'setting', patch: { tournamentLive: false } }, 'staff').positions).toHaveLength(0);
  });
});

describe('fulfillment + End of Day tally', () => {
  const day = new Date(2026, 9, 17, 12).getTime();
  const it_ = (sku: string, name: string, price: number, qty: number, kind: 'fnb' | 'shop' | 'charity' = 'fnb') => ({ sku, name, price, qty, kind });
  const orders: Order[] = [
    order({ id: 'a', status: 'completed', completedAt: day, items: [it_('BEER_DRAFT', 'Draft Beer', 7, 2), it_('WATER', 'Water', 3, 1)], total: 17 }),
    order({ id: 'b', status: 'completed', completedAt: day + 60_000, items: [it_('BEER_DRAFT', 'Draft Beer', 7, 1), it_('TEES', 'Tees', 5, 1, 'shop')], total: 12 }),
    order({ id: 'c', status: 'completed', completedAt: day, items: [it_('MULLIGAN', 'Charity Mulligan', 10, 2, 'charity')], total: 20 }),
    order({ id: 'h', kind: 'hail', status: 'completed', completedAt: day, items: [], total: 0 }),
    order({ id: 'open', status: 'new', items: [it_('HOTDOG', 'Dog', 8, 1)], total: 8 }),
    order({ id: 'y', status: 'completed', completedAt: day - 86_400_000, items: [it_('WATER', 'Water', 3, 5)], total: 15 }),
  ];
  it('Mark Completed stamps completion time and clears the queue', () => {
    let s = opsReducer(initialOps(), { type: 'order', order: order({ id: 'q', createdAt: day, items: [it_('TEES', 'Tees', 5, 1, 'shop')] }) }, 'player');
    expect(opsReducer(s, { type: 'status', id: 'q', status: 'completed' }, 'player')).toBe(s);
    s = opsReducer(s, { type: 'status', id: 'q', status: 'completed' }, 'staff');
    expect(s.orders[0].status).toBe('completed');
    expect(s.orders[0].completedAt).toBeGreaterThan(0);
  });
  it('tallies only completed orders for the day, itemized, with revenue', () => {
    const t = eodTally(orders, localDate(day));
    expect(t.orders).toBe(3);
    expect(t.hails).toBe(1);
    expect(t.revenue).toBe(49);
    expect(t.items[0]).toEqual({ sku: 'BEER_DRAFT', name: 'Draft Beer', kind: 'fnb', qty: 3, revenue: 21 });
    expect(t.byKind).toEqual({ fnb: 24, shop: 5, charity: 20 });
    expect(t.openOrders).toBe(1);
  });
});

describe('event branding', () => {
  const png = 'data:image/png;base64,' + 'A'.repeat(100);
  it('accepts image/PDF flyers of the declared type under the cap', () => {
    expect(validBanner({ name: 'flyer.png', type: 'image/png', dataUrl: png })).toBe(true);
    expect(validBanner({ name: 'flyer.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0=' })).toBe(true);
    expect(validBanner({ name: 'x.svg', type: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe(false);
    expect(validBanner({ name: 'lie.png', type: 'image/png', dataUrl: 'data:text/html;base64,PGI+' })).toBe(false);
    expect(validBanner({ name: 'huge.png', type: 'image/png', dataUrl: 'data:image/png;base64,' + 'A'.repeat(2_100_000) })).toBe(false);
  });
  it('keeps line breaks, strips markup; staff only', () => {
    expect(cleanOrganizerText('Welcome <b>golfers</b>!\n\n\n\nLunch at noon')).toBe('Welcome bgolfers/b!\n\nLunch at noon');
    expect(opsReducer(initialOps(), { type: 'eventDetails', eventId: 'e', patch: { text: 'hi' } }, 'player').eventDetails).toEqual({});
    const s = opsReducer(initialOps(), { type: 'eventDetails', eventId: 'e', patch: { text: 'hi', banner: { name: 'f.png', type: 'image/png', dataUrl: png } } }, 'staff');
    expect(s.eventDetails.e).toMatchObject({ text: 'hi', banner: { name: 'f.png' } });
    expect(opsReducer(s, { type: 'eventDetails', eventId: 'e', patch: { banner: null } }, 'staff').eventDetails.e.banner).toBeUndefined();
  });
});
