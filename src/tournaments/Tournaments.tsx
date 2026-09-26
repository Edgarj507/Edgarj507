import { useEffect, useMemo, useState } from 'react';
import { haptic } from '../lib/haptics';
import { CalendarDays, Check, ChevronLeft, CreditCard, HeartHandshake, Lock, MailCheck, MessageSquareText, Pencil, ScanFace, Share2, Star, Trophy, UserMinus, Users } from 'lucide-react';
import { EVENTS, type EventInfo } from './events';
import { readFavs, ShareEvent, writeFavs, type Friend } from './ShareEvent';
import { balance, blankContact, cleanContact, filledCount, isOpenSlot, validateTeam, type Contact, type Registration } from '../ops/model';
import { useOps, newId } from '../ops/useOps';
import { normalizePhone, smsGroupLink } from '../lib/sms';
import { isEnrolled, verify } from '../lib/webauthn';
import { TrackingNotice } from '../views/TrackingNotice';
import { LegalConsent } from '../legal/LegalUI';
import { accept } from '../legal/consent';
import { BannerThumb, EventDetailsView } from './EventDetailsView';

const input = 'w-full rounded-lg border bg-black/40 px-2.5 py-2 text-[12px] text-white placeholder-white/30 focus:outline-none disabled:opacity-50';
const SEAT = (e: EventInfo) => e.foursomePrice / 4;
const appLink = () => (typeof window !== 'undefined' ? window.location.origin : 'https://exclusive.golf');
const inviteText = (team: string, e: EventInfo) =>
  `You're on "${team}" for the ${e.name} (${e.date}) at ${e.course}! Get the Exclusive.Golf app for course GPS, live scoring and on-course ordering: ${appLink()}`;

/** Face ID (when enrolled) + simulated Apple Pay / card. */
async function charge(method: 'applepay' | 'card') {
  if (isEnrolled('player') && !(await verify('player'))) return false;
  await new Promise((r) => setTimeout(r, method === 'applepay' ? 900 : 1300));
  return true;
}

