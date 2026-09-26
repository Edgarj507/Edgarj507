import { as, createDb, signUp, type Db } from './harness';

const S = '00000000-0000-4000-8000-00000000a0f1'; // Somerby staff
const O = '00000000-0000-4000-8000-00000000a0f2'; // organizer (owns the Eastwood event)
const P = '00000000-0000-4000-8000-00000000a0f3'; // golfer
const C = 'Somerby Golf Club';
let db: Db;
let kids: string, fall: string, east: string;
const q = <T = Record<string, unknown>>(u: string, sql: string, params: unknown[] = []) => as(db, 'authenticated', u, () => db.query<T>(sql, params));
const person = (first: string, last: string, phone: string) => ({ first, last, phone, email: `${first.toLowerCase()}@example.com` });
const empty = { first: '', last: '', phone: '', email: '' };
const register = (u: string, ev: string, team: string, cap: object, roster: object[], paid = 0) =>
  q<{ id: string }>(u, `select public.staff_register($1, $2, $3, $4, $5) as id`, [ev, team, JSON.stringify(cap), JSON.stringify([...roster, empty, empty, empty].slice(0, 3)), paid]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[S, 'staff'], [O, 'olive'], [P, 'pat']]) await signUp(db, id, h);
  await db.query(`insert into public.staff_members (user_id, course_name, role) values ($1, $2, 'staff')`, [S, C]);
  await db.query(`insert into public.organizers (user_id, name, verified) values ($1, 'Olive', true)`, [O]);
  const ev = async (name: string, days: number, extra = '') => (await db.query<{ id: string }>(`insert into public.events (course_name, name, starts_at, foursome_price_cents, max_teams${extra ? ', venue_id, organizer_id' : ''}) values ($1, $2, now() + interval '${days} days', $3, 2${extra}) returning id`, extra ? [extra.includes('east') ? 'Eastwood Golf Course' : C, name, 60000] : [C, name, 60000])).rows[0].id;
  kids = await ev('Kids Cup', 10);
  fall = await ev('Fall Scramble', 20);
  east = (await db.query<{ id: string }>(`insert into public.events (course_name, name, starts_at, foursome_price_cents, max_teams, venue_id, organizer_id) values ('x', 'Eastwood Open', now() + interval '15 days', 48000, 5, 'eastwood', $1) returning id`, [O])).rows[0].id;
}, 60_000);

describe('manual entry', () => {
  it('staff enter a team for the chosen event with a recorded payment; golfers cannot', async () => {
    await expect(register(P, kids, 'Nope', person('Pat', 'P', '+15075550100'), [])).rejects.toThrow(/not_allowed/);
    const id = (await register(S, kids, 'Fore Play', person('Ann', 'Lee', '+15075550101'), [person('Bo', 'Ray', '+15075550102')], 60000)).rows[0].id;
    const r = (await db.query<{ source: string; paid_cents: number; captain_id: string | null }>(`select source, paid_cents, captain_id from public.registrations where id = $1`, [id])).rows[0];
    expect(r).toEqual({ source: 'manual', paid_cents: 60000, captain_id: null });
    expect((await q(S, `select action from public.registration_audit`)).rows).toEqual([{ action: 'manual_entry' }]);
    await expect(register(S, kids, 'Dup', person('Bo', 'Ray', '+15075550102'), [])).rejects.toThrow(/already_registered/);
    await expect(register(S, kids, 'Overpaid', person('Cy', 'Oh', '+15075550103'), [], 99999)).rejects.toThrow(/invalid_payment/);
    await expect(register(S, east, 'Not mine', person('Cy', 'Oh', '+15075550103'), [])).rejects.toThrow(/not_allowed/); // other organizer's event
    await expect(register(S, kids, 'Bad', { ...person('Cy', 'Oh', '+15075550103'), first: '<b>' }, [])).rejects.toThrow(/check/);
  });
  it('refuses full events', async () => {
    await register(S, kids, 'Two', person('Di', 'Mo', '+15075550104'), []);
    await expect(register(S, kids, 'Three', person('Ed', 'No', '+15075550105'), [])).rejects.toThrow(/event_full/);
  });
});

describe('move / reassign', () => {
  const regOf = async (phone: string) => (await db.query<{ id: string; event_id: string; paid_cents: number; total_cents: number }>(`select id, event_id, paid_cents, total_cents from public.registrations where captain_contact ->> 'phone' = $1`, [phone])).rows[0];
  it('staff move a whole team with its payment between their own events', async () => {
    const r = await regOf('+15075550101');
    await q(S, `select public.move_registration($1, $2)`, [r.id, fall]);
    expect(await regOf('+15075550101')).toMatchObject({ event_id: fall, paid_cents: 60000, total_cents: 60000 });
    await expect(q(S, `select public.move_registration($1, $2)`, [r.id, east])).rejects.toThrow(/not_allowed/); // can't manage target
    await expect(q(P, `select public.move_registration($1, $2)`, [r.id, kids])).rejects.toThrow(/not_allowed/);
  });
  it('moves a single player with their share of the payment', async () => {
    const r = await regOf('+15075550101');
    const nid = (await q<{ id: string }>(S, `select public.move_player($1, 0, $2) as id`, [r.id, kids])).rows[0].id;
    expect((await regOf('+15075550101')).paid_cents).toBe(45000); // share = min($600 / 2 players, one $150 seat)
    const n = (await db.query<{ event_id: string; paid_cents: number; total_cents: number; team_name: string }>(`select event_id, paid_cents, total_cents, team_name from public.registrations where id = $1`, [nid])).rows[0];
    expect(n).toEqual({ event_id: kids, paid_cents: 15000, total_cents: 15000, team_name: 'Ray (moved)' });
    await expect(q(S, `select public.move_player($1, 0, $2)`, [r.id, kids])).rejects.toThrow(/empty_slot/);
  });
  it('refuses moving someone into an event they are already in', async () => {
    const r = await regOf('+15075550104'); // Di in Kids Cup
    await register(S, fall, 'Di again', person('Zo', 'Qu', '+15075550199'), [person('Di', 'Mo', '+15075550104')]);
    await expect(q(S, `select public.move_registration($1, $2)`, [r.id, fall])).rejects.toThrow(/already_registered|event_full/);
    expect((await q(S, `select count(*)::int as n from public.registration_audit`)).rows[0]).toEqual({ n: 5 });
  });
});
