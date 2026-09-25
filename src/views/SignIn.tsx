import { useState, type FormEvent } from 'react';
import { Lock, Mail, Target, UserRound, WifiOff } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const field = 'w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-9 pr-3 text-sm text-white placeholder-white/30 backdrop-blur-md focus:border-emerald-500/50 focus:outline-none';

export function SignIn() {
  const { signIn, signUp, signInWithProvider, continueAsGuest, cloud } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'err' | 'ok'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const err = mode === 'in' ? await signIn(email, password) : await signUp(email, password, handle);
    setBusy(false);
    if (err) setMsg({ tone: 'err', text: err });
    else if (mode === 'up') setMsg({ tone: 'ok', text: 'Check your email to confirm your account.' });
  };

  const oauth = async (p: 'apple' | 'google') => {
    const err = await signInWithProvider(p);
    if (err) setMsg({ tone: 'err', text: err });
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
        <div role="tablist" className="mb-4 flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {(['in', 'up'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setMsg(null); }}
              className={`flex-1 rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${mode === m ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/50'}`}
            >
              {m === 'in' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {cloud ? (
          <form onSubmit={submit} className="flex flex-col gap-2.5" noValidate>
            <label className="relative">
              <span className="sr-only">Email</span>
              <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input type="email" autoComplete="email" inputMode="email" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={field} />
            </label>
            {mode === 'up' && (
              <label className="relative">
                <span className="sr-only">Handle</span>
                <UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input autoComplete="username" autoCapitalize="none" maxLength={25} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Handle (e.g. edgar.golf)" className={field} />
              </label>
            )}
            <label className="relative">
              <span className="sr-only">Password</span>
              <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'up' ? 'Password (10+ chars, letters & numbers)' : 'Password'} className={field} />
            </label>
            {msg && (
              <p role="alert" className={`px-1 text-[11px] ${msg.tone === 'err' ? 'text-rose-300' : 'text-emerald-400'}`}>{msg.text}</p>
            )}
            <button disabled={busy} className="mt-1 h-12 rounded-2xl bg-emerald-500 text-xs font-black uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] transition active:scale-[0.98] disabled:opacity-50">
              {busy ? '…' : mode === 'in' ? 'Sign In' : 'Create Account'}
            </button>
            <div className="my-1 flex items-center gap-3 text-[9px] uppercase tracking-widest text-white/30">
              <span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => oauth('apple')} className="h-11 rounded-2xl border border-white/10 bg-white text-xs font-bold text-black active:scale-[0.98]"> Apple</button>
              <button type="button" onClick={() => oauth('google')} className="h-11 rounded-2xl border border-white/10 bg-white/10 text-xs font-bold text-white active:scale-[0.98]">Google</button>
            </div>
          </form>
        ) : (
          <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-[11px] leading-snug text-amber-200">
            Cloud accounts aren’t configured for this build (no <code>VITE_SUPABASE_URL</code>). You can still play; rounds stay on this device.
          </p>
        )}

        <button onClick={continueAsGuest} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/40 text-[10px] font-bold uppercase tracking-widest text-white/70 active:scale-[0.98]">
          <WifiOff size={13} /> Play offline as guest
        </button>
        <p className="mt-2 text-center text-[9px] text-white/35">Guest rounds are stored only on this device and never shared.</p>
      </div>
    </div>
  );
}
