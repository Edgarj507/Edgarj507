import { useEffect, useState, type FormEvent } from 'react';
import { haptic } from '../lib/haptics';
import { Building2, CalendarRange, Flag, Lock, Mail, Phone, ScanFace, ShieldCheck, Target, UserRound, WifiOff } from 'lucide-react';
import { CourseVerificationWizard } from '../onboarding/CourseVerification';
import { StaffAuth } from '../staff/StaffAuth';
import { useAuth } from '../auth/AuthContext';
import { biometricAvailable, enroll, isEnrolled, verify } from '../lib/webauthn';
import { StaffPortal } from './StaffPortal';
import { LegalConsent } from '../legal/LegalUI';
import { accept, hasAccepted } from '../legal/consent';

const field = 'w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-9 pr-3 text-sm text-white placeholder-white/30 backdrop-blur-md focus:border-emerald-500/50 focus:outline-none';
const REMEMBER = 'eg.player.remember.v1';

type Portal = 'clubhouse' | 'golfer' | 'organizer';
const PORTALS: { id: Portal; label: string; icon: typeof Flag }[] = [
  { id: 'clubhouse', label: 'Clubhouse', icon: Building2 },
  { id: 'golfer', label: 'Golfers', icon: Flag },
  { id: 'organizer', label: 'Organizers', icon: CalendarRange },
];

/**
 * Role-based landing: three doors into the platform.
 *  • Clubhouse Portal — course staff (PIN / Face ID) and new-course onboarding with verification.
 *  • Regular Golfers — phone / email / Apple / Google sign-in to the player app.
 *  • Tournament Organizers — the Organizer OS (events across verified venues).
 */
