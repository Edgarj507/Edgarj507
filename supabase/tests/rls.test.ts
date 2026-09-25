import { as, createDb, signUp, type Db } from './harness';

const A = '00000000-0000-4000-8000-00000000000a'; // alice
const B = '00000000-0000-4000-8000-00000000000b'; // bob (friend of alice)
const C = '00000000-0000-4000-8000-00000000000c'; // carol (stranger)
const PARS = '{4,5,3,4,4,3,5,4,4,4,3,5,4,4,3,4,5,4}';

let db: Db;

const rejects = async (p: Promise<unknown>, match: RegExp) => {
  await expect(p).rejects.toThrow(match);
};

async function makeRound(owner: string, opts: { visibility?: string; length?: string } = {}) {
  return as(db, 'authenticated', owner, async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.rounds (owner_id, course_name, tee, format, length, pars, visibility)
       values ($1, 'Somerby Golf Club', 'blue', 'Stroke Play', $2, $3, $4) returning id`,
      [owner, opts.length ?? '18', PARS, opts.visibility ?? 'friends'],
    );
    await db.query(`insert into public.round_players (round_id, user_id) values ($1, $2)`, [rows[0].id, owner]);
    return rows[0].id;
  });
}

const record = (user: string, round: string, hole: number, strokes: number, putts = 0, pace = 0) =>
  as(db, 'service_role', null, () =>
    db.query(`select * from public.record_hole_score($1, $2, $3, $4, $5, $6)`, [user, round, hole, strokes, putts, pace]),
  );

beforeAll(async () => {
  db = await createDb();
  await signUp(db, A, 'alice', 'Alice');
  await signUp(db, B, 'bob', 'Bob');
  await signUp(db, C, 'carol', 'Carol');
  // alice → bob friend request, bob accepts
  await as(db, 'authenticated', A, () => db.query(`insert into public.friendships (user_id, friend_id) values ($1, $2)`, [A, B]));
  await as(db, 'authenticated', B, () => db.query(`update public.friendships set status = 'accepted' where user_id = $1`, [A]));
});

describe('signup', () => {
  it('creates a profile and an empty bag; sanitizes bad handles', async () => {
    await signUp(db, '00000000-0000-4000-8000-0000000000dd', '<script>', '<b>Eve</b>');
    const { rows } = await db.query<{ handle: string; display_name: string }>(`select handle, display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000dd'`);
    expect(rows[0].handle).toMatch(/^golfer_[0-9a-f]{8}$/);
    expect(rows[0].display_name).toBe('bEve/b');
  });
});

describe('anon', () => {
  it('cannot read anything', async () => {
    for (const t of ['profiles', 'bags', 'rounds', 'hole_scores', 'friendships', 'profile_cards']) {
      await rejects(as(db, 'anon', null, () => db.query(`select * from public.${t}`)), /permission denied/);
    }
  });
});

describe('profiles & privacy', () => {
  it('full profile rows are self-only', async () => {
    const { rows } = await as(db, 'authenticated', C, () => db.query(`select id from public.profiles`));
    expect(rows).toEqual([{ id: C }]);
  });

  it('handicap on profile cards follows handicap_visibility', async () => {
    await as(db, 'authenticated', A, () => db.query(`update public.profiles set handicap = 7.4, handicap_visibility = 'friends' where id = $1`, [A]));
    const card = (viewer: string) =>
      as(db, 'authenticated', viewer, () => db.query<{ handicap: string | null }>(`select handicap from public.profile_cards where id = $1`, [A]));
    expect((await card(B)).rows[0].handicap).toBe('7.4'); // friend
    expect((await card(C)).rows[0].handicap).toBeNull(); // stranger
    await as(db, 'authenticated', A, () => db.query(`update public.profiles set handicap_visibility = 'private' where id = $1`, [A]));
    expect((await card(B)).rows[0].handicap).toBeNull();
    await as(db, 'authenticated', A, () => db.query(`update public.profiles set handicap_visibility = 'public' where id = $1`, [A]));
    expect((await card(C)).rows[0].handicap).toBe('7.4');
  });

  it('cannot edit another profile or break handle rules', async () => {
    const { affectedRows } = await as(db, 'authenticated', C, () => db.query(`update public.profiles set display_name = 'pwned' where id = $1`, [A]));
    expect(affectedRows).toBe(0);
    await rejects(as(db, 'authenticated', A, () => db.query(`update public.profiles set handle = 'Bad Handle!' where id = $1`, [A])), /check constraint/);
    await rejects(as(db, 'authenticated', A, () => db.query(`update public.profiles set display_name = '<img onerror=x>' where id = $1`, [A])), /check constraint/);
  });
});

describe('bags', () => {
  it('are private to their owner', async () => {
    await as(db, 'authenticated', A, () => db.query(`update public.bags set carries = '{"7i":170}' where user_id = $1`, [A]));
    const mine = await as(db, 'authenticated', A, () => db.query(`select carries from public.bags`));
    expect(mine.rows).toEqual([{ carries: { '7i': 170 } }]);
    const theirs = await as(db, 'authenticated', B, () => db.query(`select * from public.bags where user_id = $1`, [A]));
    expect(theirs.rows).toHaveLength(0);
    const upd = await as(db, 'authenticated', B, () => db.query(`update public.bags set notes = 'x' where user_id = $1`, [A]));
    expect(upd.affectedRows).toBe(0);
    await rejects(as(db, 'authenticated', B, () => db.query(`insert into public.bags (user_id) values ($1)`, [A])), /row-level security|duplicate/);
  });
});

