import { as, createDb, signUp, type Db } from './harness';

const P = '00000000-0000-4000-8000-0000000000d1'; // player (captain)
const Q = '00000000-0000-4000-8000-0000000000d2'; // another player
const S = '00000000-0000-4000-8000-0000000000d3'; // staff
const C = 'Somerby Golf Club';
let db: Db;
let ev: string;
const q = (u: string, sql: string, params: unknown[] = []) => as(db, 'authenticated', u, () => db.query(sql, params));
const order = (u: string, kind = 'order', course = C) =>
  q(u, `insert into public.orders (course_name, kind, hole, lat, lng, items) values ($1, $2, 3, 44.05, -92.63, $3) returning id`, [course, kind, kind === 'hail' ? '[]' : JSON.stringify([{ sku: 'TEES', qty: 1 }])]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[P, 'pat'], [Q, 'quin'], [S, 'staff']]) await signUp(db, id, h);
  await db.query(`insert into public.staff_members (user_id, course_name, role) values ($1, $2, 'staff')`, [S, C]);
  ev = (await db.query<{ id: string }>(`insert into public.events (course_name, name, starts_at, foursome_price_cents) values ($1, 'Kid''s Cup', now() + interval '7 days', 60000) returning id`, [C])).rows[0].id;
  await q(P, `insert into public.registrations (event_id, team_name, roster) values ($1, 'Fore Play', $2)`, [ev, JSON.stringify([{ first: '', last: '', phone: '', email: '' }, { first: '', last: '', phone: '', email: '' }, { first: '', last: '', phone: '', email: '' }])]);
}, 60_000);

describe('orders: undo window + anti-spam', () => {
  it('player cancels own new order; not others’, not after completion, not to other statuses', async () => {
    const id = ((await order(P)).rows[0] as { id: string }).id;
    expect((await q(Q, `update public.orders set status = 'cancelled' where id = $1`, [id])).affectedRows).toBe(0);
    await expect(q(P, `update public.orders set status = 'completed' where id = $1`, [id])).rejects.toThrow(/row-level security/);
    expect((await q(P, `update public.orders set status = 'cancelled' where id = $1`, [id])).affectedRows).toBe(1);
    const late = ((await order(P)).rows[0] as { id: string }).id;
    await db.query(`update public.orders set created_at = now() - interval '3 minutes' where id = $1`, [late]);
    expect((await q(P, `update public.orders set status = 'cancelled' where id = $1`, [late])).affectedRows).toBe(0);
    // staff can reopen a mistaken completion (Undo)
    await q(S, `update public.orders set status = 'completed' where id = $1`, [late]);
    await q(S, `update public.orders set status = 'new' where id = $1`, [late]);
    expect((await db.query<{ status: string; completed_at: string | null }>(`select status, completed_at from public.orders where id = $1`, [late])).rows[0]).toEqual({ status: 'new', completed_at: null });
  });
  it('limits open orders and hails; unknown courses refused', async () => {
    for (let i = 0; i < 4; i++) await order(Q);
    await order(Q);
    await expect(order(Q)).rejects.toThrow(/too_many_open_orders/);
    await order(Q, 'hail');
    await expect(order(Q, 'hail')).rejects.toThrow(/hail_already_open/);
    await expect(order(P, 'hail', 'Nowhere Links')).rejects.toThrow(/unknown_course/);
  });
});

