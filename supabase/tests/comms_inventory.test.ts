import { as, createDb, signUp, type Db } from './harness';

const P = '00000000-0000-4000-8000-0000000000e1'; // golfer (captain)
const Q = '00000000-0000-4000-8000-0000000000e2'; // another golfer
const S = '00000000-0000-4000-8000-0000000000e3'; // Somerby staff
const O = '00000000-0000-4000-8000-0000000000e4'; // verified organizer
const U = '00000000-0000-4000-8000-0000000000e5'; // unverified organizer
const A = '00000000-0000-4000-8000-0000000000e6'; // platform admin
const M = '00000000-0000-4000-8000-0000000000e7'; // course manager applying for verification
const C = 'Somerby Golf Club';
let db: Db;
let ev: string;
const q = <T = Record<string, unknown>>(u: string, sql: string, params: unknown[] = []) => as(db, 'authenticated', u, () => db.query<T>(sql, params));
const order = (u: string, items: unknown[], extra: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = { course_name: C, kind: 'order', hole: 3, lat: 44.05, lng: -92.63, items: JSON.stringify(items), ...extra };
  const cols = Object.keys(row);
  return q<{ id: string; total_cents: number; status: string; cart_id: string | null }>(u,
    `insert into public.orders (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id, total_cents, status, cart_id`, Object.values(row));
};
const stock = async (sku: string) => (await db.query<{ stock: number }>(`select stock from public.menu_items where sku = $1`, [sku])).rows[0].stock;
const cartId = async (name: string) => (await db.query<{ id: string }>(`select id from public.bev_carts where name = $1`, [name])).rows[0].id;

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[P, 'pat'], [Q, 'quin'], [S, 'staff'], [O, 'olive'], [U, 'uma'], [A, 'admin'], [M, 'manny']]) await signUp(db, id, h);
  await db.query(`update auth.users set phone = '+15075550101' where id = $1`, [Q]);
  await db.query(`insert into public.staff_members (user_id, course_name, role) values ($1, $2, 'staff')`, [S, C]);
  await db.query(`insert into public.organizers (user_id, name, verified) values ($1, 'Olive Org', true), ($2, 'Uma Unverified', false)`, [O, U]);
  await db.query(`insert into public.platform_admins values ($1)`, [A]);
  await db.query(`update public.course_settings set kitchen_open = '00:01', kitchen_close = '00:00' where course_name = $1`, [C]);
  ev = (await db.query<{ id: string }>(`insert into public.events (course_name, name, starts_at, foursome_price_cents, venue_id) values ($1, 'Kid''s Cup', now() + interval '7 days', 60000, 'somerby') returning id`, [C])).rows[0].id;
  const blank = { first: '', last: '', phone: '', email: '' };
  await q(P, `insert into public.registrations (event_id, team_name, roster) values ($1, 'Fore Play', $2)`, [ev, JSON.stringify([{ first: 'Quin', last: 'Q', phone: '+15075550101', email: 'q@example.com' }, blank, blank])]);
}, 60_000);

describe('store & inventory', () => {
  it('only staff add, edit and remove items', async () => {
    const add = `insert into public.menu_items (sku, course_name, name, kind, category, price_cents, stock) values ('VISOR', $1, 'Visor', 'shop', 'apparel', 2000, 2)`;
    await expect(q(P, add, [C])).rejects.toThrow(/row-level security/);
    await q(S, add, [C]);
    expect((await q(P, `update public.menu_items set price_cents = 1 where sku = 'VISOR'`)).affectedRows).toBe(0);
    await q(S, `update public.menu_items set price_cents = 2500 where sku = 'VISOR'`);
    await expect(q(S, `insert into public.menu_items (sku, course_name, name, kind, category, price_cents) values ('BAD', $1, 'x', 'fnb', 'apparel', 1)`, [C])).rejects.toThrow(/kind_matches/);
    expect((await q(P, `delete from public.menu_items where sku = 'VISOR'`)).affectedRows).toBe(0);
  });
  it('decrements stock, refuses sold-out and hidden items, restocks on cancel', async () => {
    const o = (await order(P, [{ sku: 'VISOR', qty: 2 }])).rows[0];
    expect(o.total_cents).toBe(5000);
    expect(await stock('VISOR')).toBe(0);
    await expect(order(Q, [{ sku: 'VISOR', qty: 1 }])).rejects.toThrow(/sold_out/);
    await q(P, `update public.orders set status = 'cancelled' where id = $1`, [o.id]);
    expect(await stock('VISOR')).toBe(2);
    await q(S, `update public.menu_items set visible = false where sku = 'VISOR'`);
    expect((await q(P, `select sku from public.menu_items where sku = 'VISOR'`)).rows).toHaveLength(0);
    expect((await q(S, `select sku from public.menu_items where sku = 'VISOR'`)).rows).toHaveLength(1);
    await expect(order(Q, [{ sku: 'VISOR', qty: 1 }])).rejects.toThrow(/unknown_item/);
  });
  it('charity mulligans sell only during a live in-house tournament', async () => {
    await expect(order(Q, [{ sku: 'MULLIGAN', qty: 1 }])).rejects.toThrow(/charity_closed/);
    await db.query(`update public.course_settings set tournament_live = true where course_name = $1`, [C]);
    await expect(order(Q, [{ sku: 'MULLIGAN', qty: 1 }])).rejects.toThrow(/charity_closed/); // not in-house
    await db.query(`update public.course_settings set in_house = true where course_name = $1`, [C]);
    expect((await order(Q, [{ sku: 'MULLIGAN', qty: 1 }])).rows[0].status).toBe('completed');
    await db.query(`update public.course_settings set in_house = false, tournament_live = false where course_name = $1`, [C]);
  });
});

