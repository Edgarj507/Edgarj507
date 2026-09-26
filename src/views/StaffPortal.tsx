import { useEffect, useState, type ReactNode } from 'react';
import { Delete, Lock, ScanFace, ShieldCheck, X } from 'lucide-react';
import { createStaffPin, PIN_RE } from '../lib/staffPin';
import { biometricAvailable, enroll, isEnrolled, verify } from '../lib/webauthn';
import { useRole } from '../auth/RoleContext';

const pinStore = createStaffPin(localStorage);

/**
 * Staff gate for the Clubhouse OS. First use on a device sets a 6-digit PIN (confirmed twice);
 * afterwards the PIN — or Face ID on an enrolled staff device — unlocks it. Five wrong PINs lock
 * the portal for five minutes.
 */
export function StaffPortal({ onClose }: { onClose: () => void }) {
  const { unlockStaff } = useRole();
  const [setup] = useState(() => !pinStore.isSet());
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState(pinStore.lockedFor());
  const [bio, setBio] = useState(false);
  const [offerEnroll, setOfferEnroll] = useState(false);

  useEffect(() => { void biometricAvailable().then(setBio); }, []);
  useEffect(() => {
    if (!lockedFor) return;
    const id = setInterval(() => setLockedFor(pinStore.lockedFor()), 1000);
    return () => clearInterval(id);
  }, [lockedFor]);

  const done = () => {
    if (bio && !isEnrolled('staff')) setOfferEnroll(true);
    else unlockStaff('Staff');
  };

  const submit = async (p: string) => {
    setMsg(null);
    if (setup) {
      if (!first) { setFirst(p); setPin(''); setMsg('Enter the same PIN again'); return; }
      if (first !== p) { setFirst(null); setPin(''); setMsg('PINs didn’t match. Start again.'); return; }
      await pinStore.set(p);
      return done();
    }
    const r = await pinStore.verify(p);
    setPin('');
    if (r === 'ok') return done();
    setLockedFor(pinStore.lockedFor());
    setMsg(r === 'locked' ? 'Too many attempts.' : 'Incorrect PIN');
    navigator.vibrate?.([40, 40, 40]);
  };

  const press = (d: string) => {
    if (lockedFor) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (PIN_RE.test(next)) void submit(next);
  };

  const faceId = async () => {
    if (await verify('staff')) unlockStaff('Staff');
    else setMsg('Face ID not recognised for staff');
  };

  if (offerEnroll) {
    return (
      <Overlay onClose={() => unlockStaff('Staff')}>
        <ShieldCheck size={28} className="mx-auto mb-2 text-emerald-400" />
        <div className="mb-1 text-center text-sm font-bold text-white">Authorize this device?</div>
        <p className="mb-4 text-center text-[11px] text-white/55">Staff can then unlock the Clubhouse OS with Face ID here.</p>
        <button onClick={async () => { await enroll('staff', 'Clubhouse staff'); unlockStaff('Staff'); }} className="mb-2 h-11 w-full rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-widest text-black">Enable Face ID</button>
        <button onClick={() => unlockStaff('Staff')} className="h-10 w-full text-[10px] font-bold uppercase tracking-widest text-white/50">Not now</button>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div className="mb-1 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
        <Lock size={11} /> Clubhouse OS
      </div>
      <div className="mb-4 text-center text-sm font-bold text-white">{setup ? (first ? 'Confirm staff PIN' : 'Create a 6-digit staff PIN') : 'Enter staff PIN'}</div>
      <div className="mb-3 flex justify-center gap-2.5" aria-label={`${pin.length} of 6 digits`}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`h-3 w-3 rounded-full border ${i < pin.length ? 'border-emerald-400 bg-emerald-400' : 'border-white/30'}`} />
        ))}
      </div>
      <p role="alert" className="mb-2 h-4 text-center text-[11px] text-rose-300">
        {lockedFor ? `Locked · try again in ${Math.ceil(lockedFor / 1000)}s` : msg}
      </p>
      <div className="mx-auto grid w-60 grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <Key key={d} onClick={() => press(d)} disabled={!!lockedFor}>{d}</Key>)}
        {!setup && bio && isEnrolled('staff') ? <Key onClick={faceId} label="Face ID"><ScanFace size={20} /></Key> : <span />}
        <Key onClick={() => press('0')} disabled={!!lockedFor}>0</Key>
        <Key onClick={() => setPin((p) => p.slice(0, -1))} label="Delete"><Delete size={18} /></Key>
      </div>
      <p className="mt-4 text-center text-[9px] leading-snug text-white/35">Staff only. Tournament data, tee sheets and course controls are protected.</p>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/70 p-4 pb-safe backdrop-blur-sm" role="dialog" aria-label="Staff login">
      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-2xl">
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/60"><X size={14} /></button>
        {children}
      </div>
    </div>
  );
}

function Key({ children, onClick, disabled, label }: { children: ReactNode; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-black/40 font-mono text-xl text-white transition active:scale-95 active:bg-white/10 disabled:opacity-30">
      {children}
    </button>
  );
}