describe('friendships', () => {
  it('only the addressee can accept; strangers cannot see', async () => {
    await as(db, 'authenticated', C, () => db.query(`insert into public.friendships (user_id, friend_id) values ($1, $2)`, [C, A]));
    const selfAccept = await as(db, 'authenticated', C, () => db.query(`update public.friendships set status = 'accepted' where user_id = $1 and friend_id = $2`, [C, A]));
    expect(selfAccept.affectedRows).toBe(0);
    const seenByB = await as(db, 'authenticated', B, () => db.query(`select * from public.friendships where user_id = $1`, [C]));
    expect(seenByB.rows).toHaveLength(0);
    await rejects(as(db, 'authenticated', C, () => db.query(`insert into public.friendships (user_id, friend_id, status) values ($1, $2, 'accepted')`, [C, B])), /permission denied|row-level security/);
  });
});

describe('rounds', () => {
  it('cannot be created for someone else; only friends can be added as players', async () => {
    await rejects(
      as(db, 'authenticated', C, () => db.query(`insert into public.rounds (owner_id, course_name, tee, format, length, pars) values ($1, 'X', 'blue', 'Stroke Play', '18', $2)`, [A, PARS])),
      /row-level security/,
    );
    const r = await makeRound(A);
    await as(db, 'authenticated', A, () => db.query(`insert into public.round_players (round_id, user_id) values ($1, $2)`, [r, B]));
    await rejects(as(db, 'authenticated', A, () => db.query(`insert into public.round_players (round_id, user_id) values ($1, $2)`, [r, C])), /row-level security/);
  });

  it('visibility: friends round is hidden from strangers', async () => {
    const r = await makeRound(A, { visibility: 'friends' });
    const see = (u: string) => as(db, 'authenticated', u, () => db.query(`select id from public.rounds where id = $1`, [r]));
    expect((await see(B)).rows).toHaveLength(1);
    expect((await see(C)).rows).toHaveLength(0);
  });
});

describe('hole scores: anti-tamper', () => {
  it('clients cannot write scores directly, even for themselves', async () => {
    const r = await makeRound(A);
    await rejects(as(db, 'authenticated', A, () => db.query(`insert into public.hole_scores (round_id, user_id, hole, strokes) values ($1, $2, 1, 3)`, [r, A])), /permission denied/);
    await rejects(as(db, 'authenticated', A, () => db.query(`select public.record_hole_score($1, $2, 1, 4)`, [A, r])), /permission denied/);
  });

  it('enforces golf rules server-side', async () => {
    const r = await makeRound(A, { length: 'back' });
    await rejects(record(A, r, 3, 4), /hole_out_of_range/); // back nine only
    await rejects(record(A, r, 10, 0), /strokes_out_of_range/);
    await rejects(record(A, r, 10, 16), /strokes_out_of_range/);
    await rejects(record(A, r, 10, 3, 4), /putts_out_of_range/);
    await rejects(record(A, r, 14, 4), /hole_out_of_sequence/); // skipped 10–13
    await rejects(record(C, r, 10, 4), /not_participant/);
    await record(A, r, 10, 4, 2);
    await rejects(record(A, r, 11, 4, 2, 60), /too_fast/); // 60s pace floor
    await record(A, r, 11, 5, 2);
    // corrections are bounded
    for (let i = 0; i < 3; i++) await record(A, r, 11, 4 + (i % 2), 2);
    await rejects(record(A, r, 11, 4, 2), /too_many_edits/);
  });

  it('closed rounds are frozen', async () => {
    const r = await makeRound(A);
    await record(A, r, 1, 4);
    await as(db, 'authenticated', A, () => db.query(`update public.rounds set status = 'completed' where id = $1`, [r]));
    await rejects(record(A, r, 2, 4), /round_not_active/);
    await rejects(as(db, 'service_role', null, () => db.query(`update public.hole_scores set strokes = 1 where round_id = $1`, [r])), /round_not_active/);
    await rejects(as(db, 'authenticated', A, () => db.query(`update public.rounds set status = 'active' where id = $1`, [r])), /round_closed/);
  });

  it('score reads respect stats privacy; leaderboard only shows what you may see', async () => {
    const r = await makeRound(A, { visibility: 'public' });
    await as(db, 'authenticated', A, () => db.query(`insert into public.round_players (round_id, user_id) values ($1, $2)`, [r, B]));
    await record(A, r, 1, 3);
    await record(B, r, 1, 5);
    await as(db, 'authenticated', A, () => db.query(`update public.profiles set stats_visibility = 'friends' where id = $1`, [A]));
    await as(db, 'authenticated', B, () => db.query(`update public.profiles set stats_visibility = 'private' where id = $1`, [B]));

    const board = (u: string) =>
      as(db, 'authenticated', u, () => db.query<{ user_id: string; to_par: number }>(`select user_id, to_par from public.round_leaderboard where round_id = $1 order by user_id`, [r]));
    expect((await board(A)).rows).toEqual([{ user_id: A, to_par: -1 }]); // bob is private
    expect((await board(B)).rows).toEqual([{ user_id: A, to_par: -1 }, { user_id: B, to_par: 1 }]); // own + friend
    expect((await board(C)).rows).toEqual([]); // stranger: alice is friends-only, bob private
  });
});
