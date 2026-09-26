import { useMemo, useState } from 'react';
import { ArrowRightLeft, CalendarDays, Phone, Search, UserPlus, Users } from 'lucide-react';
import { balance, blankContact, isOpenSlot, validateTeam, type Contact, type OpsState, type Registration } from '../ops/model';
import { phonesIn, playerShare, searchGolfers, seatPrice, teamPhones, type GolferHit } from '../ops/roster';
import type { TournamentEvent } from '../ops/venues';
import { normalizePhone } from '../lib/sms';
import { newId } from '../ops/useOps';
import { field, glass, Modal } from '../clubhouse/ui';

const lbl = 'text-[10px] font-bold uppercase tracking-widest text-white/50';
const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
const spotsLeft = (ops: OpsState, e: TournamentEvent) => e.teams - ops.registrations.filter((r) => r.eventId === e.id).length;
const who = (c: Contact) => `${c.first} ${c.last}`.trim();

export interface RosterActions {
  onRegister: (r: Registration) => void;
  onMoveTeam: (id: string, toEventId: string, label: string) => void;
  onMovePlayer: (id: string, slot: 0 | 1 | 2, toEventId: string, label: string) => void;
}

/**
 * Roster desk: search golfers across every tournament (name or phone), fix a wrong-date entry
 * with Move / Reassign (payment moves too), and enter golfers manually for a chosen tournament.
 */
export function RosterDesk({ ops, events, query, onQuery, defaultEventId, actions }: {
  ops: OpsState; events: TournamentEvent[]; query: string; onQuery: (q: string) => void; defaultEventId?: string;
} & { actions: RosterActions }) {
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<GolferHit | null>(null);
  const hits = useMemo(() => searchGolfers(ops.registrations, events, query), [ops.registrations, events, query]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="roster-desk">
      <section className={`${glass} flex flex-wrap items-center gap-2 rounded-3xl p-3`}>
        <label className="relative min-w-[240px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input aria-label="Search golfers across all tournaments" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search all tournaments by golfer name or phone"
            className={`${field} pl-9`} />
        </label>
        <button onClick={() => setAdding(true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-widest text-black"><UserPlus size={13} /> Add golfer / team</button>
      </section>

      <ul aria-label="Golfer search results" className="eg-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {hits.map((h) => (
          <li key={`${h.reg.id}:${h.slot}`} className={`${glass} flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2`} aria-label={`${who(h.contact)} in ${h.event?.name ?? 'unknown event'}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[13px] font-bold">{who(h.contact)}{h.slot === -1 && <span className="rounded bg-amber-300/15 px-1 text-[8px] font-black uppercase tracking-widest text-amber-200">Captain</span>}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-white/55">
                <span className="flex items-center gap-1"><Phone size={10} /> {h.contact.phone}</span>
                <span>Team “{h.reg.teamName}”</span>
              </div>
            </div>
            <div className="text-right text-[11px]">
              <div className="flex items-center justify-end gap-1 font-semibold text-sky-100"><CalendarDays size={11} /> {h.event?.name ?? h.reg.eventId}</div>
              <div className="text-white/50">{h.event?.date}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${balance(h.reg) ? 'bg-amber-400/15 text-amber-200' : 'bg-emerald-500/15 text-emerald-300'}`}>
              {balance(h.reg) ? `${money(h.reg.paid)} paid · ${money(balance(h.reg))} due` : 'Paid'}
            </span>
            <button onClick={() => setMoving(h)} aria-label={`Move / Reassign ${who(h.contact)}`} className="flex h-9 items-center gap-1.5 rounded-xl border border-sky-300/40 bg-sky-400/10 px-3 text-[10px] font-black uppercase tracking-widest text-sky-100"><ArrowRightLeft size={12} /> Move / Reassign</button>
          </li>
        ))}
        {query.trim().length >= 2 && !hits.length && <li className="py-10 text-center text-[12px] text-white/45">No golfer matches “{query.trim()}” in any tournament.</li>}
        {query.trim().length < 2 && <li className="py-10 text-center text-[12px] text-white/45">Type at least 2 letters of a name, or 3+ digits of a phone number.</li>}
      </ul>

      {adding && <ManualEntryModal ops={ops} events={events} defaultEventId={defaultEventId} onClose={() => setAdding(false)} onSubmit={(r) => { actions.onRegister(r); setAdding(false); onQuery(r.captain.last); }} />}
      {moving && <MoveDialog ops={ops} events={events} hit={moving} onClose={() => setMoving(null)}
        onMoveTeam={(to, label) => { actions.onMoveTeam(moving.reg.id, to, label); setMoving(null); }}
        onMovePlayer={(to, label) => { actions.onMovePlayer(moving.reg.id, moving.slot as 0 | 1 | 2, to, label); setMoving(null); }} />}
    </div>
  );
}

