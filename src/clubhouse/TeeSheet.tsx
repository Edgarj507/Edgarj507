import { useMemo, useState } from 'react';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Clock, Phone, PhoneCall, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { fmtTime, fromMin, localDate, toMin, validateBooking, type Hours, type TeeBooking } from '../ops/model';
import { newId } from '../ops/useOps';
import { field, Modal, Panel, Stat } from './ui';

const INTERVAL = 10; // minutes between tee times

type Slot = { time: string; booking?: TeeBooking };
type Filter = 'all' | 'available' | 'reserved' | 'blocked';

interface Props {
  bookings: TeeBooking[];
  courseHours: Hours;
  onBook: (b: TeeBooking) => void;
  onCancel: (id: string) => void;
  now: number;
}

/** Full-screen tee sheet (no map): every interval between course open and close for a day. */
export function TeeSheet({ bookings, courseHours, onBook, onCancel, now }: Props) {
  const [date, setDate] = useState(() => localDate(now));
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState<string | null>(null); // preselected time, '' = none
  const [viewing, setViewing] = useState<TeeBooking | null>(null);

  const slots: Slot[] = useMemo(() => {
    const open = toMin(courseHours.open), close = toMin(courseHours.close);
    const end = close > open ? close : close + 1440;
    const byTime = new Map(bookings.filter((b) => b.date === date).map((b) => [b.time, b]));
    const out: Slot[] = [];
    for (let m = open; m < end; m += INTERVAL) out.push({ time: fromMin(m), booking: byTime.get(fromMin(m)) });
    return out;
  }, [bookings, date, courseHours]);

  const today = localDate(now);
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const isPast = (t: string) => date < today || (date === today && toMin(t) < nowMin);
  const reserved = slots.filter((s) => s.booking?.status === 'reserved');
  const blocked = slots.filter((s) => s.booking?.status === 'blocked');
  const shown = slots.filter((s) => filter === 'all' || (filter === 'available' ? !s.booking : s.booking?.status === filter));
  const shift = (days: number) => { const d = new Date(`${date}T12:00`); d.setDate(d.getDate() + days); setDate(localDate(d)); };
  const nice = new Date(`${date}T12:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="tee-sheet">
      <Panel
        className="flex-1"
        title={<><Clock size={13} /> Tee Sheet</>}
        aside={
          <button onClick={() => setAdding('')} className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-widest text-black shadow-[0_0_18px_rgba(16,185,129,0.35)] active:scale-95">
            <PhoneCall size={13} /> Add Phone Booking
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => shift(-1)} aria-label="Previous day" className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><ChevronLeft size={14} /></button>
            <span className="flex min-w-[170px] items-center justify-center gap-1.5 text-[12px] font-bold"><CalendarDays size={13} className="text-emerald-400" />{nice}</span>
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
        <div className="mb-2 flex gap-2">
          {(['all', 'available', 'reserved', 'blocked'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${filter === f ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/50'}`}>{f}</button>
          ))}
        </div>
        <div className="gap-x-4 @5xl:columns-2">
          {shown.map(({ time, booking: b }) => {
            const past = isPast(time);
            return (
              <button key={time} onClick={() => (b ? setViewing(b) : !past && setAdding(time))} disabled={!b && past}
                aria-label={`${fmtTime(time)} ${b ? (b.status === 'blocked' ? `blocked, ${b.name}` : `reserved, ${b.name}, ${b.size} players`) : 'available'}`}
                className={`mb-1 flex w-full break-inside-avoid items-center gap-3 rounded-xl border px-3 py-2 text-left text-[12px] ${past ? 'opacity-45' : ''} ${
                  b?.status === 'blocked' ? 'border-red-400/20 bg-[repeating-linear-gradient(135deg,rgba(239,68,68,0.10)_0_6px,transparent_6px_12px)]'
                    : b ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
                <span className="w-16 shrink-0 font-mono text-[11px] text-white/75">{fmtTime(time)}</span>
                {b?.status === 'reserved' ? (
                  <>
                    <span className="min-w-0 flex-1 truncate font-semibold text-white">{b.name}</span>
                    <span className="flex gap-0.5" aria-hidden>{Array.from({ length: 4 }, (_, i) => <UserRound key={i} size={11} className={i < b.size ? 'text-emerald-300' : 'text-white/15'} />)}</span>
                    <span className="w-14 text-right text-[9px] font-bold uppercase tracking-widest text-white/40">{b.source === 'phone' ? 'Phone' : b.source === 'walkup' ? 'Walk-up' : 'App'}</span>
                  </>
                ) : b ? (
                  <span className="flex flex-1 items-center gap-1.5 font-semibold text-red-300"><Ban size={12} /> Blocked · <span className="font-normal text-white/60">{b.name}</span></span>
                ) : (
                  <span className="flex flex-1 items-center gap-1.5 text-white/35">{past ? 'Open' : <><Plus size={12} /> Available</>}</span>
                )}
              </button>
            );
          })}
        </div>
      </Panel>

      {adding !== null && (
        <BookingModal date={date} slots={slots.filter((s) => !s.booking && !isPast(s.time)).map((s) => s.time)} initial={adding}
          onClose={() => setAdding(null)} onSave={(b) => { onBook(b); setAdding(null); }} />
      )}
      {viewing && (
        <Modal title={viewing.status === 'blocked' ? 'Blocked tee time' : 'Reservation'} onClose={() => setViewing(null)}>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[12px]">
            <dt className="text-white/45">Time</dt><dd className="font-mono">{fmtTime(viewing.time)} · {viewing.date}</dd>
            <dt className="text-white/45">{viewing.status === 'blocked' ? 'Reason' : 'Name'}</dt><dd className="font-semibold">{viewing.name}</dd>
            {viewing.status === 'reserved' && <><dt className="text-white/45">Players</dt><dd>{viewing.size}</dd>
              <dt className="text-white/45">Phone</dt><dd><a className="font-mono hover:underline" href={`tel:${viewing.phone}`}>{viewing.phone}</a></dd>
              {viewing.email && <><dt className="text-white/45">Email</dt><dd>{viewing.email}</dd></>}
              <dt className="text-white/45">Source</dt><dd className="capitalize">{viewing.source}</dd></>}
            {viewing.note && <><dt className="text-white/45">Note</dt><dd>{viewing.note}</dd></>}
          </dl>
          <button onClick={() => { onCancel(viewing.id); setViewing(null); }} className="mt-5 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-red-400/30 bg-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-300">
            <Trash2 size={13} /> {viewing.status === 'blocked' ? 'Release time' : 'Cancel reservation'}
          </button>
        </Modal>
      )}
    </div>
  );
}

function BookingModal({ date, slots, initial, onClose, onSave }: { date: string; slots: string[]; initial: string; onClose: () => void; onSave: (b: TeeBooking) => void }) {
  const [kind, setKind] = useState<'reserved' | 'blocked'>('reserved');
  const [time, setTime] = useState(initial || slots[0] || '');
  const [name, setName] = useState('');
  const [size, setSize] = useState(4);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<'phone' | 'walkup'>('phone');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const v = validateBooking({ status: kind, name, size, phone, email });

  const save = () => {
    setTouched(true);
    if (!v.ok || !time) return;
    onSave({ id: newId(), date, time, status: kind, name, size: kind === 'blocked' ? 0 : size, phone: kind === 'blocked' ? '' : phone, email: kind === 'blocked' ? '' : email, source: kind === 'blocked' ? 'staff' : source, note: note || undefined });
  };
  const err = (k: keyof typeof v.errors) => touched && v.errors[k] ? <span className="text-[10px] text-rose-300">{v.errors[k]}</span> : null;

  return (
    <Modal title="Add Phone Booking" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Booking type" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {([['reserved', 'Reservation', Phone], ['blocked', 'Block time', Ban]] as const).map(([id, label, Icon]) => (
            <button key={id} role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest ${kind === id ? (id === 'blocked' ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300') : 'text-white/50'}`}><Icon size={12} />{label}</button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Tee time</span>
          <select aria-label="Tee time" value={time} onChange={(e) => setTime(e.target.value)} className={field}>
            {!slots.length && <option value="">No open times left</option>}
            {slots.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{kind === 'blocked' ? 'Reason' : 'Player name'}</span>
          <input aria-label={kind === 'blocked' ? 'Reason' : 'Player name'} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={kind === 'blocked' ? 'e.g. Maintenance, league, outing' : 'e.g. Pat Walker'} className={field} />
          {err('name')}
        </label>
        {kind === 'reserved' && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Group size</span>
              <div role="radiogroup" aria-label="Group size" className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} role="radio" aria-checked={size === n} onClick={() => setSize(n)} className={`flex h-10 flex-1 items-center justify-center gap-1 rounded-xl border font-mono text-sm ${size === n ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/60'}`}><Users size={12} />{n}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Phone</span>
                <input aria-label="Phone" type="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="(507) 555-0142" className={field} />{err('phone')}</label>
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Email (optional)</span>
                <input aria-label="Email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} className={field} />{err('email')}</label>
            </div>
            <div role="radiogroup" aria-label="Source" className="flex gap-2">
              {([['phone', 'Phone call'], ['walkup', 'Walk-up']] as const).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={source === id} onClick={() => setSource(id)} className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${source === id ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-white/50'}`}>{label}</button>
              ))}
            </div>
          </>
        )}
        <input aria-label="Note" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={field} />
        <button onClick={save} disabled={!time} className={`h-12 rounded-2xl text-xs font-black uppercase tracking-[0.18em] disabled:opacity-40 ${kind === 'blocked' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-black'}`}>
          {kind === 'blocked' ? 'Block tee time' : 'Save reservation'}
        </button>
      </div>
    </Modal>
  );
}