export function SignIn() {
  const [portal, setPortal] = useState<Portal>('golfer');
  return (
    <div className="relative flex h-full w-full flex-col">
      <div role="tablist" aria-label="Sign in as" className="z-10 mx-5 mt-5 flex gap-1 rounded-2xl border border-white/10 bg-black/50 p-1 backdrop-blur-xl pt-safe">
        {PORTALS.map(({ id, label, icon: I }) => (
          <button key={id} role="tab" aria-selected={portal === id} onClick={() => setPortal(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[9px] font-black uppercase tracking-widest ${portal === id ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' : 'text-white/50'}`}>
            <I size={14} />{label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {portal === 'golfer' ? <GolferSignIn /> : portal === 'clubhouse' ? <ClubhousePortal /> : <OrganizerSignIn />}
      </div>
    </div>
  );
}

function Brand({ sub }: { sub: string }) {
  return (
    <div className="mb-auto mt-6 flex flex-col items-start">
      <div className="mb-2 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 shadow-lg backdrop-blur-sm"><Target size={15} className="text-emerald-400" /></div>
      <h1 className="text-xs font-black tracking-[0.25em] text-white">EXCLUSIVE.GOLF</h1>
      <div className="mt-2 h-[2px] w-6 rounded-full bg-emerald-500/80" />
      <p className="mt-2 text-[11px] text-white/55">{sub}</p>
    </div>
  );
}

function ClubhousePortal() {
  const [staff, setStaff] = useState(false);
  const [wizard, setWizard] = useState(false);
  return (
    <div className="relative flex h-full w-full flex-col justify-end p-5">
      <Brand sub="Clubhouse Portal — for course staff" />
      <div className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl">
        <button onClick={() => setStaff(true)} className="flex h-14 items-center gap-3 rounded-2xl bg-emerald-500 px-4 text-left text-black">
          <ShieldCheck size={20} /><span><span className="block text-[12px] font-black uppercase tracking-widest">Staff sign-in</span><span className="text-[10px] opacity-75">PIN or Face ID on this tablet</span></span>
        </button>
        <button onClick={() => setWizard(true)} className="flex h-14 items-center gap-3 rounded-2xl border border-white/15 bg-black/40 px-4 text-left text-white">
          <Building2 size={20} className="text-emerald-300" /><span><span className="block text-[12px] font-black uppercase tracking-widest">Register your course</span><span className="text-[10px] text-white/55">Claim your course · verify you manage it</span></span>
        </button>
        <p className="px-1 text-[10px] text-white/45">New courses are verified by Exclusive.Golf before the Clubhouse OS can be set up.</p>
      </div>
      {staff && <StaffPortal onClose={() => setStaff(false)} />}
      {wizard && <CourseVerificationWizard onClose={() => setWizard(false)} />}
    </div>
  );
}

function OrganizerSignIn() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex h-full w-full flex-col justify-end p-5">
      <Brand sub="Tournament Organizers — run events at any verified course" />
      <div className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl">
        <button onClick={() => setOpen(true)} className="flex h-14 items-center gap-3 rounded-2xl bg-sky-400 px-4 text-left text-black">
          <CalendarRange size={20} /><span><span className="block text-[12px] font-black uppercase tracking-widest">Organizer sign-in</span><span className="text-[10px] opacity-75">PIN, email & password</span></span>
        </button>
        <p className="px-1 text-[10px] text-white/45">First time on this device? You’ll create the organizer owner account, then add your staff and volunteers under <b>Staff</b>.</p>
      </div>
      {open && <StaffAuth scope="tournament" onClose={() => setOpen(false)} />}
    </div>
  );
}

function GolferSignIn() {
  const { signIn, signUp, signInWithProvider, signInWithPhone, verifyPhoneCode, continueAsGuest, cloud } = useAuth();
  const [tab, setTab] = useState<'phone' | 'email'>('phone');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [useFaceId, setUseFaceId] = useState(true);
  const [bio, setBio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'err' | 'ok'; text: string } | null>(null);
  // Registration needs the Terms/EULA, Privacy Policy and Liability Waiver (current versions).
  const needsConsent = !(hasAccepted('tos') && hasAccepted('privacy') && hasAccepted('waiver'));
  const [agreed, setAgreed] = useState(false);
  const [agreeErr, setAgreeErr] = useState(false);
  const consentOk = () => {
    if (!needsConsent) return true;
    if (!agreed) { setAgreeErr(true); haptic('error'); return false; }
    accept(['tos', 'privacy', 'waiver'], 'signup');
    return true;
  };

  useEffect(() => { void biometricAvailable().then(setBio); }, []);
  const remembered = (() => { try { return JSON.parse(localStorage.getItem(REMEMBER) ?? 'null') as { name: string; phone: string } | null; } catch { return null; } })();
  const canFaceId = bio && isEnrolled('player') && !!remembered;

  const afterPhoneLogin = async (displayName: string, e164: string) => {
    if (bio && useFaceId && !isEnrolled('player')) await enroll('player', displayName || e164);
    try { localStorage.setItem(REMEMBER, JSON.stringify({ name: displayName, phone: e164 })); } catch { /* blocked */ }
  };

  const submitPhone = async (e: FormEvent) => {
    e.preventDefault();
    if (!consentOk()) return;
    setBusy(true); setMsg(null);
    if (codeSent) {
      const err = await verifyPhoneCode(phone, code);
      setBusy(false);
      if (err) setMsg({ tone: 'err', text: err });
      else await afterPhoneLogin(name, phone);
      return;
    }
    const res = await signInWithPhone(phone, name || undefined);
    setBusy(false);
    if (res === 'code_sent') { setCodeSent(true); setMsg({ tone: 'ok', text: 'We texted you a 6-digit code.' }); }
    else if (res) setMsg({ tone: 'err', text: res });
    else await afterPhoneLogin(name, phone);
  };

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!consentOk()) return;
    setBusy(true); setMsg(null);
    const err = mode === 'in' ? await signIn(email, password) : await signUp(email, password, handle);
    setBusy(false);
    if (err) setMsg({ tone: 'err', text: err });
    else if (mode === 'up') setMsg({ tone: 'ok', text: 'Check your email to confirm your account.' });
  };

  const faceIdLogin = async () => {
    if (!remembered) return;
    setBusy(true);
    const ok = await verify('player');
    setBusy(false);
    if (!ok) return setMsg({ tone: 'err', text: 'Face ID didn’t confirm it’s you.' });
    const err = await signInWithPhone(remembered.phone, remembered.name);
    if (err === 'code_sent') { setPhone(remembered.phone); setCodeSent(true); setMsg({ tone: 'ok', text: 'We texted you a 6-digit code.' }); }
  };

  return (
    <div className="relative flex h-full w-full flex-col justify-end p-5">
      <div className="mb-auto mt-6 flex flex-col items-start">
        <div className="mb-2 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 shadow-lg backdrop-blur-sm">
          <Target size={15} className="text-emerald-400" />
        </div>
        <h1 className="text-xs font-black tracking-[0.25em] text-white">EXCLUSIVE.GOLF</h1>
        <div className="mt-2 h-[2px] w-6 rounded-full bg-emerald-500/80" />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl ring-1 ring-inset ring-white/5 backdrop-blur-2xl">
        {canFaceId && (
          <button onClick={faceIdLogin} disabled={busy} className="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-xs font-black uppercase tracking-[0.2em] text-emerald-300 active:scale-[0.98]">
            <ScanFace size={18} /> Face ID · {remembered!.name || remembered!.phone}
          </button>
        )}

        <div role="tablist" className="mb-4 flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {(['phone', 'email'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setMsg(null); }}
              className={`flex-1 rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${tab === t ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/50'}`}>
              {t === 'phone' ? 'Phone' : 'Email'}
            </button>
          ))}
        </div>

        {needsConsent && (
          <div className="mb-3 flex flex-col gap-1">
            <LegalConsent docs={['tos', 'privacy', 'waiver']} checked={agreed} onChange={(v) => { setAgreed(v); setAgreeErr(false); }} error={agreeErr} />
          </div>
        )}

        {tab === 'phone' ? (
          <form onSubmit={submitPhone} className="flex flex-col gap-2.5" noValidate>
            {!codeSent && (
              <label className="relative">
                <span className="sr-only">Your name</span>
                <UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input autoComplete="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={field} />
              </label>
            )}
            <label className="relative">
              <span className="sr-only">Mobile number</span>
              <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input type="tel" autoComplete="tel" inputMode="tel" maxLength={20} disabled={codeSent} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" className={field} />
            </label>
            {codeSent && (
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" aria-label="Verification code"
                className="w-full rounded-xl border border-white/10 bg-black/40 py-3 text-center font-mono text-lg tracking-[0.5em] text-white placeholder-white/25 focus:border-emerald-500/50 focus:outline-none" />
            )}
            {bio && !isEnrolled('player') && !codeSent && (
              <label className="flex items-center gap-2 px-1 text-[11px] text-white/60">
                <input type="checkbox" checked={useFaceId} onChange={(e) => setUseFaceId(e.target.checked)} className="accent-emerald-500" /> Use Face ID next time
              </label>
            )}
            {!cloud && <p className="px-1 text-[9px] text-amber-200/70">Demo mode: SMS verification turns on when the backend is configured.</p>}
            {msg && <p role="alert" className={`px-1 text-[11px] ${msg.tone === 'err' ? 'text-rose-300' : 'text-emerald-400'}`}>{msg.text}</p>}
            <button disabled={busy} className="mt-1 h-12 rounded-2xl bg-emerald-500 text-xs font-black uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] transition active:scale-[0.98] disabled:opacity-50">
              {busy ? '…' : codeSent ? 'Verify' : cloud ? 'Send code' : 'Continue'}
            </button>
          </form>
        ) : cloud ? (
          <form onSubmit={submitEmail} className="flex flex-col gap-2.5" noValidate>
            <div className="flex gap-3 px-1 text-[10px] font-bold uppercase tracking-widest">
              {(['in', 'up'] as const).map((m) => (
                <button type="button" key={m} onClick={() => setMode(m)} className={mode === m ? 'text-emerald-400' : 'text-white/40'}>{m === 'in' ? 'Sign in' : 'Create account'}</button>
              ))}
            </div>
            <label className="relative"><span className="sr-only">Email</span><Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={field} /></label>
            {mode === 'up' && (
              <label className="relative"><span className="sr-only">Handle</span><UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input autoCapitalize="none" maxLength={25} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Handle" className={field} /></label>
            )}
            <label className="relative"><span className="sr-only">Password</span><Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={field} /></label>
            {msg && <p role="alert" className={`px-1 text-[11px] ${msg.tone === 'err' ? 'text-rose-300' : 'text-emerald-400'}`}>{msg.text}</p>}
            <button disabled={busy} className="h-12 rounded-2xl bg-emerald-500 text-xs font-black uppercase tracking-[0.2em] text-black disabled:opacity-50">{mode === 'in' ? 'Sign In' : 'Create Account'}</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { if (consentOk()) void signInWithProvider('apple'); }} className="h-11 rounded-2xl bg-white text-xs font-bold text-black"> Apple</button>
              <button type="button" onClick={() => { if (consentOk()) void signInWithProvider('google'); }} className="h-11 rounded-2xl border border-white/10 bg-white/10 text-xs font-bold text-white">Google</button>
            </div>
          </form>
        ) : (
          <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-[11px] leading-snug text-amber-200">
            Email accounts need the cloud backend (<code>VITE_SUPABASE_URL</code>). Use your phone number to play on this device.
          </p>
        )}

        <button onClick={() => { if (consentOk()) continueAsGuest(); }} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/40 text-[10px] font-bold uppercase tracking-widest text-white/60 active:scale-[0.98]">
          <WifiOff size={13} /> Play offline as guest
        </button>
      </div>

      <button onClick={() => setStaff(true)} className="mx-auto mt-3 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.25em] text-white/25 hover:text-white/50">
        <Lock size={9} /> Staff Login
      </button>

      {staff && <StaffPortal onClose={() => setStaff(false)} />}
    </div>
  );
}
