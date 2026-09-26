import { as, createDb, signUp, type Db } from './harness';

const S = '00000000-0000-4000-8000-0000000000b1'; // staff
const P = '00000000-0000-4000-8000-0000000000b2'; // player
const C = 'Somerby Golf Club';
let db: Db;
const q = (u: string, sql: string, params: unknown[] = []) => as(db, 'authenticated', u, () => db.query(sql, params));
const block = (u: string, reason: string, start: string, end: string, from: string | null = null, to: string | null = null) =>
  q(u, `insert into public.tee_blocks (course_name, reason, start_date, end_date, from_time, to_time) values ($1, $2, $3, $4, $5, $6)`, [C, reason, start, end, from, to]);
// Times are Central (course timezone); -05 is CDT.
const reserve = (at: string) =>
  q(S, `insert into public.tee_times (course_name, starts_at, status, name, party_size, phone) values ($1, $2, 'reserved', 'Pat Walker', 3, '+15075550142')`, [C, at]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[S, 'staff'], [P, 'player']]) await signUp(db, id, h);
  await db.query(`insert into public.staff_members (user_id, course_name, role) values ($1, $2, 'staff')`, [S, C]);
}, 60_000);

describe('tee sheet blocks', () => {
  it('staff block a time window or a date range, with a reason from the list', async () => {
    await block(S, 'Irrigation repair', '2026-10-01', '2026-10-01', '09:00', '10:00');
    await block(S, 'Season Closed', '2026-11-16', '2027-03-31');
    await expect(block(S, 'Because', '2026-10-02', '2026-10-02')).rejects.toThrow(/check constraint/);
    await expect(block(S, 'Maintenance', '2026-10-05', '2026-10-04')).rejects.toThrow(/check constraint/);
    await expect(block(S, 'Maintenance', '2026-10-05', '2026-10-05', '10:00', null)).rejects.toThrow(/check constraint/);
    await expect(block(S, 'Maintenance', '2026-10-05', '2027-10-06')).rejects.toThrow(/check constraint/);
  });
  it('players cannot see or create blocks', async () => {
    await expect(block(P, 'Private Event', '2026-10-03', '2026-10-03')).rejects.toThrow(/row-level security/);
    expect((await q(P, `select * from public.tee_blocks`)).rows).toHaveLength(0);
    expect((await q(S, `select * from public.tee_blocks`)).rows).toHaveLength(2);
  });
  it('reservations inside a block are refused; outside it they are fine', async () => {
    await expect(reserve('2026-10-01 09:30-05')).rejects.toThrow(/tee_time_blocked/);
    await expect(reserve('2026-10-01 10:00-05')).resolves.toBeTruthy(); // window end is exclusive
    await expect(reserve('2027-01-10 12:00-06')).rejects.toThrow(/tee_time_blocked/);
    await expect(reserve('2027-04-01 12:00-05')).resolves.toBeTruthy();
  });
});