describe('phone-in orders & beverage carts', () => {
  it('only staff enter phone orders; they go to the nearest cart', async () => {
    await expect(order(P, [{ sku: 'WATER', qty: 1 }], { source: 'phone', customer_name: 'Pat', customer_phone: '+15075550199' })).rejects.toThrow(/staff_only/);
    const o = (await order(S, [{ sku: 'WATER', qty: 2 }], { source: 'phone', customer_name: 'Phone Pat', customer_phone: '+15075550199', hole: 14, note: 'no ice' })).rows[0];
    expect(o.cart_id).toBe(await cartId('Cart 2 · Back nine'));
    const note = (await order(S, [], { source: 'phone', customer_name: 'Note Only', customer_phone: '+15075550198', hole: 2, note: 'two waters' })).rows[0];
    expect(note.cart_id).toBe(await cartId('Cart 1 · Front nine'));
    await expect(order(Q, [], { note: 'free stuff' })).rejects.toThrow(/invalid_items/);
  });
  it('carts are staff-only; staff can reassign an order', async () => {
    expect((await q(P, `select * from public.bev_carts`)).rows).toHaveLength(0);
    expect((await q(S, `select * from public.bev_carts`)).rows).toHaveLength(2);
    const o = (await order(P, [{ sku: 'TEES', qty: 1 }])).rows[0];
    await expect(q(P, `update public.orders set cart_id = null where id = $1`, [o.id])).rejects.toThrow(/row-level security/);
    await q(S, `update public.orders set cart_id = $2 where id = $1`, [o.id, await cartId('Cart 2 · Back nine')]);
  });
});

describe('messages, broadcasts, SOS', () => {
  it('golfers write only their own thread and cannot pose as staff', async () => {
    await q(P, `insert into public.messages (course_name, thread_player, sender_role, body) values ($1, $2, 'player', 'Lost my wedge on 7')`, [C, P]);
    await expect(q(P, `insert into public.messages (course_name, thread_player, sender_role, body) values ($1, $2, 'staff', 'Free beer')`, [C, P])).rejects.toThrow(/row-level security/);
    await expect(q(P, `insert into public.messages (course_name, thread_player, sender_role, body) values ($1, $2, 'player', 'hi')`, [C, Q])).rejects.toThrow(/row-level security/);
    await expect(q(P, `insert into public.messages (course_name, thread_player, sender_role, body) values ($1, $2, 'player', '<img onerror=x>')`, [C, P])).rejects.toThrow(/check/);
    await q(S, `insert into public.messages (course_name, thread_player, sender_role, body) values ($1, $2, 'staff', 'Found it — at the turn')`, [C, P]);
    expect((await q(Q, `select * from public.messages`)).rows).toHaveLength(0);
    expect((await q(P, `select * from public.messages`)).rows).toHaveLength(2);
    await expect(q(P, `update public.messages set read_by_staff = true where thread_player = $1`, [P])).rejects.toThrow(/not_your_flag/);
    await q(P, `update public.messages set read_by_player = true where thread_player = $1`, [P]);
  });
  it('broadcasts: staff to anyone; organizers only to their own event; event alerts reach its field', async () => {
    const ins = (u: string, audience: string, e: string | null) => q(u, `insert into public.broadcasts (course_name, event_id, kind, severity, title, body, audience) values ($1, $2, 'lightning', 'critical', 'Lightning', 'Clear the course', $3)`, [C, e, audience]);
    await expect(ins(P, 'all', null)).rejects.toThrow(/row-level security/);
    await ins(S, 'on-course', null);
    await expect(ins(O, 'all', null)).rejects.toThrow(/row-level security/);
    await expect(ins(O, 'event', ev)).rejects.toThrow(/row-level security/); // not their event
    await db.query(`update public.events set organizer_id = $1 where id = $2`, [O, ev]);
    await ins(O, 'event', ev);
    expect((await q(Q, `select * from public.broadcasts where audience = 'event'`)).rows).toHaveLength(1); // on the roster (phone)
    expect((await q(M, `select * from public.broadcasts where audience = 'event'`)).rows).toHaveLength(0);
    await db.query(`update public.events set organizer_id = null where id = $1`, [ev]);
  });
  it('SOS: one open alert; staff acknowledge (stamped); reporter can cancel only before that', async () => {
    const raise = (u: string) => q<{ id: string }>(u, `insert into public.sos_alerts (course_name, from_role, name, hole, lat, lng) values ($1, 'player', 'Pat', 6, 44.05, -92.63) returning id`, [C]);
    const id = (await raise(P)).rows[0].id;
    await expect(raise(P)).rejects.toThrow(/sos_one_open|duplicate/);
    await expect(q(P, `insert into public.sos_alerts (course_name, from_role, name) values ($1, 'cart', 'Cart 1')`, [C])).rejects.toThrow(/row-level security/);
    expect((await q(Q, `select * from public.sos_alerts`)).rows).toHaveLength(0);
    await q(S, `update public.sos_alerts set status = 'acknowledged' where id = $1`, [id]);
    expect((await db.query<{ ack_by: string }>(`select ack_by from public.sos_alerts where id = $1`, [id])).rows[0].ack_by).toBe(S);
    expect((await q(P, `update public.sos_alerts set status = 'cancelled' where id = $1`, [id])).affectedRows).toBe(0);
    await q(S, `update public.sos_alerts set status = 'resolved' where id = $1`, [id]);
    await expect(q(S, `update public.sos_alerts set status = 'acknowledged' where id = $1`, [id])).rejects.toThrow(/sos_closed/);
  });
});

