import { as, createDb, signUp, type Db } from './harness';
import { consensus, distanceM, offsetPoint } from '../functions/_shared/pins.ts';
import { greenCenter } from '../../src/data/course';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
const C = '00000000-0000-4000-8000-0000000000c1';
const X = '00000000-0000-4000-8000-0000000000e1'; // not in the round
const PARS = '{4,5,3,4,4,3,5,4,4,4,3,5,4,4,3,4,5,4}';
const GREEN7 = greenCenter(7); // real OSM green; migrations seed the same coordinates
const CUP = offsetPoint(GREEN7, 200, 4);

let db: Db;
let round: string;

const report = (u: string, p: { lat: number; lng: number }, acc = 0.4, source = 'lidar', hole = 7, r = round) =>
  as(db, 'authenticated', u, () =>
    db.query<{ status: string; reports: number; lat: number; lng: number }>(
      `select * from public.report_pin($1, $2, $3, $4, $5, $6)`, [r, hole, p.lat, p.lng, acc, source]));

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[A, 'ann'], [B, 'ben'], [C, 'cat'], [X, 'xan']]) await signUp(db, id, h);
  // A is friends with B and C; A's round includes all three.
  for (const f of [B, C]) {
    await as(db, 'authenticated', A, () => db.query(`insert into public.friendships (user_id, friend_id) values ($1, $2)`, [A, f]));
    await as(db, 'authenticated', f, () => db.query(`update public.friendships set status = 'accepted' where user_id = $1`, [A]));
  }
  round = await as(db, 'authenticated', A, async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.rounds (owner_id, course_name, tee, format, length, pars) values ($1, 'Somerby Golf Club', 'blue', 'Stroke Play', '18', $2) returning id`, [A, PARS]);
    for (const u of [A, B, C]) await db.query(`insert into public.round_players (round_id, user_id) values ($1, $2)`, [rows[0].id, u]);
    return rows[0].id;
  });
});

describe('course greens', () => {
  it('database greens match the app course data', async () => {
    const { rows } = await db.query<{ hole: number; lat: number; lng: number }>(`select hole, lat, lng from public.course_greens where course_name = 'Somerby Golf Club' order by hole`);
    expect(rows).toHaveLength(18);
    for (const r of rows) expect(distanceM(r, greenCenter(r.hole))).toBeLessThan(0.01);
  });
});

describe('report_pin', () => {
  it('rejects non-participants, far-away and imprecise reports', async () => {
    await expect(report(X, CUP)).rejects.toThrow(/not_participant/);
    await expect(report(A, offsetPoint(GREEN7, 0, 80))).rejects.toThrow(/too_far_from_green/);
    await expect(report(A, CUP, 3, 'lidar')).rejects.toThrow(/accuracy_insufficient/);
    await expect(report(A, CUP, 25, 'gps')).rejects.toThrow(/accuracy_insufficient/);
    await expect(report(A, CUP, 0.4, 'lidar', 19)).rejects.toThrow(/hole_out_of_range/);
    await expect(as(db, 'anon', null, () => db.query(`select public.report_pin($1, 7, 0, 0, 1, 'gps')`, [round]))).rejects.toThrow(/permission denied/);
  });

  it('builds a verified consensus that matches the shared TS algorithm', async () => {
    const pts = { [A]: offsetPoint(CUP, 0, 0.3), [B]: offsetPoint(CUP, 120, 0.4), [C]: offsetPoint(CUP, 240, 0.2) };
    let last;
    for (const [u, p] of Object.entries(pts)) last = (await report(u, p)).rows[0];
    expect(last).toMatchObject({ status: 'verified', reports: 3 });
    expect(distanceM(last!, CUP)).toBeLessThan(0.5);

    const now = Date.now();
    const ts = consensus(Object.entries(pts).map(([userId, p]) => ({ userId, ...p, accuracyM: 0.4, source: 'lidar' as const, reportedAt: now })), now)!;
    expect(distanceM(last!, ts)).toBeLessThan(0.2);
  });

  it('rate limits repeat reports and keeps raw reports private', async () => {
    await expect(report(A, CUP)).rejects.toThrow(/too_frequent/);
    const mine = await as(db, 'authenticated', B, () => db.query(`select user_id from public.pin_reports`));
    expect(mine.rows).toEqual([{ user_id: B }]);
    const live = await as(db, 'authenticated', X, () => db.query(`select status from public.pin_positions where hole = 7`));
    expect(live.rows).toEqual([{ status: 'verified' }]); // shared reference data
  });

  it('clients cannot write pin tables directly', async () => {
    await expect(as(db, 'authenticated', A, () => db.query(`insert into public.pin_positions values ('Somerby Golf Club', 7, 0, 0, 99, 0, 'verified', now())`))).rejects.toThrow(/permission denied/);
    await expect(as(db, 'authenticated', A, () => db.query(`select public.recompute_pin('Somerby Golf Club', 7)`))).rejects.toThrow(/permission denied/);
  });
});
