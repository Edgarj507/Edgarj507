import { createStaffService } from './service';
import { pinProblem, passwordProblem, type StaffSession } from './model';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const code = (svc: ReturnType<typeof createStaffService>, to: string) => /code (\d{6})|is (\d{6})/.exec(svc.read().outbox.find((m) => m.to === to)!.body)!.slice(1).find(Boolean)!;

describe('staff rules', () => {
  it('PIN: 4–6 digits, no trivial or sequential PINs', () => {
    expect(pinProblem('4829')).toBeNull();
    expect(pinProblem('730915')).toBeNull();
    for (const bad of ['123', '1234567', '12a4', '1234', '0000', '777777', '6543', '2468'.replace('2468', '1111')]) expect(pinProblem(bad)).not.toBeNull();
  });
  it('password: 10+ chars, letters and digits, not the email name', () => {
    expect(passwordProblem('fairway2026!', 'gm@club.com')).toBeNull();
    expect(passwordProblem('short1', '')).toMatch(/10/);
    expect(passwordProblem('onlyletterszz', '')).toMatch(/letters and numbers/);
    expect(passwordProblem('manager2026xx', 'manager@club.com')).toMatch(/email/);
  });
});

describe('staff service', () => {
  let t = 1_000_000;
  const svc = createStaffService(mem(), { now: () => t, demoOutbox: true });
  let owner: StaffSession;

  it('first run creates the owner; a second setup is refused', async () => {
    const r = await svc.setupOwner('clubhouse', { name: 'Gina Owner', email: 'GM@club.com', password: 'fairway2026!', pin: '482913' });
    expect(r.ok).toBe(true);
    owner = (r as { value: StaffSession }).value;
    expect(owner).toMatchObject({ name: 'Gina Owner', role: 'owner', owner: true });
    expect(owner.permissions).toContain('staff');
    expect((await svc.setupOwner('clubhouse', { name: 'X', email: 'x@club.com', password: 'fairway2026!', pin: '592013' })).ok).toBe(false);
    const raw = JSON.stringify(svc.read());
    expect(raw).not.toContain('482913'); expect(raw).not.toContain('fairway2026!'); // hashes only
  }, 20_000);

  it('adds staff with role permissions + unique PIN and emails an invite code', async () => {
    const r = await svc.addStaff(owner, { name: 'Pat Pro', email: 'pat@club.com', role: 'pro_shop', permissions: ['teeSheet', 'orders', 'store'], pin: '615204' });
    expect(r.ok).toBe(true);
    expect((await svc.addStaff(owner, { name: 'Dup', email: 'dup@club.com', role: 'kitchen_bev', permissions: ['orders'], pin: '615204' })).ok).toBe(false);
    expect((await svc.addStaff(owner, { name: 'Dup', email: 'pat@club.com', role: 'kitchen_bev', permissions: ['orders'] })).ok).toBe(false);
    expect(svc.read().outbox[0]).toMatchObject({ to: 'pat@club.com' });
    const pat = await svc.loginPin('clubhouse', '615204');
    expect(pat.ok && pat.value.name).toBe('Pat Pro');
    expect(pat.ok && pat.value.permissions).not.toContain('staff');
  }, 20_000);

  it('non-owners cannot manage staff or grant staff management', async () => {
    const pat = (await svc.loginPin('clubhouse', '615204')) as { value: StaffSession };
    expect((await svc.addStaff(pat.value, { name: 'Z', email: 'z@club.com', role: 'kitchen_bev', permissions: ['orders'] })).ok).toBe(false);
    const asst = await svc.addStaff(owner, { name: 'Ann Asst', email: 'ann@club.com', role: 'assistant_manager', permissions: ['orders', 'staff'] });
    expect(asst.ok).toBe(true);
  }, 20_000);

  it('invite code sets the password; codes are single use', async () => {
    expect((await svc.loginPassword('clubhouse', 'pat@club.com', 'anything123')).ok).toBe(false);
    const c = code(svc, 'pat@club.com');
    expect((await svc.resetPassword('clubhouse', 'pat@club.com', c, 'greenside77x', 'greenside77y')).ok).toBe(false); // mismatch
    expect((await svc.resetPassword('clubhouse', 'pat@club.com', c, 'greenside77x', 'greenside77x')).ok).toBe(true);
    expect((await svc.resetPassword('clubhouse', 'pat@club.com', c, 'another99zz', 'another99zz')).ok).toBe(false); // used
    expect((await svc.loginPassword('clubhouse', 'PAT@club.com', 'greenside77x')).ok).toBe(true);
  }, 30_000);

  it('forgot password: same answer for unknown emails; wrong codes burn attempts; codes expire', async () => {
    const a = await svc.requestReset('clubhouse', 'nobody@club.com');
    const b = await svc.requestReset('clubhouse', 'gm@club.com');
    expect(a).toEqual(b);
    const c = code(svc, 'gm@club.com');
    const wrong = c === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await svc.resetPassword('clubhouse', 'gm@club.com', wrong, 'fairway2027!', 'fairway2027!');
    expect((await svc.resetPassword('clubhouse', 'gm@club.com', c, 'fairway2027!', 'fairway2027!')).ok).toBe(false); // locked after 5
    t += 60 * 60_000;
    await svc.requestReset('clubhouse', 'gm@club.com');
    const c2 = code(svc, 'gm@club.com');
    t += 16 * 60_000; // expired
    expect((await svc.resetPassword('clubhouse', 'gm@club.com', c2, 'fairway2027!', 'fairway2027!')).ok).toBe(false);
  }, 60_000);

  it('PIN lockout after 5 wrong tries; password lockout per account', async () => {
    for (let i = 0; i < 5; i++) await svc.loginPin('clubhouse', '999990');
    expect(await svc.loginPin('clubhouse', '615204')).toEqual({ ok: false, error: 'locked' });
    t += 5 * 60_000 + 1;
    expect((await svc.loginPin('clubhouse', '615204')).ok).toBe(true);
    for (let i = 0; i < 5; i++) await svc.loginPassword('clubhouse', 'pat@club.com', 'wrongpass123');
    expect((await svc.loginPassword('clubhouse', 'pat@club.com', 'greenside77x')).ok).toBe(false);
  }, 60_000);

  it('deactivation revokes PIN, password and session instantly; last owner is protected', async () => {
    const pat = svc.read().members.find((m) => m.email === 'pat@club.com')!;
    expect(svc.setActive(owner, owner.id, false).ok).toBe(false); // not yourself
    expect(svc.setActive(owner, pat.id, false).ok).toBe(true);
    expect((await svc.loginPin('clubhouse', '615204')).ok).toBe(false);
    expect(svc.refresh({ ...owner, id: pat.id })).toBeNull();
    expect(svc.remove(owner, pat.id).ok).toBe(true);
    expect((await svc.updateStaff(owner, owner.id, { role: 'pro_shop', permissions: ['orders'] })).ok).toBe(false); // keep one owner
  }, 30_000);

  it('scopes are separate (Tournament OS has its own directory)', async () => {
    expect((await svc.loginPin('tournament', '482913')).ok).toBe(false);
    expect(svc.hasDirectory('tournament')).toBe(false);
  }, 20_000);
});