function EventOption({ ops, e }: { ops: OpsState; e: TournamentEvent }) {
  const left = spotsLeft(ops, e);
  return <option value={e.id} disabled={left <= 0}>{e.name} · {e.date} · {e.course}{left <= 0 ? ' · FULL' : ` · ${left} spots left`}</option>;
}

/** Manual entry: pick the tournament explicitly, then the team. (No handicap field.) */
export function ManualEntryModal({ ops, events, defaultEventId, onSubmit, onClose }: {
  ops: OpsState; events: TournamentEvent[]; defaultEventId?: string; onSubmit: (r: Registration) => void; onClose: () => void;
}) {
  const open = events.filter((e) => e.status === 'scheduled');
  const [eventId, setEventId] = useState(() => (open.some((e) => e.id === defaultEventId && spotsLeft(ops, e) > 0) ? defaultEventId! : ''));
  const [team, setTeam] = useState('');
  const [cap, setCap] = useState<Contact>(blankContact());
  const [roster, setRoster] = useState<Contact[]>([blankContact(), blankContact(), blankContact()]);
  const [pay, setPay] = useState<'unpaid' | 'full' | 'partial'>('unpaid');
  const [partial, setPartial] = useState('');
  const [touched, setTouched] = useState(false);
  const ev = open.find((e) => e.id === eventId);
  const v = validateTeam(team, roster, cap);
  const taken = ev ? phonesIn(ops.registrations, ev.id) : new Set<string>();
  const dupes = teamPhones({ captain: cap, roster: roster as Registration['roster'] }).filter((p) => taken.has(p));
  const amt = pay === 'full' ? ev?.foursomePrice ?? 0 : pay === 'partial' ? Number(partial) : 0;
  const amtBad = pay === 'partial' && !(Number.isFinite(amt) && amt > 0 && amt < (ev?.foursomePrice ?? 0));
  const err = (t?: string) => (touched && t ? <p className="text-[10px] text-rose-300">{t}</p> : null);

  const submit = () => {
    setTouched(true);
    if (!ev || !v.ok || dupes.length || amtBad) return;
    onSubmit({ id: newId(), eventId: ev.id, teamName: team, captain: cap, roster: roster as Registration['roster'], total: ev.foursomePrice, paid: amt, paidAt: 0, teeTime: '' });
  };

  return (
    <Modal title="Add golfer / team" onClose={onClose} wide>
      <div className="grid gap-3">
        <label className="flex flex-col gap-1"><span className={lbl}>Tournament</span>
          <select aria-label="Tournament" value={eventId} onChange={(e) => setEventId(e.target.value)} className={`${field} ${touched && !ev ? 'border-rose-400/60' : ''}`}>
            <option value="">Choose the tournament…</option>
            {open.map((e) => <EventOption key={e.id} ops={ops} e={e} />)}
          </select>
          {err(!ev ? 'Pick which tournament this golfer is registering for' : undefined)}
          {ev && <span className="text-[10px] text-white/45">{ev.longDate} · {ev.location} · ${ev.foursomePrice}/foursome</span>}</label>
        <label className="flex flex-col gap-1"><span className={lbl}>Team name</span>
          <input aria-label="Team name" value={team} maxLength={30} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Fore Play" className={field} />{err(v.errors.team)}</label>
        <PersonRow title="Captain" c={cap} onChange={(p) => setCap({ ...cap, ...p })} err={touched ? Object.values(v.errors.captain).filter(Boolean).join(' · ') : ''} />
        {roster.map((c, i) => (
          <PersonRow key={i} title={`Player ${i + 2}`} optional c={c} onChange={(p) => setRoster((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)))} err={touched ? Object.values(v.errors.roster[i]).filter(Boolean).join(' · ') : ''} />
        ))}
        {touched && v.errors.duplicate && <p className="text-[11px] text-rose-300">{v.errors.duplicate}</p>}
        {dupes.length > 0 && <p role="alert" className="text-[11px] text-rose-300">Already registered for this tournament: {dupes.join(', ')}. Use search → Move / Reassign instead.</p>}
        <fieldset className="flex flex-col gap-1.5">
          <legend className={`${lbl} mb-1`}>Payment</legend>
          <div role="radiogroup" aria-label="Payment status" className="grid grid-cols-3 gap-1.5">
            {([['unpaid', 'Unpaid'], ['full', `Paid in full${ev ? ` · $${ev.foursomePrice}` : ''}`], ['partial', 'Partial / deposit']] as const).map(([id, t]) => (
              <button key={id} role="radio" aria-checked={pay === id} onClick={() => setPay(id)} className={`rounded-xl border px-2 py-2 text-[10px] font-bold uppercase tracking-widest ${pay === id ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/55'}`}>{t}</button>
            ))}
          </div>
          {pay === 'partial' && <input aria-label="Amount received" inputMode="decimal" value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="Amount received ($)" className={`${field} font-mono`} />}
          {touched && amtBad && <p className="text-[10px] text-rose-300">Enter an amount below the foursome price.</p>}
        </fieldset>
        <button onClick={submit} className="h-11 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-[0.18em] text-black">Register for {ev ? ev.name : 'tournament'}</button>
      </div>
    </Modal>
  );
}