describe('geofence polygon + spoofing plausibility', () => {
  const ping = (u: string, lat: number, lng: number, acc = 8) =>
    q(u, `insert into public.live_positions (event_id, lat, lng, accuracy_m) values ($1, $2, $3, $4)
          on conflict (player_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m`, [ev, lat, lng, acc]);
  it('uses the real course outline + 250 ft, not just the bounding box', async () => {
    const on = await db.query<{ a: boolean; b: boolean; c: boolean }>(
      `select public.on_property($1, 44.0475, -92.6318) a, public.on_property($1, 44.0423, -92.6425) b, public.on_property($1, 44.0121, -92.4802) c`, [C]);
    expect(on.rows[0]).toEqual({ a: true, b: false, c: false }); // b is inside the box but ~300 m off the course
  });
  it('rejects teleporting, rapid-fire and inaccurate fixes', async () => {
    await q(S, `update public.course_settings set tournament_live = true where course_name = $1`, [C]);
    await ping(P, 44.0475, -92.6318);
    await expect(ping(P, 44.0476, -92.6318)).rejects.toThrow(/position_too_frequent/);
    await db.query(`update public.live_positions set updated_at = now() - interval '10 seconds'`);
    await expect(ping(P, 44.0515, -92.6318)).rejects.toThrow(/position_implausible/); // ~440 m in 10 s
    await expect(ping(P, 44.0476, -92.6318, 400)).rejects.toThrow(/check constraint/);
    await ping(P, 44.0477, -92.6318); // ~20 m in 10 s: fine
    // Retention: yesterday's fix is purged even while the event is still marked live.
    await db.query(`update public.live_positions set updated_at = now() - interval '1 day'`);
    expect((await db.query<{ n: number }>(`select public.purge_stale_positions() n`)).rows[0].n).toBe(1);
    await expect(q(P, `select public.purge_stale_positions()`)).rejects.toThrow(/permission denied/);
    await q(S, `update public.course_settings set tournament_live = false where course_name = $1`, [C]);
  });
});

describe('support tickets', () => {
  const ticket = (u: string, extra = '') =>
    q(u, `insert into public.support_tickets (course_name, category, description, diagnostics${extra ? ', contact' : ''}) values ($1, 'GPS Tracking', 'Distances froze on hole 7 after a call', $2${extra ? ', $3' : ''}) returning id`,
      extra ? [C, JSON.stringify({ appVersion: '1.0.0', view: 'player/hud' }), extra] : [C, JSON.stringify({ appVersion: '1.0.0', view: 'player/hud' })]);
  it('reporters create and read their own; staff read the course inbox and set status', async () => {
    const id = ((await ticket(P)).rows[0] as { id: string }).id;
    expect((await q(Q, `select * from public.support_tickets`)).rows).toHaveLength(0);
    expect((await q(S, `select * from public.support_tickets`)).rows).toHaveLength(1);
    await expect(q(P, `update public.support_tickets set status = 'resolved' where id = $1`, [id])).resolves.toMatchObject({ affectedRows: 0 });
    await expect(q(P, `insert into public.support_tickets (category, description, status) values ('Other', 'I am closing my own ticket', 'resolved')`)).rejects.toThrow(/permission denied/);
    expect((await q(S, `update public.support_tickets set status = 'investigating', note = 'repro on iOS 19' where id = $1`, [id])).affectedRows).toBe(1);
  });
  it('rejects markup, oversized diagnostics and spam', async () => {
    await expect(q(P, `insert into public.support_tickets (category, description) values ('Other', '<img src=x onerror=alert(1)>')`)).rejects.toThrow(/check constraint/);
    await expect(q(P, `insert into public.support_tickets (category, description, diagnostics) values ('Other', 'big diagnostics blob', $1)`, [JSON.stringify({ x: 'a'.repeat(13000) })])).rejects.toThrow(/check constraint/);
    for (let i = 0; i < 9; i++) await ticket(P);
    await expect(ticket(P)).rejects.toThrow(/ticket_rate_limited/);
  });
});

describe('check-in', () => {
  it('only staff check teams in; captains cannot check themselves in', async () => {
    await expect(q(P, `update public.registrations set checked_in_at = now()`)).rejects.toThrow(/staff_only/);
    expect((await q(S, `update public.registrations set checked_in_at = now()`)).affectedRows).toBe(1);
    expect((await q(S, `update public.registrations set checked_in_at = null`)).affectedRows).toBe(1); // undo
  });
});