export function Tournaments({ captain, onBack, handle = '', friends = [], initialEventId }: {
  captain: Contact; onBack: () => void;
  /** Signed-in golfer's handle (receives in-app shares). */
  handle?: string;
  friends?: Friend[];
  /** Deep link (?event=…) opens straight to that event. */
  initialEventId?: string | null;
}) {
  const [ops, dispatch] = useOps('player');
  const events: EventInfo[] = ops.events.filter((e) => e.status === 'scheduled');
  const deep = initialEventId ? events.find((e) => e.id === initialEventId) ?? null : null;
  const [tab, setTab] = useState<'events' | 'saved' | 'mine'>('events');
  const [event, setEvent] = useState<EventInfo | null>(deep);
  const [step, setStep] = useState<'list' | 'details' | 'roster' | 'pay' | 'done'>(deep ? 'details' : 'list');
  const [favs, setFavs] = useState<string[]>(readFavs);
  const [sharing, setSharing] = useState<EventInfo | null>(null);
  const me = handle.replace(/^@/, '').toLowerCase();
  const inbox = me ? ops.shares.filter((x) => x.toHandle === me) : [];
  const unseenShares = inbox.filter((x) => !x.seen).length;
  useEffect(() => { if (tab === 'events' && unseenShares) { const id = setTimeout(() => dispatch({ type: 'shareSeen', toHandle: me }), 4000); return () => clearTimeout(id); } }, [tab, unseenShares, me, dispatch]);
  const toggleFav = (id: string) => setFavs((f) => { const next = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f]; writeFavs(next); haptic('tap'); return next; });
  const [agreed, setAgreed] = useState(false);
  const [agreeErr, setAgreeErr] = useState(false);
  const [team, setTeam] = useState('');
  const [cap, setCap] = useState<Contact>(captain);
  const [roster, setRoster] = useState<Contact[]>([blankContact(), blankContact(), blankContact()]);
  const [touched, setTouched] = useState(false);
  const [plan, setPlan] = useState<'full' | 'seat'>('full');
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  const v = useMemo(() => validateTeam(team, roster, cap), [team, roster, cap]);
  const myPhone = normalizePhone(cap.phone);
  const mine = ops.registrations.filter((r) => myPhone && normalizePhone(r.captain.phone) === myPhone);
  const players = 1 + roster.filter((c) => !isOpenSlot(c)).length;
  const amount = event ? (plan === 'full' ? event.foursomePrice : SEAT(event)) : 0;

  const setPlayer = (i: number, patch: Partial<Contact>) => setRoster((r) => r.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const pay = async (method: 'applepay' | 'card') => {
    if (!event) return;
    // Ticket checkout requires the Liability Waiver (tournament participation, cart safety) and Terms.
    if (!agreed) { haptic('error'); return setAgreeErr(true); }
    accept(['waiver', 'tos'], 'checkout', event.id);
    setPayErr(null);
    setPaying(true);
    const ok = await charge(method);
    setPaying(false);
    if (!ok) { haptic('error'); return setPayErr('Payment not confirmed.'); }
    dispatch({
      type: 'register',
      reg: {
        id: newId(), eventId: event.id, teamName: v.teamName, captain: cleanContact(cap),
        roster: roster.map(cleanContact) as Registration['roster'], total: event.foursomePrice, paid: amount, paidAt: Date.now(),
        teeTime: `Shotgun · Hole ${(ops.registrations.filter((r) => r.eventId === event.id).length % 18) + 1}`,
      },
    });
    haptic('success');
    setStep('done');
  };

  const teammates = roster.filter((c) => !isOpenSlot(c)).map((c) => c.phone);
  const back = () => {
    if (tab === 'mine' || step === 'list') return onBack();
    setStep(step === 'pay' ? 'roster' : step === 'roster' ? 'details' : 'list');
  };

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-4 flex items-center gap-3">
        <button onClick={back} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md"><ChevronLeft size={16} /></button>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white">{step === 'roster' ? 'Your Foursome' : step === 'pay' ? 'Checkout' : step === 'details' ? 'Event' : 'Tournaments'}</h2>
      </div>

      {step === 'list' && (
        <div role="tablist" className="z-10 mb-4 flex rounded-xl border border-white/10 bg-black/40 p-1 backdrop-blur-md">
          {([['events', 'Events'], ['saved', `Saved${favs.length ? ` · ${favs.length}` : ''}`], ['mine', `My Teams${mine.length ? ` · ${mine.length}` : ''}`]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-lg py-2 text-[10px] font-bold uppercase tracking-wide ${tab === id ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-400' : 'border border-transparent text-white/50'}`}>{label}</button>
          ))}
        </div>
      )}

      <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-28">
        {step === 'list' && tab === 'events' && inbox.length > 0 && (
          <div className="mb-3 rounded-2xl border border-sky-300/30 bg-sky-400/10 p-3" aria-label="Shared with you">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-sky-200">Shared with you{unseenShares ? ` · ${unseenShares} new` : ''}</div>
            {inbox.slice(0, 5).map((x) => {
              const e = events.find((ev) => ev.id === x.eventId);
              return e ? <button key={x.id} onClick={() => { setEvent(e); setStep('details'); }} className="block w-full truncate py-0.5 text-left text-[12px] text-white/85"><b>{x.fromName}</b> shared {e.name}</button> : null;
            })}
          </div>
        )}
        {step === 'list' && (tab === 'events' || tab === 'saved') && (tab === 'saved' ? events.filter((e) => favs.includes(e.id)) : events).map((e) => (
          <div key={e.id} className="relative mb-3">
            <button onClick={() => { setEvent(e); setStep('details'); setTouched(false); }} className="w-full rounded-3xl border border-white/10 bg-white/[0.06] p-4 text-left backdrop-blur-2xl active:scale-[0.99]">
              <BannerThumb banner={ops.eventDetails[e.id]?.banner} interactive={false} />
              <div className="mb-2 flex items-center gap-2 pr-20 text-[10px] font-bold uppercase tracking-widest text-amber-300"><Trophy size={12} /> Charity event</div>
              <div className="text-lg font-black tracking-tight text-white">{e.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/60"><CalendarDays size={12} /> {e.date}</div>
              <div className="text-[11px] text-white/60">{e.course} · {e.format}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300/80"><HeartHandshake size={12} /> {e.cause}</div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-xl font-semibold text-emerald-400">${e.foursomePrice}<span className="text-[10px] text-white/40"> / foursome</span></span>
                <span className="rounded-full bg-emerald-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-black">View & register</span>
              </div>
            </button>
            <div className="absolute right-3 top-3 flex gap-1.5">
              <button onClick={() => toggleFav(e.id)} aria-pressed={favs.includes(e.id)} aria-label={`${favs.includes(e.id) ? 'Unsave' : 'Save'} ${e.name}`} className={`grid h-9 w-9 place-items-center rounded-full border backdrop-blur ${favs.includes(e.id) ? 'border-amber-300/60 bg-amber-300/20 text-amber-200' : 'border-white/15 bg-black/50 text-white/70'}`}><Star size={15} fill={favs.includes(e.id) ? 'currentColor' : 'none'} /></button>
              <button onClick={() => setSharing(e)} aria-label={`Share ${e.name}`} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/50 text-white/70 backdrop-blur"><Share2 size={15} /></button>
            </div>
          </div>
        ))}
        {step === 'list' && tab === 'saved' && !favs.some((id) => events.some((e) => e.id === id)) && <p className="py-10 text-center text-[12px] text-white/45">Tap ☆ on an event to save it here.</p>}
        {step === 'list' && tab === 'events' && !events.length && <p className="py-10 text-center text-[12px] text-white/45">No upcoming events.</p>}

        {step === 'details' && event && (
          <>
            <div className="mb-2 flex justify-end gap-1.5">
              <button onClick={() => toggleFav(event.id)} aria-pressed={favs.includes(event.id)} className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold uppercase tracking-widest ${favs.includes(event.id) ? 'border-amber-300/60 bg-amber-300/15 text-amber-200' : 'border-white/15 bg-black/40 text-white/70'}`}><Star size={13} fill={favs.includes(event.id) ? 'currentColor' : 'none'} /> {favs.includes(event.id) ? 'Saved' : 'Save'}</button>
              <button onClick={() => setSharing(event)} className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/70"><Share2 size={13} /> Share</button>
            </div>
            <EventDetailsView event={event} details={ops.eventDetails[event.id]} onRegister={() => setStep('roster')} />
          </>
        )}

        {step === 'list' && tab === 'mine' && (
          mine.length ? mine.map((r) => <MyTeam key={r.id} reg={r} events={events.length ? events : EVENTS} live={ops.settings.tournamentLive} onSave={(p) => dispatch({ type: 'roster', id: r.id, ...p, actor: r.captain.phone })} onPay={(amt) => dispatch({ type: 'pay', id: r.id, amount: amt })} />)
            : <p className="py-10 text-center text-[12px] text-white/45">You haven’t captained a team yet.</p>
        )}

        {step === 'roster' && event && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-white/55">Four slots: you plus three. Add each player’s name, mobile and email now, or leave a slot open and fill it later from My Tournaments.</p>
            <label className="flex flex-col gap-1">
              <span className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">Team name</span>
              <input value={team} maxLength={30} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Fore Play" className={`${input} py-3 text-sm ${touched && v.errors.team ? 'border-rose-400/60' : 'border-white/10'}`} />
              {touched && v.errors.team && <span className="pl-1 text-[10px] text-rose-300">{v.errors.team}</span>}
            </label>
            <PlayerCard title="Captain" c={cap} err={touched ? v.errors.captain : {}} onChange={(p) => setCap({ ...cap, ...p })} />
            {roster.map((c, i) => <PlayerCard key={i} title={`Player ${i + 2}`} c={c} err={touched ? v.errors.roster[i] : {}} onChange={(p) => setPlayer(i, p)} optional />)}
            {touched && v.errors.duplicate && <p className="pl-1 text-[11px] text-rose-300">{v.errors.duplicate}</p>}
          </div>
        )}

        {step === 'pay' && event && (
          <div className="flex flex-col gap-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">Order summary</div>
              <div className="mt-1 text-sm font-bold text-white">{event.name}</div>
              <div className="text-[11px] text-white/55">Foursome · “{v.teamName}” · {players}/4 players</div>
              <ul className="mt-2 text-[11px] text-white/70">
                {[cap, ...roster].map((c, i) => <li key={i} className="flex items-center gap-1.5"><Users size={10} className="text-white/35" />{isOpenSlot(c) ? <span className="italic text-white/40">Open slot</span> : `${c.first} ${c.last}`}</li>)}
              </ul>
              <div role="radiogroup" aria-label="Payment" className="mt-3 grid grid-cols-2 gap-2">
                {([['full', 'Whole foursome', event.foursomePrice], ['seat', 'My seat now', SEAT(event)]] as const).map(([id, label, amt]) => (
                  <button key={id} role="radio" aria-checked={plan === id} onClick={() => setPlan(id)} className={`rounded-xl border px-3 py-2 text-left ${plan === id ? 'border-emerald-500/50 bg-emerald-500/15' : 'border-white/10 bg-black/30'}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${plan === id ? 'text-emerald-300' : 'text-white/60'}`}>{label}</div>
                    <div className="font-mono text-sm text-white">${amt}</div>
                  </button>
                ))}
              </div>
              {plan === 'seat' && <p className="mt-2 text-[10px] text-amber-200/80">Team balance ${event.foursomePrice - SEAT(event)} is due before the event.</p>}
              <div className="mt-3 flex justify-between border-t border-white/10 pt-2 font-mono text-sm"><span className="text-white/60">Due today</span><span className="font-bold text-emerald-400">${amount}.00</span></div>
            </div>
            <TrackingNotice />
            <LegalConsent docs={['waiver', 'tos']} checked={agreed} onChange={(v) => { setAgreed(v); setAgreeErr(false); }} error={agreeErr} />
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
            {teammates.length > 0 ? (
              <>
                <a href={smsGroupLink(teammates, inviteText(v.teamName, event))} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-4 text-[12px] font-black uppercase tracking-[0.15em] text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.25)] backdrop-blur-xl active:scale-[0.98]">
                  <MessageSquareText size={18} /> Text Your Team The Invite
                </a>
                <p className="text-[10px] text-white/40">Opens Messages with {teammates.length} teammate{teammates.length > 1 ? 's' : ''} and the app link — sent from your phone, no SMS fees.</p>
              </>
            ) : <p className="mt-4 text-[11px] text-white/50">Add your teammates any time from My Tournaments.</p>}
          </div>
        )}
      </div>

      {sharing && (
        <ShareEvent event={sharing} friends={friends} onClose={() => setSharing(null)}
          onInApp={(handles) => handles.forEach((h) => dispatch({ type: 'shareEvent', share: { id: newId(), eventId: sharing.id, fromName: `${captain.first} ${captain.last}`.trim(), toHandle: h, at: Date.now() } }))} />
      )}
      {step === 'roster' && (
        <div className="absolute inset-x-5 bottom-6 z-20">
          <div className="rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-xl">
            <button onClick={() => { setTouched(true); if (v.ok) setStep('pay'); }} className="w-full rounded-xl bg-emerald-500 py-3.5 text-xs font-black uppercase tracking-widest text-black">
              Continue to checkout · {players}/4 players
            </button>
          </div>
        </div>
      )}
      {step === 'done' && (
        <div className="absolute inset-x-5 bottom-6 z-20">
          <button onClick={() => { setStep('list'); setTab('mine'); }} className="w-full rounded-2xl border border-white/10 bg-white/10 py-3.5 text-xs font-bold uppercase tracking-widest text-white">Done</button>
        </div>
      )}
    </div>
  );
}

/** Captain's view of one team: head count, payment, and pre-event roster edits (drop-outs, swaps). */
function MyTeam({ reg, events, live, onSave, onPay }: { reg: Registration; events: EventInfo[]; live: boolean; onSave: (p: { teamName: string; captain: Contact; roster: Registration['roster'] }) => void; onPay: (amount: number) => void }) {
  const ev = events.find((e) => e.id === reg.eventId) ?? EVENTS.find((e) => e.id === reg.eventId) ?? events[0] ?? EVENTS[0];
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState(reg.teamName);
  const [cap, setCap] = useState(reg.captain);
  const [roster, setRoster] = useState<Contact[]>(reg.roster);
  const [touched, setTouched] = useState(false);
  const [invite, setInvite] = useState<string[]>([]);
  // Error correction: the roster as it was before the last save, so the captain can undo it.
  const [prev, setPrev] = useState<{ teamName: string; captain: Contact; roster: Registration['roster'] } | null>(null);
  const [paying, setPaying] = useState(false);
  const v = validateTeam(team, roster, cap);
  const due = balance(reg);

  const save = () => {
    setTouched(true);
    if (!v.ok) return;
    // Anyone new in a slot gets offered an invite text.
    const before = new Set(reg.roster.map((c) => normalizePhone(c.phone)).filter(Boolean));
    setInvite(roster.filter((c) => !isOpenSlot(c) && !before.has(normalizePhone(c.phone))).map((c) => c.phone));
    setPrev({ teamName: reg.teamName, captain: reg.captain, roster: reg.roster });
    onSave({ teamName: team, captain: cap, roster: roster as Registration['roster'] });
    haptic('success');
    setEditing(false);
    setTouched(false);
  };
  const undoSave = () => {
    if (!prev) return;
    onSave(prev);
    haptic('warning');
    setTeam(prev.teamName); setCap(prev.captain); setRoster(prev.roster);
    setPrev(null); setInvite([]);
  };

  return (
    <div className="mb-3 rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl" aria-label={`Team ${reg.teamName}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-black text-white">{reg.teamName}</div>
          <div className="text-[11px] text-white/55">{ev.name} · {reg.teeTime}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${due ? 'bg-amber-400/15 text-amber-200' : 'bg-emerald-500/15 text-emerald-300'}`}>{due ? `$${due} due` : 'Paid'}</span>
      </div>
      <div className="mt-1 text-[11px] text-white/60">{filledCount(reg)}/4 players</div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2.5">
          <input aria-label="Team name" value={team} maxLength={30} onChange={(e) => setTeam(e.target.value)} className={`${input} ${touched && v.errors.team ? 'border-rose-400/60' : 'border-white/10'}`} />
          <PlayerCard title="Captain" c={cap} err={touched ? v.errors.captain : {}} onChange={(p) => setCap({ ...cap, ...p })} lockPhone />
          {roster.map((c, i) => (
            <PlayerCard key={i} title={`Player ${i + 2}`} c={c} optional err={touched ? v.errors.roster[i] : {}}
              onChange={(p) => setRoster((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)))}
              onClear={isOpenSlot(c) ? undefined : () => setRoster((r) => r.map((x, k) => (k === i ? blankContact() : x)))} />
          ))}
          {touched && v.errors.duplicate && <p className="text-[11px] text-rose-300">{v.errors.duplicate}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setEditing(false); setTeam(reg.teamName); setCap(reg.captain); setRoster(reg.roster); }} className="h-10 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/70">Cancel</button>
            <button onClick={save} className="h-10 rounded-xl bg-emerald-500 text-[10px] font-black uppercase tracking-widest text-black">Save roster</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-1 text-[11px]">
            {[reg.captain, ...reg.roster].map((c, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5">
                {isOpenSlot(c) ? <span className="italic text-white/40">Open slot</span> : <span className="text-white/85">{c.first} {c.last}{i === 0 && <span className="ml-1 text-[9px] text-amber-300">CAPT</span>}</span>}
                {!isOpenSlot(c) && <span className="font-mono text-[10px] text-white/45">{c.phone}</span>}
              </li>
            ))}
          </ul>
          {prev && !live && (
            <div role="status" className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">
              Roster updated.
              <button onClick={undoSave} className="rounded-lg bg-amber-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-black">Undo changes</button>
            </div>
          )}
          {invite.length > 0 && (
            <a href={smsGroupLink(invite, inviteText(reg.teamName, ev))} className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-200">
              <MessageSquareText size={14} /> Text new player{invite.length > 1 ? 's' : ''} the invite
            </a>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {live ? (
              <p className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/30 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/50"><Lock size={12} /> Roster locked · event live</p>
            ) : (
              <button onClick={() => { setEditing(true); setInvite([]); }} className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white ${due ? '' : 'col-span-2'}`}><Pencil size={12} /> Edit roster</button>
            )}
            {due > 0 && !live && (
              <button disabled={paying} onClick={async () => { setPaying(true); if (await charge('applepay')) onPay(due); setPaying(false); }} className="h-10 rounded-xl bg-emerald-500 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-50">{paying ? '…' : `Pay balance $${due}`}</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PlayerCard({ title, c, err, onChange, optional, onClear, lockPhone }: {
  title: string; c: Contact; err: Partial<Record<keyof Contact, string>>; onChange: (p: Partial<Contact>) => void;
  optional?: boolean; onClear?: () => void; lockPhone?: boolean;
}) {
  const cls = (k: keyof Contact) => `${input} ${err[k] ? 'border-rose-400/60' : 'border-white/10'}`;
  return (
    <fieldset className="rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-md">
      <legend className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
        {title}{optional && isOpenSlot(c) && <span className="font-normal normal-case tracking-normal text-white/35">· open slot</span>}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label={`${title} first name`} value={c.first} maxLength={40} onChange={(e) => onChange({ first: e.target.value })} placeholder="First name" className={cls('first')} />
        <input aria-label={`${title} last name`} value={c.last} maxLength={40} onChange={(e) => onChange({ last: e.target.value })} placeholder="Last name" className={cls('last')} />
        <input aria-label={`${title} phone`} type="tel" inputMode="tel" value={c.phone} maxLength={20} disabled={lockPhone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="Mobile" className={cls('phone')} />
        <input aria-label={`${title} email`} type="email" value={c.email} maxLength={254} onChange={(e) => onChange({ email: e.target.value })} placeholder="Email" className={cls('email')} />
      </div>
      {Object.values(err).filter(Boolean).length > 0 && <p className="mt-1.5 text-[10px] text-rose-300">{[...new Set(Object.values(err))].join(' · ')}</p>}
      {onClear && (
        <button type="button" onClick={onClear} className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-rose-300/80"><UserMinus size={11} /> Remove (drop-out)</button>
      )}
    </fieldset>
  );
}