function PersonRow({ title, c, onChange, err, optional }: { title: string; c: Contact; onChange: (p: Partial<Contact>) => void; err: string; optional?: boolean }) {
  return (
    <fieldset className="rounded-2xl border border-white/10 bg-black/30 p-2.5">
      <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-white/50">{title}{optional && isOpenSlot(c) && <span className="font-normal normal-case tracking-normal text-white/35"> · optional</span>}</legend>
      <div className="grid grid-cols-2 gap-1.5 @xl:grid-cols-4">
        <input aria-label={`${title} first name`} value={c.first} maxLength={40} onChange={(e) => onChange({ first: e.target.value })} placeholder="First name" className={`${field} py-2`} />
        <input aria-label={`${title} last name`} value={c.last} maxLength={40} onChange={(e) => onChange({ last: e.target.value })} placeholder="Last name" className={`${field} py-2`} />
        <input aria-label={`${title} phone`} type="tel" value={c.phone} maxLength={20} onChange={(e) => onChange({ phone: e.target.value })} placeholder="Mobile" className={`${field} py-2`} />
        <input aria-label={`${title} email`} type="email" value={c.email} maxLength={254} onChange={(e) => onChange({ email: e.target.value })} placeholder="Email" className={`${field} py-2`} />
      </div>
      {err && <p className="mt-1 text-[10px] text-rose-300">{err}</p>}
    </fieldset>
  );
}

