import { useState } from 'react';
import { ChevronLeft, Eye, LogOut, Shield } from 'lucide-react';
import { useAuth, type Visibility } from '../auth/AuthContext';

const OPTIONS: { id: Visibility; label: string; hint: string }[] = [
  { id: 'public', label: 'Public', hint: 'Anyone signed in' },
  { id: 'friends', label: 'Friends', hint: 'Accepted friends' },
  { id: 'private', label: 'Private', hint: 'Only you' },
];

export function VisibilityPicker({ value, onChange, label }: { value: Visibility; onChange: (v: Visibility) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-lg py-1.5 text-center transition-all ${value === o.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/50'}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest">{o.label}</div>
          <div className="text-[8px] opacity-70">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}

export function ProfileView({ onBack }: { onBack: () => void }) {
  const { profile, saveProfile, signOut, status, user } = useAuth();
  const [name, setName] = useState(profile.display_name);
  const [handle, setHandle] = useState(profile.handle);
  const [hcp, setHcp] = useState(profile.handicap?.toString() ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const guest = status !== 'signedIn';

  const save = async (patch: Parameters<typeof saveProfile>[0]) => {
    const err = await saveProfile(patch);
    setMsg(err ?? 'Saved');
  };

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-5 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md active:scale-95">
          <ChevronLeft size={16} />
        </button>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white">Profile & Privacy</h2>
      </div>

      <div className="no-scrollbar z-10 flex flex-1 flex-col gap-5 overflow-y-auto pb-24">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-md">
          <Shield size={14} className={guest ? 'text-amber-300' : 'text-emerald-400'} />
          <span className="truncate text-[11px] text-white/70">
            {guest ? 'Guest · data stays on this device' : `Signed in · ${user?.email ?? ''}`}
          </span>
        </div>

        <section className="flex flex-col gap-2">
          <span className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">Profile</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => save({ display_name: name })} aria-label="Display name" placeholder="Display name" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-white backdrop-blur-md focus:border-emerald-500/50 focus:outline-none" />
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <input value={handle} maxLength={25} autoCapitalize="none" onChange={(e) => setHandle(e.target.value)} onBlur={() => save({ handle })} aria-label="Handle" placeholder="handle" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-xs text-white backdrop-blur-md focus:border-emerald-500/50 focus:outline-none" />
            <input value={hcp} inputMode="decimal" maxLength={5} onChange={(e) => setHcp(e.target.value.replace(/[^\d.+-]/g, ''))} onBlur={() => save({ handicap: hcp === '' ? null : Number(hcp) })} aria-label="Handicap" placeholder="HCP" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-center font-mono text-xs text-white backdrop-blur-md focus:border-emerald-500/50 focus:outline-none" />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50"><Eye size={11} /> Who can see my handicap</span>
          <VisibilityPicker label="Handicap visibility" value={profile.handicap_visibility} onChange={(v) => save({ handicap_visibility: v })} />
        </section>

        <section className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50"><Eye size={11} /> Who can see my live scores & stats</span>
          <VisibilityPicker label="Stats visibility" value={profile.stats_visibility} onChange={(v) => save({ stats_visibility: v })} />
          <p className="px-1 text-[9px] leading-snug text-white/40">
            Enforced on the server. Playing partners in the same round can see your scores unless you choose Private. New rounds default to this setting.
          </p>
        </section>

        {msg && <p role="status" className={`px-1 text-[11px] ${msg === 'Saved' ? 'text-emerald-400' : 'text-rose-300'}`}>{msg}</p>}
      </div>

      <div className="absolute inset-x-5 bottom-6 z-20">
        <div className="rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-xl">
          <button onClick={signOut} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/10 py-3.5 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 active:scale-[0.98]">
            <LogOut size={14} /> {guest ? 'Exit guest mode' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}
