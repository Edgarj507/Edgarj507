import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CornerDownLeft, Delete, KeyRound, Lock, LogOut, Mail, ShieldCheck, X } from 'lucide-react';
import { haptic } from '../lib/haptics';
import { supabase } from '../lib/supabase';
import { useRole } from '../auth/RoleContext';
import { useOps } from '../ops/useOps';
import { staffService, useStaffState } from './useStaff';
import { passwordProblem, pinProblem, type StaffScope, type StaffSession } from './model';

type View = 'pin' | 'password' | 'forgot' | 'reset' | 'setup';
const input = 'w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-[13px] text-white placeholder-white/30 focus:border-emerald-500/50 focus:outline-none';
const DEMO = !supabase;
const TITLE: Record<StaffScope, string> = { clubhouse: 'Clubhouse OS', tournament: 'Tournament OS' };

/**
 * Staff sign-in for the Clubhouse OS / Tournament OS:
 *  • PIN pad (fast quick-switch on shared terminals; 4–6 digits, 5 wrong → 5-minute lockout)
 *  • Email + password
 *  • Forgot password → 6-digit code by email (15 min, 5 tries, single use) → new password
 *  • First run: create the owner account (Clubhouse: only once the course is verified)
 * `lockScreen` renders it as the in-OS lock screen (the OS stays mounted behind it).
 */