/** Move / Reassign: whole team (captain) or just this player (roster), payment carried over. */
function MoveDialog({ ops, events, hit, onMoveTeam, onMovePlayer, onClose }: {
  ops: OpsState; events: TournamentEvent[]; hit: GolferHit; onMoveTeam: (to: string, label: string) => void; onMovePlayer: (to: string, label: string) => void; onClose: () => void;
}) {
  const r = hit.reg;
  const from = events.find((e) => e.id === r.eventId);
  const captain = hit.slot === -1;
  const [mode, setMode] = useState<'team' | 'player'>(captain ? 'team' : 'player');
  const [to, setTo] = useState('');
  const targets = events.filter((e) => e.status === 'scheduled' && e.id !== r.eventId);
  const dest = targets.find((e) => e.id === to);
  const phones = mode === 'team' ? teamPhones(r) : [normalizePhone(hit.contact.phone)].filter((p): p is string => !!p);
  const conflict = dest ? phones.filter((p) => phonesIn(ops.registrations, dest.id).has(p)) : [];
  const full = dest ? spotsLeft(ops, dest) <= 0 : false;
  const share = from ? playerShare(r, from) : 0;
  const name = who(hit.contact);

  return (
    <Modal title={`Move / Reassign · ${name}`} onClose={onClose} wide>
      <div className="grid gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-[12px]">
          <div className={lbl}>Currently registered</div>
          <div className="font-bold text-white">{from?.name ?? r.eventId} · {from?.date}</div>
          <div className="text-white/60">Team “{r.teamName}” · {1 + r.roster.filter((c) => !isOpenSlot(c)).length}/4 players · {money(r.paid)} of {money(r.total)} paid</div>
        </div>
        <div role="radiogroup" aria-label="What to move" className="grid grid-cols-2 gap-1.5">
          <button role="radio" aria-checked={mode === 'team'} onClick={() => setMode('team')} className={`rounded-xl border px-3 py-2 text-left ${mode === 'team' ? 'border-sky-300/50 bg-sky-400/15' : 'border-white/10'}`}>
            <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-white"><Users size={12} /> Whole team</div>
            <div className="text-[10px] text-white/50">All players and {money(r.paid)} paid move together</div>
          </button>
          <button role="radio" aria-checked={mode === 'player'} disabled={captain} onClick={() => setMode('player')} className={`rounded-xl border px-3 py-2 text-left disabled:opacity-35 ${mode === 'player' ? 'border-sky-300/50 bg-sky-400/15' : 'border-white/10'}`}>
            <div className="text-[11px] font-black uppercase tracking-widest text-white">Just {hit.contact.first}</div>
            <div className="text-[10px] text-white/50">{captain ? 'Captains move with their team' : `Their seat opens; ${money(share)} of the payment moves with them`}</div>
          </button>
        </div>
        <label className="flex flex-col gap-1"><span className={lbl}>Move to tournament</span>
          <select aria-label="Move to tournament" value={to} onChange={(e) => setTo(e.target.value)} className={field}>
            <option value="">Choose the correct tournament…</option>
            {targets.map((e) => <EventOption key={e.id} ops={ops} e={e} />)}
          </select></label>
        {dest && (
          <div className="rounded-2xl border border-sky-300/30 bg-sky-400/10 p-3 text-[12px] text-sky-50" aria-label="Move summary">
            {mode === 'team'
              ? <>Team “{r.teamName}” → <b>{dest.name}</b> ({dest.date}). Paid {money(r.paid)} carries over; new price {money(dest.foursomePrice)} → {r.paid >= dest.foursomePrice ? 'paid in full' : `${money(dest.foursomePrice - r.paid)} due`}. Tee assignment and check-in reset.</>
              : <>{name} → <b>{dest.name}</b> ({dest.date}) as a single entry. {money(Math.min(share, seatPrice(dest)))} credited toward a {money(seatPrice(dest))} seat; “{r.teamName}” keeps {money(r.paid - share)} and gets an open slot.</>}
          </div>
        )}
        {conflict.length > 0 && <p role="alert" className="text-[11px] text-rose-300">Already registered for {dest?.name}: {conflict.join(', ')}.</p>}
        {full && <p role="alert" className="text-[11px] text-rose-300">{dest?.name} is full.</p>}
        <button disabled={!dest || conflict.length > 0 || full}
          onClick={() => (mode === 'team' ? onMoveTeam(dest!.id, `Moved team ${r.teamName} → ${dest!.name}`) : onMovePlayer(dest!.id, `Moved ${name} → ${dest!.name}`))}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-sky-400 text-[11px] font-black uppercase tracking-[0.18em] text-black disabled:opacity-40"><ArrowRightLeft size={14} /> Confirm move</button>
        <p className="text-[10px] text-white/45">You can undo a move from the snackbar or Recent actions.</p>
      </div>
    </Modal>
  );
}
