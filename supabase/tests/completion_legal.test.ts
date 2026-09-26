import { as, createDb, signUp, type Db } from './harness';

const P = '00000000-0000-4000-8000-0000000000c1'; // player
const Q = '00000000-0000-4000-8000-0000000000c2'; // another player
const S = '00000000-0000-4000-8000-0000000000c3'; // staff
const C = 'Somerby Golf Club';
let db: Db;
let ev: string;
const q = (u: string, sql: string, params: unknown[] = []) => as(db, 'authenticated', u, () => db.query(sql, params));
const order = (items: unknown) => q(P, `insert into public.orders (course_name, kind, hole, lat, lng, items) values ($1, 'order', 5, 44.05, -92.63, $2) returning id, status, completed_at`, [C, JSON.stringify(items)]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[P, 'pat'], [Q, 'quin'], [S, 'staff']]) await signUp(db, id, h);
  await db.query(`insert into public.staff_members (user_id, course_name, role) values ($1, $2, 'organizer')`, [S, C]);
  await db.query(`update public.course_settings set kitchen_open = '00:01', kitchen_close = '00:00', in_house = true, tournament_live = true where course_name = $1`, [C]); // charity mulligans: live in-house event
  ev = (await db.query<{ id: string }>(`insert into public.events (course_name, name, starts_at, foursome_price_cents) values ($1, 'Kid''s Cup', now() + interval '7 days', 60000) returning id`, [C])).rows[0].id;
}, 60_000);

describe('Mark Completed + End of Day tally', () => {
  it('staff complete orders; the server stamps completion; players cannot', async () => {
    const o = (await order([{ sku: 'BEER_DRAFT', qty: 2 }, { sku: 'TEES', qty: 1 }])).rows[0] as { id: string; status: string; completed_at: string | null };
    expect(o).toMatchObject({ status: 'new', completed_at: null });
    await expect(q(P, `update public.orders set status = 'completed' where id = $1`, [o.id])).rejects.toThrow(/row-level security/); // players may only cancel
    await expect(q(S, `update public.orders set status = 'delivered' where id = $1`, [o.id])).rejects.toThrow(/check constraint/);
    await q(S, `update public.orders set status = 'completed' where id = $1`, [o.id]);
    const row = await db.query<{ completed_at: string | null }>(`select completed_at from public.orders where id = $1`, [o.id]);
    expect(row.rows[0].completed_at).not.toBeNull();
    // Charity-only orders complete on purchase.
    expect((await order([{ sku: 'MULLIGAN', qty: 1 }])).rows[0]).toMatchObject({ status: 'completed' });
  });
  it('tallies completed orders by item for staff only', async () => {
    await order([{ sku: 'HOTDOG', qty: 1 }]); // still open: not counted
    const day = (await db.query<{ d: string }>(`select (now() at time zone 'America/Chicago')::date::text d`)).rows[0].d;
    const t = await q(S, `select sku, qty::int, revenue_cents::int from public.eod_tally($1, $2::date)`, [C, day]);
    expect(t.rows).toEqual([
      { sku: 'BEER_DRAFT', qty: 2, revenue_cents: 1400 },
      { sku: 'MULLIGAN', qty: 1, revenue_cents: 1000 },
      { sku: 'TEES', qty: 1, revenue_cents: 500 },
    ]);
    expect((await q(P, `select * from public.eod_tally($1, $2::date)`, [C, day])).rows).toHaveLength(0);
  });
});

describe('event branding', () => {
  it('only the course staff edit the event page; markup and odd files are refused', async () => {
    expect((await q(P, `update public.events set description = 'hacked' where id = $1`, [ev])).affectedRows).toBe(0);
    expect((await q(S, `update public.events set description = 'Lunch at noon', banner_path = 'kids-cup/flyer.pdf', banner_type = 'application/pdf' where id = $1`, [ev])).affectedRows).toBe(1);
    await expect(q(S, `update public.events set description = '<script>x</script>' where id = $1`, [ev])).rejects.toThrow(/check constraint/);
    await expect(q(S, `update public.events set banner_path = '../../etc/passwd' where id = $1`, [ev])).rejects.toThrow(/check constraint/);
  });
});

describe('legal acceptances', () => {
  it('players record their own acceptances; the log is append-only', async () => {
    await q(P, `insert into public.legal_acceptances (document, version, context) values ('tos', '2026-09-26', 'signup'), ('privacy', '2026-09-26', 'signup')`);
    await q(P, `insert into public.legal_acceptances (document, version, context, event_id) values ('waiver', '2026-09-26', 'checkout', $1)`, [ev]);
    await expect(q(P, `insert into public.legal_acceptances (user_id, document, version, context) values ($1, 'tos', '2026-09-26', 'signup')`, [Q])).rejects.toThrow(/permission denied/);
    await expect(q(P, `update public.legal_acceptances set version = '2020-01-01'`)).rejects.toThrow(/permission denied/);
    await expect(q(P, `delete from public.legal_acceptances`)).rejects.toThrow(/permission denied/);
    expect((await q(Q, `select * from public.legal_acceptances`)).rows).toHaveLength(0);
    // Organizer sees waivers for their event only.
    const staff = await q(S, `select document from public.legal_acceptances`);
    expect(staff.rows).toEqual([{ document: 'waiver' }]);
  });
});