describe('organizers, venues & course verification', () => {
  const create = (u: string, venue: string) => q<{ id: string; course_name: string; organizer_id: string }>(u,
    `insert into public.events (course_name, name, starts_at, foursome_price_cents, venue_id) values ('ignored', 'Fall Classic', now() + interval '30 days', 48000, $1) returning id, course_name, organizer_id`, [venue]);
  it('verified organizers schedule events at directory venues, as themselves', async () => {
    await expect(create(U, 'eastwood')).rejects.toThrow(/row-level security/);
    await expect(create(O, 'pebble-beach')).rejects.toThrow(/unknown_venue|foreign key/);
    const e = (await create(O, 'eastwood')).rows[0];
    expect(e).toMatchObject({ course_name: 'Eastwood Golf Course', organizer_id: O });
    expect((await q(Q, `update public.events set foursome_price_cents = 1 where id = $1`, [e.id])).affectedRows).toBe(0);
    expect((await q(O, `update public.events set foursome_price_cents = 50000 where id = $1`, [e.id])).affectedRows).toBe(1);
    expect((await q(O, `update public.events set foursome_price_cents = 1 where id = $1`, [ev])).affectedRows).toBe(0); // not theirs
    expect((await q(O, `delete from public.events where id = $1`, [e.id])).affectedRows).toBe(1);
  });
  it('course claims need admin approval, which grants staff access', async () => {
    const claim = `insert into public.course_verification_requests (venue_id, applicant, title, email, phone, proof_path) values ('eastwood', 'Manny Manager', 'General Manager', 'gm@eastwood.example', '+15075550150', 'claims/m/card.jpg') returning id`;
    const id = (await q<{ id: string }>(M, claim)).rows[0].id;
    expect((await q(M, `update public.course_verification_requests set status = 'approved' where id = $1`, [id])).affectedRows).toBe(0);
    expect((await q(S, `select * from public.course_verification_requests`)).rows).toHaveLength(0);
    await q(A, `update public.course_verification_requests set status = 'approved' where id = $1`, [id]);
    expect((await q(M, `select course_name from public.staff_members`)).rows).toEqual([{ course_name: 'Eastwood Golf Course' }]);
    await expect(q(A, `update public.course_verification_requests set status = 'rejected' where id = $1`, [id])).rejects.toThrow(/already_decided/);
  });
});

describe('favorites & shares', () => {
  it('favorites are private; shares go only to accepted friends', async () => {
    await q(P, `insert into public.event_favorites (event_id) values ($1)`, [ev]);
    expect((await q(Q, `select * from public.event_favorites`)).rows).toHaveLength(0);
    await expect(q(P, `insert into public.event_shares (event_id, to_id) values ($1, $2)`, [ev, Q])).rejects.toThrow(/row-level security/);
    await db.query(`insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted')`, [P, Q]);
    await q(P, `insert into public.event_shares (event_id, to_id) values ($1, $2)`, [ev, Q]);
    expect((await q(Q, `select * from public.event_shares`)).rows).toHaveLength(1);
    expect((await q(M, `select * from public.event_shares`)).rows).toHaveLength(0);
  });
});
