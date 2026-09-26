import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, CreditCard, HeartHandshake, MailCheck, MessageSquareText, ScanFace, Trophy, Users } from 'lucide-react';
import { EVENTS, type EventInfo } from './events';
import { validateTeam, cleanContact, type Contact } from '../ops/model';
import { useOps, newId } from '../ops/useOps';
import { smsGroupLink } from '../lib/sms';
import { isEnrolled, verify } from '../lib/webauthn';

const blank = (): Contact => ({ first: '', last: '', phone: '', email: '' });
const input = 'w-full rounded-lg border bg-black/40 px-2.5 py-2 text-[12px] text-white placeholder-white/30 focus:outline-none';

export function Tournaments({ captain, onBack }: { captain: Contact; onBack: () => void }) {
  const [ops, dispatch] = useOps('player');
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [step, setStep] = useState<'list' | 'roster' | 'pay' | 'done'>('list');
  const [team, setTeam] = useState('');
  const [cap, setCap] = useState<Contact>(captain);
  const [roster, setRoster] = useState<Contact[]>([blank(), blank(), blank()]);
  const [touched, setTouched] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  const v = useMemo(() => validateTeam(team, roster, cap), [team, roster, cap]);
  const capErrors = useMemo(() => validateTeam('ok', [cap, cap, cap], cap).errors.roster[0], [cap]);
  const mine = ops.registrations.filter((r) => r.captain.phone === cleanContact(cap).phone);

  const setPlayer = (i: number, patch: Partial<Contact>) => setRoster((r) => r.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const pay = async (method: 'applepay' | 'card') => {
    if (!event) return;
    setPayErr(null);
    setPaying(true);
    // Face ID confirms the purchase on enrolled devices (Apple Pay does this natively when live).
    if (isEnrolled('player') && !(await verify('player'))) { setPaying(false); return setPayErr('Payment not confirmed.'); }
    await new Promise((r) => setTimeout(r, method === 'applepay' ? 900 : 1300));
    dispatch({
      type: 'register',
      reg: {
        id: newId(), eventId: event.id, teamName: v.teamName, captain: cleanContact(cap),
        roster: roster.map(cleanContact) as [Contact, Contact, Contact], total: event.foursomePrice, paidAt: Date.now(),
        teeTime: `Shotgun · Hole ${((ops.registrations.filter((r) => r.eventId === event.id).length) % 18) + 1}`,
      },
    });
    setPaying(false);
    setStep('done');
  };

  const appLink = typeof window !== 'undefined' ? window.location.origin : 'https://exclusive.golf';
  const sms = event ? smsGroupLink(roster.map((r) => r.phone),
    `You're on "${v.teamName}" for the ${event.name} (${event.date}) at ${event.course}! Get the Exclusive.Golf app for course GPS, live scoring and on-course drink ordering: ${appLink}`) : '#';

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-4 flex items-center gap-3">
        <button onClick={() => (step === 'list' ? onBack() : setStep(step === 'pay' ? 'roster' : step === 'roster' ? 'list' : 'list'))} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md"><ChevronLeft size={16} /></button>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white">{step === 'roster' ? 'Your Foursome' : step === 'pay' ? 'Checkout' : 'Tournaments'}</h2>
      </div>

      <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-28">
        {step === 'list' && (
          <>
            {EVENTS.map((e) => (
              <button key={e.id} onClick={() => { setEvent(e); setStep('roster'); }} className="mb-3 w-full rounded-3xl border border-white/10 bg-white/[0.06] p-4 text-left backdrop-blur-2xl active:scale-[0.99]">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-300"><Trophy size={12} /> Charity event</div>
                <div className="text-lg font-black tracking-tight text-white">{e.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/60"><CalendarDays size={12} /> {e.date}</div>
                <div className="text-[11px] text-white/60">{e.course} · {e.format}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300/80"><HeartHandshake size={12} /> {e.cause}</div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-xl font-semibold text-emerald-400">${e.foursomePrice}<span className="text-[10px] text-white/40"> / foursome</span></span>
                  <span className="rounded-full bg-emerald-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-black">Buy ticket</span>
                </div>
              </button>
            ))}
            {mine.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-[11px] text-white/75">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Your teams</div>
                {mine.map((r) => <div key={r.id}>{r.teamName} · {EVENTS.find((e) => e.id === r.eventId)?.name} · {r.teeTime}</div>)}
              </div>
            )}
          </>
        )}

        {step === 'roster' && event && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-white/55">Verified roster: every player needs a name, mobile number and email. No guest slots.</p>
            <label className="flex flex-col gap-1">
              <span className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">Team name</span>
              <input value={team} maxLength={30} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Fore Play" className={`${input} py-3 text-sm ${touched && v.errors.team ? 'border-rose-400/60' : 'border-white/10'}`} />
              {touched && v.errors.team && <span className="pl-1 text-[10px] text-rose-300">{v.errors.team}</span>}
            </label>
            <PlayerCard title="Captain" c={cap} err={touched ? capErrors : {}} onChange={(p) => setCap({ ...cap, ...p })} />
            {roster.map((c, i) => <PlayerCard key={i} title={`Player ${i + 2}`} c={c} err={touched ? v.errors.roster[i] : {}} onChange={(p) => setPlayer(i, p)} />)}
            {touched && v.errors.duplicate && <p className="pl-1 text-[11px] text-rose-300">{v.errors.duplicate}</p>}
          </div>
        )}

        {step === 'pay' && event && (
          <div className="flex flex-col gap-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">Order summary</div>
              <div className="mt-1 text-sm font-bold text-white">{event.name}</div>
              <div className="text-[11px] text-white/55">Foursome · “{v.teamName}”</div>
              <ul className="mt-2 text-[11px] text-white/70">
                {[cap, ...roster].map((c, i) => <li key={i} className="flex items-center gap-1.5"><Users size={10} className="text-white/35" />{c.first} {c.last}</li>)}
              </ul>
              <div className="mt-3 flex justify-between border-t border-white/10 pt-2 font-mono text-sm"><span className="text-white/60">Total</span><span className="font-bold text-emerald-400">${event.foursomePrice}.00</span></div>
            </div>
            <button disabled={paying} onClick={() => pay('applepay')} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold text-black active:scale-[0.98] disabled:opacity-60">
              {paying ? 'Processing…' : <><span className="text-lg"></span> Pay</>}
            </button>
            <button disabled={paying} onClick={() => pay('card')} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/40 text-[11px] font-bold uppercase tracking-widest text-white/80">
              <CreditCard size={14} /> Pay with card
            </button>
            {isEnrolled('player') && <p className="flex items-center justify-center gap-1 text-[10px] text-white/45"><ScanFace size={11} /> Confirm with Face ID</p>}
            {payErr && <p role="alert" className="text-center text-[11px] text-rose-300">{payErr}</p>}
            <p className="text-center text-[9px] text-amber-200/70">Demo checkout — no card is charged. Live payments run through Stripe (Apple Pay / cards).</p>
          </div>
        )}

        {step === 'done' && event && (
          <div className="flex flex-col items-center gap-3 pt-6 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-400/60"><Check size={30} className="text-emerald-400" strokeWidth={3} /></span>
            <div className="text-lg font-black text-white">You’re in!</div>
            <div className="text-[12px] text-white/60">“{v.teamName}” · {event.name}</div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300"><MailCheck size={13} /> Receipts Emailed</div>
            <a href={sms} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-4 text-[12px] font-black uppercase tracking-[0.15em] text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.25)] backdrop-blur-xl active:scale-[0.98]">
              <MessageSquareText size={18} /> Text Your Team The Invite
            </a>
            <p className="text-[10px] text-white/40">Opens Messages with {roster.length} teammates and the app link — sent from your phone, no SMS fees.</p>
          </div>
        )}
      </div>

      {(step === 'roster') && (
        <div className="absolute inset-x-5 bottom-6 z-20">
          <div className="rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-xl">
            <button onClick={() => { setTouched(true); if (v.ok && !Object.keys(capErrors).length) setStep('pay'); }} className="w-full rounded-xl bg-emerald-500 py-3.5 text-xs font-black uppercase tracking-widest text-black">
              Continue to checkout · ${event?.foursomePrice}
            </button>
          </div>
        </div>
      )}
      {step === 'done' && (
        <div className="absolute inset-x-5 bottom-6 z-20">
          <button onClick={onBack} className="w-full rounded-2xl border border-white/10 bg-white/10 py-3.5 text-xs font-bold uppercase tracking-widest text-white">Done</button>
        </div>
      )}
    </div>
  );
}

