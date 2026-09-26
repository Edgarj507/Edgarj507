import { as, createDb, signUp, type Db } from './harness';

const OWN = '00000000-0000-4000-8000-00000000b0f1'; // course owner
const MGR = '00000000-0000-4000-8000-00000000b0f2'; // assistant manager (no 'staff' perm at first)
const PRO = '00000000-0000-4000-8000-00000000b0f3'; // pro shop (invited, claims later)
const OUT = '00000000-0000-4000-8000-00000000b0f4'; // outsider / another course's owner
const NIA = '00000000-0000-4000-8000-00000000b0f5'; // invited before she had an account
const C = 'Somerby Golf Club';
let db: Db;
const q = <T = Record<string, unknown>>(u: string, sql: string, params: unknown[] = []) => as(db, 'authenticated', u, () => db.query<T>(sql, params));
const add = (u: string, name: string, email: string, title: string, perms: string[], pin: string | null = null, org = C) =>
  q<{ id: string }>(u, `select public.staff_add($1, $2, $3, $4, $5, $6) as id`, [org, name, email, title, perms, pin]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, h] of [[OWN, 'gina'], [MGR, 'max'], [PRO, 'pat'], [OUT, 'otto']]) await signUp(db, id, h);
  await db.query(`update auth.users set email = $2 where id = $1`, [PRO, 'pat@somerby.example']).catch(async () => {
    await db.exec(`alter table auth.users add column if not exists email text`);
    await db.query(`update auth.users set email = $2 where id = $1`, [PRO, 'pat@somerby.example']);
  });
  await db.query(`insert into public.staff_members (user_id, course_name, role, name, email, title) values ($1, $2, 'staff', 'Gina', 'gina@somerby.example', 'owner')`, [OWN, C]);
  await db.query(`insert into public.staff_members (user_id, course_name, role, name, email, title) values ($1, 'Eastwood Golf Course', 'staff', 'Otto', 'otto@eastwood.example', 'owner')`, [OUT]);
}, 60_000);

describe('staff directory administration', () => {
  it('owner adds staff with permissions and a PIN; weak or duplicate PINs refused', async () => {
    await add(OWN, 'Max Manager', 'max@somerby.example', 'assistant_manager', ['orders', 'store', 'teeSheet'], '48291');
    await db.query(`update public.staff_members set user_id = $1 where email = 'max@somerby.example'`, [MGR]);
    await expect(add(OWN, 'Weak', 'weak@somerby.example', 'pro_shop', ['orders'], '1234')).rejects.toThrow(/weak_pin/);
    await expect(add(OWN, 'Seq', 'seq@somerby.example', 'pro_shop', ['orders'], '3456')).rejects.toThrow(/weak_pin/);
    await expect(add(OWN, 'Dup', 'dup@somerby.example', 'pro_shop', ['orders'], '48291')).rejects.toThrow(/pin_in_use/);
    await add(OWN, 'Pat Pro', 'pat@somerby.example', 'pro_shop', ['orders', 'store'], '615204');
    const pins = (await q<{ pin_hash: string }>(OWN, `select * from public.staff_members`).catch((e) => e));
    expect(String(pins)).toMatch(/permission denied/); // hashes are not selectable
  });
  it('only people with the staff permission manage staff; only owners grant staff/owner', async () => {
    await expect(add(MGR, 'X', 'x@somerby.example', 'pro_shop', ['orders'])).rejects.toThrow(/not_allowed/);
    await expect(add(OUT, 'X', 'x@somerby.example', 'pro_shop', ['orders'])).rejects.toThrow(/not_allowed/); // other course
    const max = (await q<{ id: string }>(OWN, `select id from public.staff_members where email = 'max@somerby.example'`)).rows[0].id;
    await q(OWN, `select public.staff_update($1, 'assistant_manager', $2)`, [max, ['orders', 'store', 'teeSheet', 'staff']]);
    await expect(add(MGR, 'Own2', 'own2@somerby.example', 'owner', ['orders'])).rejects.toThrow(/owner_only/);
    await expect(add(MGR, 'Adm', 'adm@somerby.example', 'pro_shop', ['staff'])).rejects.toThrow(/owner_only/);
    await add(MGR, 'Kim Kitchen', 'kim@somerby.example', 'kitchen_bev', ['orders'], '7304');
    const own = (await q<{ id: string }>(OWN, `select id from public.staff_members where title = 'owner' and course_name = $1`, [C])).rows[0].id;
    await expect(q(MGR, `select public.staff_set_active($1, false)`, [own])).rejects.toThrow(/owner_only/);
    await expect(q(OWN, `select public.staff_set_active($1, false)`, [own])).rejects.toThrow(/not_yourself|last_owner/);
    await expect(q(OWN, `select public.staff_update($1, 'pro_shop', $2)`, [own, ['orders']])).rejects.toThrow(/last_owner/);
  });
  it('permissions gate powers: store edits need the store permission', async () => {
    await db.query(`insert into public.staff_members (user_id, course_name, role, name, email, title, permissions) values ($1, $2, 'staff', 'Otto helper', 'otto2@x.example', 'kitchen_bev', array['orders'])`, [OUT, C]);
    expect((await q(OUT, `update public.menu_items set price_cents = 1 where sku = 'TEES'`)).affectedRows).toBe(0);
    expect((await q(MGR, `update public.menu_items set price_cents = 600 where sku = 'TEES'`)).affectedRows).toBe(1);
    expect((await q(MGR, `update public.course_settings set live_ordering = false where course_name = $1`, [C])).affectedRows).toBe(0); // no 'settings'
  });
});

