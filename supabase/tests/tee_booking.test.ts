import { as, createDb, signUp, type Db } from './harness';

const G = '00000000-0000-4000-8000-0000000000f1'; // golfer with phone
const H = '00000000-0000-4000-8000-0000000000f2'; // another golfer
const N = '00000000-0000-4000-8000-0000000000f3'; // golfer without phone
const S = '00000000-0000-4000-8000-0000000000f4'; // staff
const C = 'Somerby Golf Club';
let db: Db;
const q = <T = Record<string, unknown>>(u: string, sql: string, params: unknown[] = []) => as(db, 'authenticated', u, () => db.query<T>(sql, params));
// Course-local tee time N days out at HH:MM.
const at = (days: number, hhmm: string) => `(date_trunc('day', now() at time zone 'America/Chicago') + interval '${days} days' + time '${hhmm}') at time zone 'America/Chicago'`;
const book = (u: string, when: string, holes = '18', transport = 'ride', players = 2) =>
  q<{ id: string; total_cents: number }>(u, `select * from public.book_tee_time($1, ${when}, $2, $3, $4)`, [C, holes, transport, players]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[G, 'gil'], [H, 'hal'], [N, 'nophone'], [S, 'staff']]) await signUp(db, id, h);
  await db.query(`update auth.users set phone = '15075550100' where id = $1`, [G]);
  await db.query(`update auth.users set phone = '+15075550101' where id = $1`, [H]);
  await db.query(`insert into public.staff_members (user_id, course_name, role) values ($1, $2, 'staff')`, [S, C]);
}, 60_000);

describe('pricing', () => {
  it('quotes by band, weekday/weekend, holes and cart mode', async () => {
    const quote = async (ts: string, holes: string, tr: string, n: number) =>
      (await q<{ c: number }>(G, `select public.tee_quote($1, $2::timestamptz, $3, $4, $5) as c`, [C, ts, holes, tr, n])).rows[0].c;
    expect(await quote('2026-10-14 08:00 America/Chicago', '18', 'ride', 4)).toBe(4 * 5200 + 4 * 2000); // Wed morning, cart per golfer
    expect(await quote('2026-10-17 16:00 America/Chicago', 'back9', 'walk', 2)).toBe(2 * 2500); // Sat twilight 9 walking
    await q(S, `update public.tee_pricing set cart_mode = 'per-reservation' where course_name = $1`, [C]);
    expect(await quote('2026-10-14 08:00 America/Chicago', '18', 'ride', 4)).toBe(4 * 5200 + 2000);
  });
  it('only staff change pricing and bands; everyone reads them', async () => {
    expect((await q(G, `update public.tee_pricing set cart18_cents = 0 where course_name = $1`, [C])).affectedRows).toBe(0);
    await expect(q(G, `insert into public.tee_rate_bands (course_name, label, from_time, weekday18_cents, weekday9_cents, weekend18_cents, weekend9_cents) values ($1, 'x', '19:00', 1, 1, 1, 1)`, [C])).rejects.toThrow(/row-level security/);
    await q(S, `update public.tee_rate_bands set weekday18_cents = 5500 where course_name = $1 and label = 'Morning'`, [C]);
    expect((await q(G, `select weekday18_cents from public.tee_rate_bands where label = 'Morning'`)).rows[0]).toEqual({ weekday18_cents: 5500 });
    await expect(q(S, `update public.tee_pricing set rules = '<script>' where course_name = $1`, [C])).rejects.toThrow(/check/);
  });
});

describe('golfer booking', () => {
  it('books through the function with a server price; golfers cannot write tee_times directly', async () => {
    await expect(q(G, `insert into public.tee_times (course_name, starts_at, status, name, party_size, phone, source) values ($1, now() + interval '2 days', 'reserved', 'x', 1, '+15075550100', 'app')`, [C])).rejects.toThrow(/row-level security/);
    const r = (await book(G, at(2, '09:00'), '18', 'ride', 2)).rows[0];
    expect(r.total_cents).toBeGreaterThan(0);
    const row = (await q<{ phone: string; source: string; total_cents: number }>(G, `select phone, source, total_cents from public.tee_times`)).rows;
    expect(row).toEqual([{ phone: '+15075550100', source: 'app', total_cents: r.total_cents }]);
    expect((await q(H, `select * from public.tee_times`)).rows).toHaveLength(0); // others' reservations are private
    const avail = (await q<{ status: string }>(H, `select status from public.tee_availability($1, (now() at time zone 'America/Chicago')::date + 2)`, [C])).rows;
    expect(avail).toEqual([{ status: 'taken' }]);
    await expect(book(H, at(2, '09:00'))).rejects.toThrow(/tee_time_taken/);
  });
  it('enforces tee interval, hours, window, walking rule, phone and per-golfer limit', async () => {
    await expect(book(H, at(2, '09:05'))).rejects.toThrow(/not_a_tee_time/);
    await expect(book(H, at(2, '05:00'))).rejects.toThrow(/not_a_tee_time/);
    await expect(book(H, at(40, '09:00'))).rejects.toThrow(/outside_booking_window/);
    await expect(book(H, `now() - interval '1 hour'`)).rejects.toThrow(/tee_time_past/);
    await expect(book(N, at(2, '10:00'))).rejects.toThrow(/phone_required/);
    await q(S, `update public.tee_pricing set walking = false where course_name = $1`, [C]);
    await expect(book(H, at(2, '10:00'), '18', 'walk')).rejects.toThrow(/carts_required/);
    await q(S, `update public.tee_pricing set walking = true where course_name = $1`, [C]);
    await book(G, at(3, '09:00')); await book(G, at(3, '09:10'));
    await expect(book(G, at(3, '09:20'))).rejects.toThrow(/too_many_reservations/);
  });
  it('respects tee-sheet blocks', async () => {
    await q(S, `insert into public.tee_blocks (course_name, reason, start_date, end_date) values ($1, 'Maintenance', (now() at time zone 'America/Chicago')::date + 4, (now() at time zone 'America/Chicago')::date + 4)`, [C]);
    await expect(book(H, at(4, '09:00'))).rejects.toThrow(/tee_time_blocked/);
  });
  it('cancels only own reservations outside the cancellation window', async () => {
    const id = (await book(H, at(5, '08:00'))).rows[0].id;
    await expect(q(G, `select public.cancel_tee_time($1)`, [id])).rejects.toThrow(/not_your_reservation/);
    await q(S, `update public.tee_pricing set cancel_hours = 168 where course_name = $1`, [C]);
    await expect(q(H, `select public.cancel_tee_time($1)`, [id])).rejects.toThrow(/inside_cancellation_window/);
    await q(S, `update public.tee_pricing set cancel_hours = 24 where course_name = $1`, [C]);
    await q(H, `select public.cancel_tee_time($1)`, [id]);
    expect((await q(H, `select * from public.tee_times`)).rows).toHaveLength(0);
  });
});