function PlayerCard({ title, c, err, onChange }: { title: string; c: Contact; err: Partial<Record<keyof Contact, string>>; onChange: (p: Partial<Contact>) => void }) {
  const cls = (k: keyof Contact) => `${input} ${err[k] ? 'border-rose-400/60' : 'border-white/10'}`;
  return (
    <fieldset className="rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-md">
      <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-white/50">{title}</legend>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label={`${title} first name`} value={c.first} maxLength={40} onChange={(e) => onChange({ first: e.target.value })} placeholder="First name" className={cls('first')} />
        <input aria-label={`${title} last name`} value={c.last} maxLength={40} onChange={(e) => onChange({ last: e.target.value })} placeholder="Last name" className={cls('last')} />
        <input aria-label={`${title} phone`} type="tel" inputMode="tel" value={c.phone} maxLength={20} onChange={(e) => onChange({ phone: e.target.value })} placeholder="Mobile" className={cls('phone')} />
        <input aria-label={`${title} email`} type="email" value={c.email} maxLength={254} onChange={(e) => onChange({ email: e.target.value })} placeholder="Email" className={cls('email')} />
      </div>
      {Object.values(err).filter(Boolean).length > 0 && <p className="mt-1.5 text-[10px] text-rose-300">{[...new Set(Object.values(err))].join(' · ')}</p>}
    </fieldset>
  );
}
