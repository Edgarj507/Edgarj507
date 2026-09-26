import { useMemo, useState } from 'react';
import { BadgeDollarSign, Banknote, ChevronRight, Mail, MessageSquareText, Pencil, Search, ShieldCheck, Trophy, UserMinus, Users } from 'lucide-react';
import { balance, blankContact, filledCount, isOpenSlot, validateTeam, type Contact, type Registration } from '../ops/model';
import { smsGroupLink } from '../lib/sms';
import type { EventInfo } from '../tournaments/events';
import { field, glass, Panel, Stat } from './ui';

type Filter = 'all' | 'balance' | 'open';
export interface RosterPatch { teamName: string; captain: Contact; roster: Registration['roster'] }

interface Props {
  event: EventInfo;
  regs: Registration[];
  onSave: (id: string, p: RosterPatch) => void;
  onMarkPaid: (id: string, amount: number) => void;
}

/**
 * Pre-Tournament CRM. Deliberately map-free: before the event nobody's location is tracked or shown.
 * Rosters, payments and contact details only.
 */
export function EventCRM({ event, regs, onSave, onMarkPaid }: Props) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => regs.filter((r) => {
    if (filter === 'balance' && !balance(r)) return false;
    if (filter === 'open' && filledCount(r) === 4) return false;
    const s = q.trim().toLowerCase();
    return !s || `${r.teamName} ${r.captain.first} ${r.captain.last}`.toLowerCase().includes(s);
  }), [regs, q, filter]);
  const sel = regs.find((r) => r.id === openId) ?? null;

  const outstanding = regs.reduce((a, r) => a + balance(r), 0);
  const collected = regs.reduce((a, r) => a + r.paid, 0);
  const players = regs.reduce((a, r) => a + filledCount(r), 0);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 @4xl:grid-cols-[1.25fr_1fr]" data-testid="event-crm">
      <Panel
        title={<><Trophy size={13} className="text-amber-300" /> {event.name} · Teams</>}
        aside={<span className="text-[10px] text-white/45">{event.date}</span>}
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
          <Stat label="Teams" value={`${regs.length}/${event.teams}`} />
          <Stat label="Players" value={`${players}/${regs.length * 4}`} />
          <Stat label="Collected" value={`$${collected.toLocaleString()}`} tone="green" />
          <Stat label="Outstanding" value={`$${outstanding.toLocaleString()}`} tone={outstanding ? 'amber' : undefined} />
          <span className="ml-auto flex items-center gap-1 text-[10px] text-white/40"><ShieldCheck size={12} className="text-emerald-400" /> No locations shown before the event starts</span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[180px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team or captain" aria-label="Search teams" className={`${field} py-2 pl-8`} />
          </label>
          {([['all', 'All'], ['balance', 'Balance due'], ['open', 'Open slots']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${filter === id ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/50'}`}>{label}</button>
          ))}
        </div>
        <table className="w-full text-left text-[12px]">
          <thead className="text-[9px] uppercase tracking-widest text-white/40">
            <tr><th className="px-3 py-2 font-bold">Team</th><th className="py-2 font-bold">Captain</th><th className="py-2 font-bold">Players</th><th className="py-2 font-bold">Payment</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const n = filledCount(r), due = balance(r);
              return (
                <tr key={r.id} onClick={() => setOpenId(r.id)} aria-selected={openId === r.id}
                  className={`cursor-pointer border-t border-white/5 ${openId === r.id ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'}`}>
                  <td className="px-3 py-2.5 font-bold text-white">{r.teamName}</td>
                  <td className="py-2.5 text-white/65">{r.captain.first} {r.captain.last}</td>
                  <td className={`py-2.5 font-mono ${n < 4 ? 'text-amber-200' : 'text-white/80'}`}>{n}/4</td>
                  <td className="py-2.5">
                    {due ? <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">Partially Paid · ${due} due</span>
                      : <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Fully Paid</span>}
                  </td>
                  <td className="pr-2 text-right"><ChevronRight size={14} className="inline text-white/30" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="py-8 text-center text-[11px] text-white/40">No teams match.</p>}
      </Panel>

      {sel ? <TeamDetail key={sel.id} reg={sel} event={event} onSave={(p) => onSave(sel.id, p)} onMarkPaid={(amt) => onMarkPaid(sel.id, amt)} />
        : (
          <section className={`${glass} hidden place-items-center rounded-3xl p-6 text-center text-[12px] text-white/40 @4xl:grid`}>
            <span><Users size={22} className="mx-auto mb-2 text-white/25" />Tap a team to see contacts, edit the roster or collect a balance.</span>
          </section>
        )}
    </div>
  );
}

