import { as, createDb, signUp, type Db } from './harness';

const P = '00000000-0000-4000-8000-0000000000f1'; // player
const Q = '00000000-0000-4000-8000-0000000000f2'; // another player
const S = '00000000-0000-4000-8000-0000000000f3'; // staff at Somerby
const C = 'Somerby Golf Club';
let db: Db;
let eventId: string;

const roster = (phone = '+15075550111') => JSON.stringify([
  { first: 'Ana', last: 'Lee', phone, email: 'ana@example.com' },
  { first: 'Ben', last: 'Ortiz', phone: '+15075550112', email: 'ben@example.com' },
  { first: 'Cy', last: 'Park', phone: '+15075550113', email: 'cy@example.com' },
]);
const order = (u: string, items: unknown, kind = 'order') =>
  as(db, 'authenticated', u, () => db.query<{ total_cents: number; status: string }>(
    `insert into public.orders (course_name, kind, hole, lat, lng, items) values ($1, $2, 4, 44.05, -92.63, $3) returning total_cents, status`, [C, kind, JSON.stringify(items)]));

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[P, 'pat'], [Q, 'quin'], [S, 'staffer']]) await signUp(db, id, h);
  await db.query(`insert into public.staff_members (user_id, course_name, role) values ($1, $2, 'organizer')`, [S, C]);
  // Kitchen open around the clock for these tests (hours are covered in tournament_ops.test.ts).
  await db.query(`update public.course_settings set kitchen_open = '00:01', kitchen_close = '00:00' where course_name = $1`, [C]);
  eventId = (await db.query<{ id: string }>(`insert into public.events (course_name, name, starts_at, foursome_price_cents) values ($1, 'Kid''s Cup Charity Tournament', now() + interval '7 days', 60000) returning id`, [C])).rows[0].id;
});

describe('staff RBAC', () => {
  it('players cannot grant themselves staff or flip course switches', async () => {
    await expect(as(db, 'authenticated', P, () => db.query(`insert into public.staff_members values ($1, $2, 'admin')`, [P, C]))).rejects.toThrow(/permission denied/);
    const r = await as(db, 'authenticated', P, () => db.query(`update public.course_settings set live_ordering = false where course_name = $1`, [C]));
    expect(r.affectedRows).toBe(0);
    const s = await as(db, 'authenticated', S, () => db.query(`update public.course_settings set hail_cart = false where course_name = $1`, [C]));
    expect(s.affectedRows).toBe(1);
    await as(db, 'authenticated', S, () => db.query(`update public.course_settings set hail_cart = true where course_name = $1`, [C]));
  });
});

describe('registrations (verified roster, no guests)', () => {
  it('captain registers unpaid; bad rosters rejected; contact info private to captain + staff', async () => {
    await as(db, 'authenticated', P, () => db.query(`insert into public.registrations (event_id, team_name, roster) values ($1, 'Fore Play', $2)`, [eventId, roster()]));
    await expect(as(db, 'authenticated', P, () => db.query(`insert into public.registrations (event_id, team_name, roster) values ($1, 'X Team', $2)`, [eventId, roster('555')]))).rejects.toThrow(/check constraint/);
    await expect(as(db, 'authenticated', P, () => db.query(`insert into public.registrations (event_id, team_name, roster, paid) values ($1, 'Cheats', $2, true)`, [eventId, roster()]))).rejects.toThrow(/permission denied/);
    const other = await as(db, 'authenticated', Q, () => db.query(`select * from public.registrations`));
    expect(other.rows).toHaveLength(0);
    const staff = await as(db, 'authenticated', S, () => db.query<{ team_name: string }>(`select team_name from public.registrations`));
    expect(staff.rows.map((r) => r.team_name)).toEqual(['Fore Play']);
  });
});

describe('orders', () => {
  it('prices server-side, ignoring any client total', async () => {
    const r = await order(P, [{ sku: 'BEER_DRAFT', qty: 2 }, { sku: 'TEES', qty: 1, price: 0 }]);
    expect(r.rows[0]).toEqual({ total_cents: 1900, status: 'new' });
    await expect(order(P, [{ sku: 'FREE_CAR', qty: 1 }])).rejects.toThrow(/unknown_item/);
  });
  it('enforces the organizer mulligan limit', async () => {
    await as(db, 'authenticated', S, () => db.query(`update public.course_settings set mulligan_limit = 3 where course_name = $1`, [C]));
    await order(Q, [{ sku: 'MULLIGAN', qty: 2 }]);
    await expect(order(Q, [{ sku: 'MULLIGAN', qty: 2 }])).rejects.toThrow(/mulligan_limit/);
  });
  it('respects master toggles', async () => {
    await as(db, 'authenticated', S, () => db.query(`update public.course_settings set live_ordering = false, hail_cart = false where course_name = $1`, [C]));
    await expect(order(P, [{ sku: 'WATER', qty: 1 }])).rejects.toThrow(/ordering_off/);
    await expect(order(P, [], 'hail')).rejects.toThrow(/hail_cart_off/);
    // Charity mulligans are digital: still on sale, and nothing to deliver.
    expect((await order(P, [{ sku: 'MULLIGAN', qty: 1 }])).rows[0]).toEqual({ total_cents: 1000, status: 'delivered' });
    await as(db, 'authenticated', S, () => db.query(`update public.course_settings set live_ordering = true, hail_cart = true where course_name = $1`, [C]));
  });
  it('players see only their own orders and cannot mark them delivered; staff see the queue', async () => {
    const mine = await as(db, 'authenticated', Q, () => db.query(`select * from public.orders`));
    expect(mine.rows.length).toBeGreaterThan(0);
    const upd = await as(db, 'authenticated', P, () => db.query(`update public.orders set status = 'delivered'`));
    expect(upd.affectedRows).toBe(0);
    const q = await as(db, 'authenticated', S, () => db.query(`update public.orders set status = 'enroute' where player_id = $1`, [P]));
    expect(q.affectedRows).toBeGreaterThan(0);
  });
});