export function StaffAuth({ scope, onClose, lockScreen = false }: { scope: StaffScope; onClose?: () => void; lockScreen?: boolean }) {
  const { signIn, signOut, session } = useRole();
  const staff = useStaffState();
  const hasDir = staff.members.some((m) => m.scope === scope && m.active);
  const [ops] = useOps('player');
  const verified = scope === 'tournament' || !!supabase || ops.verifications.some((v) => v.status === 'approved');
  const [view, setView] = useState<View>(() => (hasDir || supabase ? 'pin' : 'setup'));
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  useEffect(() => { if (!hasDir && !supabase && view !== 'setup') setView('setup'); }, [hasDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (s: StaffSession) => { haptic('success'); signIn(s); onClose?.(); };
  const go = (v: View, n: string | null = null) => { setView(v); setNotice(n); };

  const body: Record<View, ReactNode> = {
    setup: verified ? <OwnerSetup scope={scope} onDone={done} /> : (
      <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-center text-[12px] text-amber-100">No verified course on this device yet. Use <b>Register your course</b> in the Clubhouse Portal; the owner account can be created once Exclusive.Golf approves it.</p>
    ),
    pin: <PinPad scope={scope} onDone={done} />,
    password: <PasswordLogin scope={scope} email={email} setEmail={setEmail} onDone={done} />,
    forgot: <Forgot scope={scope} email={email} setEmail={setEmail} onSent={(m) => go('reset', m)} />,
    reset: <Reset scope={scope} email={email} setEmail={setEmail} onDone={() => go('password', 'Password updated. Sign in with your new password.')} />,
  };
  const heading: Record<View, string> = {
    setup: 'Create the owner account', pin: lockScreen ? `Locked${session ? ` · ${session.name}` : ''}` : 'Enter your staff PIN',
    password: 'Sign in with email', forgot: 'Forgot password?', reset: 'Set a new password',
  };

  return (
    <div className={`absolute inset-0 z-[65] flex ${lockScreen ? 'items-center' : 'items-end'} justify-center bg-black/80 p-4 pb-safe backdrop-blur-md`} role="dialog" aria-label={lockScreen ? 'Lock screen' : 'Staff login'}>
      <div aria-label="Staff login" className="relative flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl">
        {onClose && !lockScreen && <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/60"><X size={14} /></button>}
        {view !== 'pin' && view !== 'setup' && <button onClick={() => go('pin')} aria-label="Back to PIN" className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/60"><ArrowLeft size={14} /></button>}
        <div className="mb-1 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/60"><Lock size={11} /> {TITLE[scope]}</div>
        <h2 className="mb-4 text-center text-sm font-bold text-white">{heading[view]}</h2>
        {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-center text-[11px] text-emerald-200">{notice}</p>}
        {body[view]}
        {view === 'pin' && (
          <div className="mt-4 flex justify-center gap-4 text-[10px] font-bold uppercase tracking-widest">
            <button onClick={() => go('password')} className="flex items-center gap-1 text-white/60 hover:text-white"><Mail size={11} /> Sign in with email</button>
            <button onClick={() => go('forgot')} className="text-white/60 hover:text-white">Forgot password?</button>
          </div>
        )}
        {view === 'password' && <button onClick={() => go('forgot')} className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/60">Forgot password?</button>}
        {view === 'forgot' && <button onClick={() => go('reset')} className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/60">I already have a code</button>}
        {lockScreen && (
          <button onClick={signOut} className="mt-4 flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-white/15 text-[10px] font-bold uppercase tracking-widest text-white/70"><LogOut size={12} /> Sign out of {TITLE[scope]}</button>
        )}
        {DEMO && (view === 'forgot' || view === 'reset') && <DemoOutbox email={email} />}
        <p className="mt-4 text-center text-[9px] leading-snug text-white/35">Staff only. Every sign-in is tied to your own PIN or password.</p>
      </div>
    </div>
  );
}

function PinPad({ scope, onDone }: { scope: StaffScope; onDone: (s: StaffSession) => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedFor, setLockedFor] = useState(() => staffService.terminalLockedFor(scope));
  useEffect(() => {
    if (!lockedFor) return;
    const id = setInterval(() => setLockedFor(staffService.terminalLockedFor(scope)), 1000);
    return () => clearInterval(id);
  }, [lockedFor, scope]);

  const submit = async (p: string) => {
    if (busy || p.length < 4) return;
    setBusy(true); setMsg(null);
    if (supabase) {
      // Cloud: the PIN switches the acting staff member on a terminal that is signed in to the course.
      const { data, error } = await supabase.rpc('staff_pin_login', { pin: p });
      setBusy(false); setPin('');
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { haptic('error'); return setMsg(error?.message.includes('locked') ? 'Too many attempts.' : 'Incorrect PIN'); }
      return onDone({ id: row.id, scope, name: row.name, role: row.role, permissions: row.permissions, owner: row.role === 'owner' });
    }
    const r = await staffService.loginPin(scope, p);
    setBusy(false); setPin('');
    if (r.ok) return onDone(r.value);
    haptic('error');
    setLockedFor(staffService.terminalLockedFor(scope));
    setMsg(r.error === 'locked' ? 'Too many attempts.' : r.error);
  };
  const press = (d: string) => {
    if (lockedFor || busy) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 6) void submit(next);
  };

  return (
    <>
      <div className="mb-3 flex justify-center gap-2.5" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className={`h-3 w-3 rounded-full border ${i < pin.length ? 'border-emerald-400 bg-emerald-400' : i < 4 ? 'border-white/40' : 'border-white/15'}`} />)}
      </div>
      <p role="alert" className="mb-2 h-4 text-center text-[11px] text-rose-300">{lockedFor ? `Locked · try again in ${Math.ceil(lockedFor / 1000)}s` : msg}</p>
      <div className="mx-auto grid w-60 grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <Key key={d} onClick={() => press(d)} disabled={!!lockedFor}>{d}</Key>)}
        <Key onClick={() => setPin((p) => p.slice(0, -1))} label="Delete"><Delete size={18} /></Key>
        <Key onClick={() => press('0')} disabled={!!lockedFor}>0</Key>
        <Key onClick={() => void submit(pin)} label="Enter PIN" disabled={pin.length < 4 || !!lockedFor}><CornerDownLeft size={18} /></Key>
      </div>
      <p className="mt-2 text-center text-[10px] text-white/40">4–6 digits · 6-digit PINs submit automatically</p>
    </>
  );
}

function Key({ children, onClick, disabled, label }: { children: ReactNode; onClick: () => void; disabled?: boolean; label?: string }) {
  return <button onClick={onClick} disabled={disabled} aria-label={label} className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-black/40 font-mono text-xl text-white transition active:scale-95 active:bg-white/10 disabled:opacity-30">{children}</button>;
}

function PasswordLogin({ scope, email, setEmail, onDone }: { scope: StaffScope; email: string; setEmail: (e: string) => void; onDone: (s: StaffSession) => void }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setBusy(false); return setErr('Email or password is incorrect'); }
      await supabase.rpc('claim_staff_invite'); // invited staff: link the row to this account
      if (scope === 'tournament') await supabase.rpc('bootstrap_organizer_org').then(() => undefined, () => undefined);
      const { data } = await supabase.rpc('my_staff_session', { scope });
      setBusy(false);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return setErr('This account has no active staff access.');
      return onDone({ id: row.id, scope, name: row.name, role: row.role, permissions: row.permissions, owner: row.role === 'owner' });
    }
    const r = await staffService.loginPassword(scope, email, password);
    setBusy(false); setPassword('');
    if (r.ok) onDone(r.value); else { haptic('error'); setErr(r.error); }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5" aria-label="Email sign-in">
      <input aria-label="Staff email" type="email" autoComplete="username" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" className={input} />
      <input aria-label="Password" type="password" autoComplete="current-password" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={input} />
      {err && <p role="alert" className="text-center text-[11px] text-rose-300">{err}</p>}
      <button disabled={busy || !email || !password} className="h-12 rounded-2xl bg-emerald-500 text-xs font-black uppercase tracking-[0.2em] text-black disabled:opacity-40">{busy ? '…' : 'Sign in'}</button>
    </form>
  );
}

function Forgot({ scope, email, setEmail, onSent }: { scope: StaffScope; email: string; setEmail: (e: string) => void; onSent: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    if (supabase) {
      await supabase.auth.resetPasswordForEmail(email.trim()); // Supabase Auth emails a recovery code/link
      setBusy(false);
      return onSent('If that email belongs to a staff account, we sent a 6-digit code.');
    }
    const r = await staffService.requestReset(scope, email);
    setBusy(false);
    if (r.ok) onSent(r.value);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5" aria-label="Password recovery">
      <p className="text-center text-[11px] text-white/60">Enter the email on your staff account. We’ll send a 6-digit code to reset your password.</p>
      <input aria-label="Staff email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" className={input} />
      <button disabled={busy || !email.includes('@')} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-xs font-black uppercase tracking-[0.2em] text-black disabled:opacity-40"><Mail size={14} /> Send reset code</button>
    </form>
  );
}

function Reset({ scope, email, setEmail, onDone }: { scope: StaffScope; email: string; setEmail: (e: string) => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hint = pw ? passwordProblem(pw, email) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    if (supabase) {
      if (pw !== confirm) { setBusy(false); return setErr('Passwords don’t match'); }
      const p = passwordProblem(pw, email); if (p) { setBusy(false); return setErr(p); }
      const v = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
      if (v.error) { setBusy(false); return setErr('That code is invalid or has expired. Request a new one.'); }
      const u = await supabase.auth.updateUser({ password: pw });
      await supabase.auth.signOut();
      setBusy(false);
      return u.error ? setErr(u.error.message) : onDone();
    }
    const r = await staffService.resetPassword(scope, email, code, pw, confirm);
    setBusy(false);
    if (r.ok) { haptic('success'); onDone(); } else { haptic('error'); setErr(r.error); }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5" aria-label="Reset password">
      <input aria-label="Staff email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" className={input} />
      <input aria-label="Reset code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code"
        className={`${input} text-center font-mono text-lg tracking-[0.4em]`} />
      <input aria-label="New password" type="password" autoComplete="new-password" value={pw} maxLength={128} onChange={(e) => setPw(e.target.value)} placeholder="New password (10+ characters, letters & numbers)" className={input} />
      <input aria-label="Confirm new password" type="password" autoComplete="new-password" value={confirm} maxLength={128} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className={input} />
      {hint && <p className="text-[10px] text-amber-200">{hint}</p>}
      {confirm && confirm !== pw && <p className="text-[10px] text-amber-200">Passwords don’t match yet</p>}
      {err && <p role="alert" className="text-center text-[11px] text-rose-300">{err}</p>}
      <button disabled={busy || code.length !== 6 || !pw || pw !== confirm || !!hint} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-xs font-black uppercase tracking-[0.2em] text-black disabled:opacity-40"><KeyRound size={14} /> Save new password</button>
    </form>
  );
}

function OwnerSetup({ scope, onDone }: { scope: StaffScope; onDone: (s: StaffSession) => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', pin: '', pinConfirm: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k.startsWith('pin') ? e.target.value.replace(/\D/g, '') : e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (f.password !== f.confirm) return setErr('Passwords don’t match');
    if (f.pin !== f.pinConfirm) return setErr('PINs don’t match');
    const pp = pinProblem(f.pin); if (pp) return setErr(pp);
    setBusy(true);
    const r = await staffService.setupOwner(scope, f);
    setBusy(false);
    if (r.ok) onDone(r.value); else { haptic('error'); setErr(r.error); }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label="Owner setup">
      <p className="text-center text-[11px] text-white/60">You’ll manage staff, roles and PINs. Add your team afterwards in <b>Staff</b>.</p>
      <input aria-label="Owner name" value={f.name} maxLength={60} onChange={set('name')} placeholder="Your name" className={input} />
      <input aria-label="Owner email" type="email" value={f.email} maxLength={254} onChange={set('email')} placeholder="Work email" className={input} />
      <input aria-label="Owner password" type="password" autoComplete="new-password" value={f.password} maxLength={128} onChange={set('password')} placeholder="Password (10+ characters, letters & numbers)" className={input} />
      <input aria-label="Confirm owner password" type="password" autoComplete="new-password" value={f.confirm} maxLength={128} onChange={set('confirm')} placeholder="Confirm password" className={input} />
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Owner PIN" type="password" inputMode="numeric" value={f.pin} maxLength={6} onChange={set('pin')} placeholder="4–6 digit PIN" className={`${input} font-mono`} />
        <input aria-label="Confirm owner PIN" type="password" inputMode="numeric" value={f.pinConfirm} maxLength={6} onChange={set('pinConfirm')} placeholder="Confirm PIN" className={`${input} font-mono`} />
      </div>
      {err && <p role="alert" className="text-center text-[11px] text-rose-300">{err}</p>}
      <button disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-xs font-black uppercase tracking-[0.2em] text-black disabled:opacity-40"><ShieldCheck size={14} /> {busy ? 'Securing…' : 'Create owner account'}</button>
    </form>
  );
}

/** Demo: shows what would have been emailed, so the recovery flow can be tried end to end. */
function DemoOutbox({ email }: { email: string }) {
  const s = useStaffState();
  const mails = email.includes('@') ? s.outbox.filter((m) => m.to === email.trim().toLowerCase()).slice(0, 3) : [];
  if (!mails.length) return null;
  return (
    <section aria-label="Demo email outbox" className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-2 text-[10px] text-amber-50">
      <div className="mb-1 font-black uppercase tracking-widest text-amber-200">Demo inbox (email is simulated)</div>
      {mails.map((m) => <div key={m.id} className="border-t border-amber-200/20 py-1"><b>{m.subject}</b><div className="opacity-80">{m.body}</div></div>)}
    </section>
  );
}