function TeamDetail({ reg, event, onSave, onMarkPaid }: { reg: Registration; event: EventInfo; onSave: (p: RosterPatch) => void; onMarkPaid: (amount: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState(reg.teamName);
  const [slots, setSlots] = useState<Contact[]>([reg.captain, ...reg.roster]);
  const [touched, setTouched] = useState(false);
  const due = balance(reg);
  const v = validateTeam(team, slots.slice(1), slots[0]);
  const errs = [v.errors.captain, ...v.errors.roster];
  const cap = reg.captain;

  const reminder = `Hi ${cap.first}, a friendly reminder from ${event.course}: "${reg.teamName}" has a $${due} balance for the ${event.name} (${event.date}). Pay in the Exclusive.Golf app (Tournaments → My Tournaments): ${typeof window !== 'undefined' ? window.location.origin : ''}`;
  const sms = smsGroupLink([cap.phone], reminder);
  const mail = `mailto:${encodeURIComponent(cap.email)}?subject=${encodeURIComponent(`${event.name}: $${due} balance for ${reg.teamName}`)}&body=${encodeURIComponent(reminder)}`;

  const save = () => {
    setTouched(true);
    if (!v.ok) return;
    onSave({ teamName: team, captain: slots[0], roster: slots.slice(1) as Registration['roster'] });
    setEditing(false);
  };

  return (
    <Panel
      title={<>{reg.teamName}</>}
      aside={due ? <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">Partially Paid</span> : <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Fully Paid</span>}
    >
      <div aria-label="Team detail" className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/5 bg-black/30 p-3">
          <Stat label="Players" value={`${filledCount(reg)}/4`} tone={filledCount(reg) < 4 ? 'amber' : undefined} />
          <Stat label="Paid" value={`$${reg.paid}`} tone="green" />
          <Stat label="Balance" value={`$${due}`} tone={due ? 'amber' : undefined} />
        </div>

        {due > 0 && !editing && (
          <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-100"><BadgeDollarSign size={14} /> ${due} outstanding · captain {cap.first} {cap.last}</div>
            <div className="grid grid-cols-2 gap-2">
              <a href={sms} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 text-[10px] font-black uppercase tracking-widest text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-xl active:scale-[0.98]">
                <MessageSquareText size={14} /> Send Balance Reminder
              </a>
              <a href={mail} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 text-[10px] font-bold uppercase tracking-widest text-white/75 backdrop-blur-xl active:scale-[0.98]">
                <Mail size={14} /> Email instead
              </a>
            </div>
            <button onClick={() => onMarkPaid(due)} className="mt-2 flex w-full items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/45 hover:text-white/70"><Banknote size={12} /> Record cash / check payment</button>
          </div>
        )}

        {editing ? (
          <div className="flex flex-col gap-2">
            <input aria-label="Team name" value={team} maxLength={30} onChange={(e) => setTeam(e.target.value)} className={field} />
            {slots.map((c, i) => (
              <fieldset key={i} className="rounded-2xl border border-white/10 bg-black/30 p-2.5">
                <legend className="flex items-center gap-2 px-1 text-[9px] font-bold uppercase tracking-widest text-white/50">
                  {i === 0 ? 'Captain' : `Player ${i + 1}`}
                  {i > 0 && !isOpenSlot(c) && <button type="button" onClick={() => setSlots((s) => s.map((x, k) => (k === i ? blankContact() : x)))} className="flex items-center gap-1 text-rose-300/80"><UserMinus size={10} /> Remove</button>}
                </legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['first', 'last', 'phone', 'email'] as const).map((k) => (
                    <input key={k} aria-label={`${i === 0 ? 'Captain' : `Player ${i + 1}`} ${k === 'first' ? 'first name' : k === 'last' ? 'last name' : k}`} value={c[k]} placeholder={k === 'first' ? 'First name' : k === 'last' ? 'Last name' : k === 'phone' ? 'Mobile' : 'Email'}
                      onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                      className={`${field} py-1.5 text-[12px] ${touched && errs[i]?.[k] ? 'border-rose-400/60' : ''}`} />
                  ))}
                </div>
              </fieldset>
            ))}
            {touched && !v.ok && <p className="text-[11px] text-rose-300">{v.errors.duplicate ?? v.errors.team ?? 'Complete each filled slot (name, mobile, email) or remove it.'}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setEditing(false); setSlots([reg.captain, ...reg.roster]); setTeam(reg.teamName); setTouched(false); }} className="h-10 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/70">Cancel</button>
              <button onClick={save} className="h-10 rounded-xl bg-emerald-500 text-[10px] font-black uppercase tracking-widest text-black">Save roster</button>
            </div>
          </div>
        ) : (
          <>
            <table className="w-full text-left text-[12px]">
              <tbody>
                {[reg.captain, ...reg.roster].map((c, i) => (
                  <tr key={i} className="border-t border-white/5">
                    {isOpenSlot(c) ? (
                      <td colSpan={3} className="py-2 pl-1 italic text-white/35">Open slot {i + 1}</td>
                    ) : (
                      <>
                        <td className="py-2 pl-1 font-semibold text-white">{c.first} {c.last}{i === 0 && <span className="ml-1 text-[9px] text-amber-300">CAPT</span>}</td>
                        <td className="py-2"><a href={`tel:${c.phone}`} className="font-mono text-white/70 hover:underline">{c.phone}</a></td>
                        <td className="py-2 pr-1"><a href={`mailto:${c.email}`} className="text-white/60 hover:underline">{c.email}</a></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => { setEditing(true); setTouched(false); }} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white"><Pencil size={12} /> Edit Roster</button>
          </>
        )}
      </div>
    </Panel>
  );
}
