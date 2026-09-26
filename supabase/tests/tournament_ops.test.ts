import { as, createDb, signUp, type Db } from './harness';

const CAP = '00000000-0000-4000-8000-0000000000a1'; // captain
const MATE = '00000000-0000-4000-8000-0000000000a2'; // teammate (on the roster by phone)
const OUT = '00000000-0000-4000-8000-0000000000a3'; // not registered
const S = '00000000-0000-4000-8000-0000000000a4'; // staff
const C = 'Somerby Golf Club';
const ON: [number, number] = [44.0475, -92.6318]; // on the course
const HOME: [number, number] = [44.0121, -92.4802]; // Rochester
let db: Db;
let ev: string;

const slot = (first: string, phone: string) => ({ first, last: 'Golfer', phone, email: `${first.toLowerCase()}@example.com` });
const empty = { first: '', last: '', phone: '', email: '' };
const q = (u: string, sql: string, params: unknown[] = []) => as(db, 'authenticated', u, () => db.query(sql, params));
const ping = (u: string, [lat, lng]: [number, number]) =>
  q(u, `insert into public.live_positions (event_id, lat, lng) values ($1, $2, $3)
        on conflict (player_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now()`, [ev, lat, lng]);
const setLive = (live: boolean) => q(S, `update public.course_settings set tournament_live = $2 where course_name = $1`, [C, live]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[CAP, 'cap'], [MATE, 'mate'], [OUT, 'outsider'], [S, 'staff']]) await signUp(db, id, h);
  await db.query(`update auth.users set phone = '15075550111' where id = $1`, [MATE]);
  await db.query(`insert into public.staff_members (user_id, course_name, role) values ($1, $2, 'organizer')`, [S, C]);
  ev = (await db.query<{ id: string }>(`insert into public.events (course_name, name, starts_at, foursome_price_cents) values ($1, 'Kid''s Cup Charity Tournament', now() + interval '7 days', 60000) returning id`, [C])).rows[0].id;
  await q(CAP, `insert into public.registrations (event_id, team_name, roster) values ($1, 'Fore Play', $2)`,
    [ev, JSON.stringify([slot('Marcus', '+15075550111'), empty, empty])]);
}, 60_000);

describe('hours of operation', () => {
  it('locks food & drink when the kitchen is closed; pro shop still sells', async () => {
    await q(S, `update public.course_settings set kitchen_open = '00:00', kitchen_close = '00:00' where course_name = $1`, [C]);
    const order = (sku: string) => q(CAP, `insert into public.orders (course_name, kind, hole, lat, lng, items) values ($1, 'order', 3, 44.05, -92.63, $2)`, [C, JSON.stringify([{ sku, qty: 1 }])]);
    await expect(order('BEER_DRAFT')).rejects.toThrow(/kitchen_closed/);
    await expect(order('TEES')).resolves.toBeTruthy();
    await q(S, `update public.course_settings set kitchen_open = '00:01', kitchen_close = '00:00' where course_name = $1`, [C]);
    await expect(order('BEER_DRAFT')).resolves.toBeTruthy();
  });
  it('only staff change pace and hours', async () => {
    const r = await q(CAP, `update public.course_settings set pace_min_per_hole = 20 where course_name = $1`, [C]);
    expect(r.affectedRows).toBe(0);
    expect((await q(S, `update public.course_settings set pace_min_per_hole = 14.5, pace_alert_min = 12 where course_name = $1`, [C])).affectedRows).toBe(1);
    await expect(q(S, `update public.course_settings set pace_min_per_hole = 3 where course_name = $1`, [C])).rejects.toThrow(/check constraint/);
  });
});

describe('pre-tournament roster edits', () => {
  it('open slots are valid; half-filled slots are not', async () => {
    await expect(q(CAP, `update public.registrations set roster = $1`, [JSON.stringify([slot('Marcus', '+15075550111'), { ...empty, first: 'Half' }, empty])])).rejects.toThrow(/check constraint/);
  });
  it('captain swaps a player before the event; others cannot', async () => {
    const swap = JSON.stringify([slot('Marcus', '+15075550111'), slot('Sarah', '+15075550112'), empty]);
    expect((await q(OUT, `update public.registrations set roster = $1`, [swap])).affectedRows).toBe(0);
    expect((await q(CAP, `update public.registrations set roster = $1`, [swap])).affectedRows).toBe(1);
    await expect(q(CAP, `update public.registrations set paid = true`)).rejects.toThrow(/permission denied/);
  });
});

describe('geofenced live positions', () => {
  it('nothing can be recorded before the tournament starts', async () => {
    await expect(ping(CAP, ON)).rejects.toThrow(/row-level security/);
  });
  it('live: registered players on the property only; staff see them', async () => {
    await setLive(true);
    const s = await db.query<{ live_since: string | null }>(`select live_since from public.course_settings where course_name = $1`, [C]);
    expect(s.rows[0].live_since).not.toBeNull();
    await ping(CAP, ON);
    await ping(MATE, ON); // on the roster by phone
    await expect(ping(OUT, ON)).rejects.toThrow(/row-level security/); // not registered
    await db.query(`update public.live_positions set updated_at = now() - interval '1 hour'`); // past the rate limit
    await expect(ping(CAP, HOME)).rejects.toThrow(/row-level security/); // off property
    const staff = await q(S, `select player_id from public.live_positions`);
    expect(staff.rows).toHaveLength(2);
    expect((await q(OUT, `select * from public.live_positions`)).rows).toHaveLength(0);
  });
  it('rosters lock once live (staff can still override)', async () => {
    const swap = JSON.stringify([slot('Marcus', '+15075550111'), slot('Alex', '+15075550113'), empty]);
    expect((await q(CAP, `update public.registrations set roster = $1`, [swap])).affectedRows).toBe(0);
    expect((await q(S, `update public.registrations set roster = $1`, [swap])).affectedRows).toBe(1);
  });
  it('kill switch: a player deletes their own fix; ending the event wipes the rest', async () => {
    expect((await q(MATE, `delete from public.live_positions`)).affectedRows).toBe(1);
    await setLive(false);
    const left = await db.query(`select * from public.live_positions`);
    expect(left.rows).toHaveLength(0);
    await expect(ping(CAP, ON)).rejects.toThrow(/row-level security/);
  });
});

describe('tee sheet', () => {
  const book = (u: string, at: string, extra = `'reserved', 'Pat Walker', 3, '+15075550142'`) =>
    q(u, `insert into public.tee_times (course_name, starts_at, status, name, party_size, phone) values ($1, $2, ${extra})`, [C, at]);
  it('staff take phone bookings and blocks; one per slot; players have no access', async () => {
    await book(S, '2026-10-01 09:10-05');
    await expect(book(S, '2026-10-01 09:10-05')).rejects.toThrow(/duplicate key/);
    await book(S, '2026-10-01 09:20-05', `'blocked', 'Aerification', 0, null`);
    await expect(book(S, '2026-10-01 09:30-05', `'reserved', 'No Phone', 2, null`)).rejects.toThrow(/check constraint/);
    await expect(book(CAP, '2026-10-01 09:40-05')).rejects.toThrow(/row-level security/);
    expect((await q(CAP, `select * from public.tee_times`)).rows).toHaveLength(0);
    expect((await q(S, `select * from public.tee_times`)).rows).toHaveLength(2);
  });
});