describe('PIN quick-switch, invites and revocation', () => {
  it('PIN login needs a signed-in terminal for that course; returns the person', async () => {
    await signUp(db, NIA, 'nia');
    await expect(q(NIA, `select * from public.staff_pin_login('615204', $1)`, [C])).rejects.toThrow(/terminal_not_signed_in/); // not course staff
    const r = (await q<{ name: string; permissions: string[] }>(OWN, `select * from public.staff_pin_login('615204', $1)`, [C])).rows[0];
    expect(r).toMatchObject({ name: 'Pat Pro', permissions: ['orders', 'store'] });
    expect((await q(OUT, `select * from public.staff_pin_login('615204', 'Eastwood Golf Course')`)).rows).toHaveLength(0); // other course's PINs don't work
  });
  it('staff are linked to existing accounts by email; invited staff claim their row on first sign-in', async () => {
    expect((await q<{ name: string }>(PRO, `select name from public.my_staff_session('clubhouse')`)).rows[0].name).toBe('Pat Pro'); // existing account linked on add
    await add(OWN, 'Nia New', 'nia@somerby.example', 'marshal', ['teeSheet'], '50731');
    await db.query(`update auth.users set email = 'nia@somerby.example' where id = $1`, [NIA]);
    expect((await q(NIA, `select * from public.my_staff_session('clubhouse')`)).rows).toHaveLength(0);
    expect((await q<{ n: number }>(NIA, `select public.claim_staff_invite() as n`)).rows[0].n).toBe(1);
    expect((await q<{ name: string }>(NIA, `select name from public.my_staff_session('clubhouse')`)).rows[0].name).toBe('Nia New');
  });
  it('5 wrong PINs lock the course terminals; deactivation revokes instantly', async () => {
    for (let i = 0; i < 5; i++) expect((await q(OWN, `select * from public.staff_pin_login('999990', $1)`, [C])).rows).toHaveLength(0);
    await expect(q(OWN, `select * from public.staff_pin_login('615204', $1)`, [C])).rejects.toThrow(/locked/);
    await db.query(`update public.staff_pin_attempts set locked_until = null`);
    const pat = (await q<{ id: string }>(OWN, `select id from public.staff_members where email = 'pat@somerby.example'`)).rows[0].id;
    await q(OWN, `select public.staff_set_active($1, false)`, [pat]);
    expect((await q(OWN, `select * from public.staff_pin_login('615204', $1)`, [C])).rows).toHaveLength(0);
    expect((await q(PRO, `select * from public.my_staff_session('clubhouse')`)).rows).toHaveLength(0);
    expect((await q(PRO, `select public.is_staff($1) as s`, [C])).rows[0]).toEqual({ s: false });
    await expect(q(OWN, `select public.staff_remove($1)`, [(await q<{ id: string }>(OWN, `select id from public.staff_members where email = 'kim@somerby.example'`)).rows[0].id])).rejects.toThrow(/deactivate_first/);
    await q(OWN, `select public.staff_remove($1)`, [pat]);
    const audit = (await q<{ ok: boolean }>(OWN, `select ok from public.staff_access_audit`)).rows;
    expect(audit.filter((a) => !a.ok).length).toBeGreaterThanOrEqual(5);
    expect((await q(PRO, `select * from public.staff_access_audit`)).rows).toHaveLength(0);
  });
});
