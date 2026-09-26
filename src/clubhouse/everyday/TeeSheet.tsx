import { HOLES_LABEL } from '../../ops/teetimes';
import { useMemo, useState } from 'react';
import {
  Ban, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock, CloudRain, Droplets, Lock, Phone, PhoneCall, Plus,
  Pencil, Snowflake, Trash2, Trophy, UserRound, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import {
  BLOCK_REASONS, blockFor, blockLabel, dayBlock, fmtTime, fromMin, localDate, toMin, validateBlock, validateBooking,
  type BlockReason, type Hours, type TeeBlock, type TeeBooking,
} from '../../ops/model';
import { newId } from '../../ops/useOps';
import { field, Modal, Panel, Stat } from '../ui';


export const REASON_ICON: Record<BlockReason, LucideIcon> = {
  Maintenance: Wrench, 'Private Event': Lock, Tournament: Trophy, 'Season Closed': Snowflake,
  'Irrigation repair': Droplets, Weather: CloudRain, League: Users, Other: Ban,
};

/** Muted red stripe used for every blocked row/banner. */
const STRIPE = 'border-red-400/15 bg-red-950/20 bg-[repeating-linear-gradient(135deg,rgba(239,68,68,0.07)_0_6px,transparent_6px_12px)]';

type Slot = { time: string; booking?: TeeBooking; block?: TeeBlock };
type Filter = 'all' | 'available' | 'reserved' | 'blocked';

interface Props {
  bookings: TeeBooking[];
  blocks: TeeBlock[];
  courseHours: Hours;
  onBook: (b: TeeBooking) => void;
  onCancel: (id: string) => void;
  onBlock: (k: TeeBlock) => void;
  onUnblock: (id: string) => void;
  onEditBlock: (k: TeeBlock) => void;
  now: number;
  /** Minutes between tee times (Pricing & Policies). */
  interval?: number;
}

/** Everyday operations: full-screen tee sheet (no map) for one day, with bookings and blocks. */
export function TeeSheet({ bookings, blocks, courseHours, onBook, onCancel, onBlock, onUnblock, onEditBlock, now, interval: INTERVAL = 10 }: Props) {
  const [date, setDate] = useState(() => localDate(now));
  const [filter, setFilter] = useState<Filter>('all');
  const [modal, setModal] = useState<{ mode: 'reserve' | 'block'; time: string; editing?: TeeBlock } | null>(null);
  const [viewing, setViewing] = useState<TeeBooking | null>(null);
  const [viewBlock, setViewBlock] = useState<TeeBlock | null>(null);

  const times = useMemo(() => {
    const open = toMin(courseHours.open), close = toMin(courseHours.close);
    const end = close > open ? close : close + 1440;
    const out: string[] = [];
    for (let m = open; m < end; m += INTERVAL) out.push(fromMin(m));
    return out;
  }, [courseHours, INTERVAL]);
  const slots: Slot[] = useMemo(() => {
    const byTime = new Map(bookings.filter((b) => b.date === date).map((b) => [b.time, b]));
    return times.map((time) => ({ time, booking: byTime.get(time), block: blockFor(blocks, date, time) }));
  }, [bookings, blocks, date, times]);

  const today = localDate(now);
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const isPast = (t: string) => date < today || (date === today && toMin(t) < nowMin);
  const closed = dayBlock(blocks, date);
  const reserved = slots.filter((s) => s.booking);
  const blocked = slots.filter((s) => s.block && !s.booking);
  const shown = slots.filter((s) => filter === 'all' || (filter === 'available' ? !s.booking && !s.block : filter === 'reserved' ? s.booking : s.block));
  const upcoming = blocks.filter((k) => k.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const shift = (days: number) => { const d = new Date(`${date}T12:00`); d.setDate(d.getDate() + days); setDate(localDate(d)); };
  const nice = new Date(`${date}T12:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="tee-sheet">
      <Panel
        className="flex-1"
        title={<><Clock size={13} /> Tee Sheet</>}
        aside={
          <div className="flex gap-2">
            <button onClick={() => setModal({ mode: 'block', time: '' })} className="flex h-9 items-center gap-1.5 rounded-xl border border-red-400/40 bg-red-500/10 px-3 text-[10px] font-black uppercase tracking-widest text-red-200 active:scale-95">
              <Ban size={13} /> Block Times
            </button>
            <button onClick={() => setModal({ mode: 'reserve', time: '' })} className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-widest text-black shadow-[0_0_18px_rgba(16,185,129,0.35)] active:scale-95">
              <PhoneCall size={13} /> Add Phone Booking
            </button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => shift(-1)} aria-label="Previous day" className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><ChevronLeft size={14} /></button>
            <label className="relative flex min-w-[190px] cursor-pointer items-center justify-center gap-1.5 text-[12px] font-bold">
              <CalendarDays size={13} className="text-emerald-400" />{nice}
              <input type="date" aria-label="Tee sheet date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0 [color-scheme:dark]" />
            </label>
            <button onClick={() => shift(1)} aria-label="Next day" className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><ChevronRight size={14} /></button>
            {date !== today && <button onClick={() => setDate(today)} className="ml-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Today</button>}
          </div>
          <Stat label="Tee times" value={slots.length} />
          <Stat label="Reserved" value={reserved.length} tone="green" />
          <Stat label="Blocked" value={blocked.length} tone={blocked.length ? 'red' : undefined} />
          <Stat label="Available" value={slots.length - reserved.length - blocked.length} />
          <Stat label="Players" value={reserved.reduce((a, s) => a + (s.booking?.size ?? 0), 0)} />
          <span className="text-[10px] text-white/40">Course {fmtTime(courseHours.open)} – {fmtTime(courseHours.close)} · every {INTERVAL} min</span>
        </div>

        {upcoming.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Active and upcoming blocks">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Blocks</span>
            {upcoming.map((k) => {
              const Icon = REASON_ICON[k.reason];
              return (
                <button key={k.id} onClick={() => setViewBlock(k)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${STRIPE}`}>
                  <Icon size={11} className="text-red-300" /><b className="font-bold text-red-200">{k.reason}</b><span className="text-white/55">{blockLabel(k)}</span>
                </button>
              );
            })}
          </div>
        )}

        {closed && (
          <div role="status" className={`mb-3 flex items-center gap-3 rounded-2xl border px-4 py-3 ${STRIPE}`}>
            {(() => { const Icon = REASON_ICON[closed.reason]; return <Icon size={18} className="text-red-300" />; })()}
            <span className="flex flex-col">
              <span className="text-[12px] font-black uppercase tracking-widest text-red-200">Closed all day · {closed.reason}</span>
              <span className="text-[10px] text-white/55">{closed.note ? `${closed.note} · ` : ''}{blockLabel(closed)}</span>
            </span>
            <button onClick={() => setViewBlock(closed)} className="ml-auto text-[10px] font-bold uppercase tracking-widest text-red-200/80">Manage</button>
          </div>
        )}

        <div className="mb-2 flex gap-2">
          {(['all', 'available', 'reserved', 'blocked'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${filter === f ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/50'}`}>{f}</button>
          ))}
        </div>
        <div className="gap-x-4 @5xl:columns-2">
          {shown.map(({ time, booking: b, block: k }) => {
            const past = isPast(time);
            const Icon = k ? REASON_ICON[k.reason] : Ban;
            const label = b ? `reserved, ${b.name}, ${b.size} players${k ? `, inside block ${k.reason}` : ''}` : k ? `blocked, ${k.reason}${k.note ? `, ${k.note}` : ''}` : 'available';
            return (
              <button key={time} onClick={() => (b ? setViewing(b) : k ? setViewBlock(k) : !past && setModal({ mode: 'reserve', time }))} disabled={!b && !k && past}
                aria-label={`${fmtTime(time)} ${label}`}
                className={`mb-1 flex w-full break-inside-avoid items-center gap-3 rounded-xl border px-3 py-2 text-left text-[12px] ${past ? 'opacity-45' : ''} ${
                  k && !b ? STRIPE : b ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
                <span className="w-16 shrink-0 font-mono text-[11px] text-white/75">{fmtTime(time)}</span>
                {b ? (
                  <>
                    <span className="min-w-0 flex-1 truncate font-semibold text-white">{b.name}</span>
                    {k && <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-200"><Icon size={10} /> {k.reason}</span>}
                    <span className="flex gap-0.5" aria-hidden>{Array.from({ length: 4 }, (_, i) => <UserRound key={i} size={11} className={i < b.size ? 'text-emerald-300' : 'text-white/15'} />)}</span>
                    {b.holes && <span className="hidden text-[9px] text-white/45 @2xl:inline">{b.holes === '18' ? '18' : b.holes === 'front9' ? 'F9' : 'B9'} · {b.transport === 'walk' ? 'Walk' : 'Cart'}</span>}
                    <span className="w-14 text-right text-[9px] font-bold uppercase tracking-widest text-white/40">{b.source === 'phone' ? 'Phone' : b.source === 'walkup' ? 'Walk-up' : 'App'}</span>
                  </>
                ) : k ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Icon size={12} className="shrink-0 text-red-300" />
                    <span className="font-semibold text-red-200">{k.reason}</span>
                    {k.note && <span className="truncate text-white/55">· {k.note}</span>}
                  </span>
                ) : (
                  <span className="flex flex-1 items-center gap-1.5 text-white/35">{past ? 'Open' : <><Plus size={12} /> Available</>}</span>
                )}
              </button>
            );
          })}
        </div>
      </Panel>

      {modal && (
        <TeeModal interval={INTERVAL} date={date} mode={modal.mode} time={modal.time} times={times} slots={slots} isPast={isPast} bookings={bookings} editing={modal.editing}
          onClose={() => setModal(null)} onBook={(b) => { onBook(b); setModal(null); }}
          onBlock={(k) => { if (modal.editing) onEditBlock({ ...k, id: modal.editing.id }); else onBlock(k); setModal(null); }} />
      )}
      {viewing && (
        <Modal title="Reservation" onClose={() => setViewing(null)}>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[12px]">
            <dt className="text-white/45">Time</dt><dd className="font-mono">{fmtTime(viewing.time)} · {viewing.date}</dd>
            <dt className="text-white/45">Name</dt><dd className="font-semibold">{viewing.name}</dd>
            <dt className="text-white/45">Players</dt><dd>{viewing.size}</dd>
            <dt className="text-white/45">Phone</dt><dd><a className="font-mono hover:underline" href={`tel:${encodeURIComponent(viewing.phone)}`}>{viewing.phone}</a></dd>
            {viewing.email && <><dt className="text-white/45">Email</dt><dd>{viewing.email}</dd></>}
            <dt className="text-white/45">Source</dt><dd className="capitalize">{viewing.source}</dd>
            {viewing.note && <><dt className="text-white/45">Note</dt><dd>{viewing.note}</dd></>}
            {viewing.holes && <><dt className="text-white/45">Round</dt><dd>{HOLES_LABEL[viewing.holes]} · {viewing.transport === 'walk' ? 'Walking' : 'Riding (cart)'}</dd></>}
            {viewing.total != null && <><dt className="text-white/45">Quoted</dt><dd className="font-mono text-emerald-300">${viewing.total.toFixed(2)} · pay at check-in</dd></>}
          </dl>
          <button onClick={() => { onCancel(viewing.id); setViewing(null); }} className="mt-5 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-red-400/30 bg-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-300">
            <Trash2 size={13} /> Cancel reservation
          </button>
        </Modal>
      )}
      {viewBlock && (
        <Modal title={`Blocked · ${viewBlock.reason}`} onClose={() => setViewBlock(null)}>
          <div className={`mb-4 flex items-center gap-3 rounded-2xl border p-3 ${STRIPE}`}>
            {(() => { const Icon = REASON_ICON[viewBlock.reason]; return <Icon size={18} className="text-red-300" />; })()}
            <span className="flex flex-col text-[12px]">
              <b className="text-red-100">{viewBlock.reason}</b>
              <span className="text-white/60">{blockLabel(viewBlock)}</span>
              {viewBlock.note && <span className="text-white/50">{viewBlock.note}</span>}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setModal({ mode: 'block', time: viewBlock.from ?? '', editing: viewBlock }); setViewBlock(null); }} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-[10px] font-black uppercase tracking-widest text-amber-100">
              <Pencil size={13} /> Edit block
            </button>
            <button onClick={() => { onUnblock(viewBlock.id); setViewBlock(null); }} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 text-[10px] font-black uppercase tracking-widest text-white">
              <Trash2 size={13} /> Unblock
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-white/40">Changes can be undone from History.</p>
        </Modal>
      )}
    </div>
  );
}

type Scope = 'slot' | 'window' | 'range';

function TeeModal({ interval: INTERVAL, date, mode: initialMode, time: initialTime, times, slots, isPast, bookings, editing, onClose, onBook, onBlock }: {
  interval: number; date: string; mode: 'reserve' | 'block'; time: string; times: string[]; slots: Slot[]; isPast: (t: string) => boolean; bookings: TeeBooking[]; editing?: TeeBlock;
  onClose: () => void; onBook: (b: TeeBooking) => void; onBlock: (k: TeeBlock) => void;
}) {
  const open = slots.filter((s) => !s.booking && !s.block && !isPast(s.time)).map((s) => s.time);
  const [mode, setMode] = useState(initialMode);
  const [time, setTime] = useState(initialTime || open[0] || '');
  // reservation
  const [name, setName] = useState('');
  const [size, setSize] = useState(4);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<'phone' | 'walkup'>('phone');
  // block
  // Editing an existing block pre-fills everything (scope inferred from its shape).
  const [scope, setScope] = useState<Scope>(() => !editing ? 'slot' : editing.from == null ? 'range' : toMin(editing.to!) - toMin(editing.from) === INTERVAL ? 'slot' : 'window');
  const [reason, setReason] = useState<BlockReason | ''>(editing?.reason ?? '');
  const [from, setFrom] = useState(editing?.from ?? (initialTime || open[0] || times[0]));
  const [to, setTo] = useState(() => editing?.to ?? fromMin(toMin(initialTime || open[0] || times[0]) + 60));
  const [startDate, setStartDate] = useState(editing?.startDate ?? date);
  const [endDate, setEndDate] = useState(editing?.endDate ?? date);
  const [note, setNote] = useState(editing?.note ?? '');
  const [touched, setTouched] = useState(false);

  const day = editing && editing.from != null ? editing.startDate : date;
  const draft: TeeBlock = scope === 'range'
    ? { id: '', reason: reason as BlockReason, startDate, endDate }
    : { id: '', reason: reason as BlockReason, startDate: day, endDate: day, from: scope === 'slot' ? time : from, to: scope === 'slot' ? fromMin(toMin(time) + INTERVAL) : to };
  const bv = validateBlock(draft);
  const rv = validateBooking({ name, size, phone, email });
  const conflicts = bookings.filter((b) => blockFor([draft], b.date, b.time)).length;

  const save = () => {
    setTouched(true);
    if (mode === 'reserve') {
      if (!rv.ok || !time) return;
      onBook({ id: newId(), date, time, status: 'reserved', name, size, phone, email, source, note: note || undefined });
    } else {
      if (!bv.ok || (scope === 'slot' && !time)) return;
      onBlock({ ...draft, id: newId(), note: note || undefined });
    }
  };
  const err = (m?: string) => (touched && m ? <span className="text-[10px] text-rose-300">{m}</span> : null);
  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-white/50';

  return (
    <Modal title={editing ? 'Edit Block' : mode === 'reserve' ? 'Add Phone Booking' : 'Block Tee Times'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Booking type" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {([['reserve', 'Reservation', Phone], ['block', 'Block time', Ban]] as const).map(([id, label, Icon]) => (
            <button key={id} role="radio" aria-checked={mode === id} onClick={() => { setMode(id); setTouched(false); }} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest ${mode === id ? (id === 'block' ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300') : 'text-white/50'}`}><Icon size={12} />{label}</button>
          ))}
        </div>

        {mode === 'reserve' ? (
          <>
            <label className="flex flex-col gap-1"><span className={lbl}>Tee time</span>
              <select aria-label="Tee time" value={time} onChange={(e) => setTime(e.target.value)} className={field}>
                {!open.length && <option value="">No open times left</option>}
                {open.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className={lbl}>Player name</span>
              <input aria-label="Player name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pat Walker" className={field} />{err(rv.errors.name)}
            </label>
            <div className="flex flex-col gap-1">
              <span className={lbl}>Group size</span>
              <div role="radiogroup" aria-label="Group size" className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} role="radio" aria-checked={size === n} onClick={() => setSize(n)} className={`flex h-10 flex-1 items-center justify-center gap-1 rounded-xl border font-mono text-sm ${size === n ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/60'}`}><Users size={12} />{n}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className={lbl}>Phone</span>
                <input aria-label="Phone" type="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="(507) 555-0142" className={field} />{err(rv.errors.phone)}</label>
              <label className="flex flex-col gap-1"><span className={lbl}>Email (optional)</span>
                <input aria-label="Email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} className={field} />{err(rv.errors.email)}</label>
            </div>
            <div role="radiogroup" aria-label="Source" className="flex gap-2">
              {([['phone', 'Phone call'], ['walkup', 'Walk-up']] as const).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={source === id} onClick={() => setSource(id)} className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${source === id ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/50'}`}>{label}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1"><span className={lbl}>Block reason</span>
              <select aria-label="Block reason" value={reason} onChange={(e) => setReason(e.target.value as BlockReason)} className={field}>
                <option value="" disabled>Select a reason…</option>
                {BLOCK_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>{err(bv.errors.reason)}
            </label>
            <div role="radiogroup" aria-label="Block scope" className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
              {([['slot', 'This tee time', Clock], ['window', 'Time window', Clock], ['range', 'Date range', CalendarRange]] as const).map(([id, label, Icon]) => (
                <button key={id} role="radio" aria-checked={scope === id} onClick={() => setScope(id)} className={`flex items-center justify-center gap-1 rounded-lg py-2 text-[9px] font-bold uppercase tracking-widest ${scope === id ? 'bg-red-500/20 text-red-200' : 'text-white/50'}`}><Icon size={11} />{label}</button>
              ))}
            </div>
            {scope === 'slot' && (
              <label className="flex flex-col gap-1"><span className={lbl}>Tee time · {date}</span>
                <select aria-label="Tee time" value={time} onChange={(e) => setTime(e.target.value)} className={field}>
                  {times.filter((t) => !isPast(t)).map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
                </select>
              </label>
            )}
            {scope === 'window' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1"><span className={lbl}>From · {date}</span>
                  <select aria-label="Block from" value={from} onChange={(e) => setFrom(e.target.value)} className={field}>{times.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}</select></label>
                <label className="flex flex-col gap-1"><span className={lbl}>Until</span>
                  <select aria-label="Block until" value={to} onChange={(e) => setTo(e.target.value)} className={field}>{[...times.slice(1), fromMin(toMin(times[times.length - 1]) + INTERVAL)].map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}</select></label>
              </div>
            )}
            {scope === 'range' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1"><span className={lbl}>First day</span>
                  <input type="date" aria-label="Block start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${field} [color-scheme:dark]`} /></label>
                <label className="flex flex-col gap-1"><span className={lbl}>Last day</span>
                  <input type="date" aria-label="Block end date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={`${field} [color-scheme:dark]`} /></label>
                <span className="col-span-2 text-[10px] text-white/45">Every tee time on these days is blocked (all day).</span>
              </div>
            )}
            {err(bv.errors.dates ?? bv.errors.times)}
            {conflicts > 0 && <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">{conflicts} existing reservation{conflicts > 1 ? 's' : ''} fall inside this block. They stay on the sheet, flagged, so you can call them.</p>}
          </>
        )}
        <input aria-label="Note" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'block' ? 'Details (optional), e.g. Holes 4–6 aerification' : 'Note (optional)'} className={field} />
        <button onClick={save} disabled={mode === 'reserve' && !time} className={`h-12 rounded-2xl text-xs font-black uppercase tracking-[0.18em] disabled:opacity-40 ${mode === 'block' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-black'}`}>
          {editing ? 'Save block' : mode === 'block' ? 'Block tee times' : 'Save reservation'}
        </button>
      </div>
    </Modal>
  );
}
