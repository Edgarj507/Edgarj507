import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Car, Check, ChevronLeft, Clock, Footprints, MapPin, Minus, Plus, Search, Shirt, Users, X } from 'lucide-react';
import { useOps, newId } from '../ops/useOps';
import { blockFor, dayBlock, fmtTime, isOpenAt, localDate, type TeeBooking } from '../ops/model';
import { bandFor, canCancel, HOLES_LABEL, quote, teeAt, teeTimes, type Holes, type Transport } from '../ops/teetimes';
import { VENUES, type Venue } from '../ops/venues';
import { normalizePhone } from '../lib/sms';
import { haptic } from '../lib/haptics';

type Step = 'course' | 'time' | 'configure' | 'done';
const card = 'rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl';
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00`); x.setDate(x.getDate() + n); return localDate(x); };
const dayLabel = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * Golfer tee-time booking: find a course → pick a day and an open tee time from the live
 * clubhouse tee sheet → choose holes, walking/riding and players → see the price and policies
 * the course published in its Clubhouse OS → reserve. Everything re-renders when the clubhouse
 * changes the tee sheet or its pricing.
 */
export function TeeTimeBooking({ golfer, onBack }: { golfer: { name: string; phone: string | null; email: string }; onBack: () => void }) {
  const [ops, dispatch] = useOps('player');
  const p = ops.pricing;
  const s = ops.settings;
  const today = localDate();
  const [tab, setTab] = useState<'book' | 'mine'>('book');
  const [step, setStep] = useState<Step>('course');
  const [q, setQ] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState<string | null>(null);
  const [holes, setHoles] = useState<Holes>('18');
  const [transport, setTransport] = useState<Transport>('ride');
  const [players, setPlayers] = useState(2);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [booked, setBooked] = useState<TeeBooking | null>(null);
  const phone = golfer.phone ? normalizePhone(golfer.phone) : null;

  const days = useMemo(() => Array.from({ length: p.bookingWindowDays + 1 }, (_, i) => addDays(today, i)), [today, p.bookingWindowDays]);
  const times = useMemo(() => teeTimes(s.courseHours, p.interval), [s.courseHours, p.interval]);
  const now = Date.now();
  const slots = times.map((t) => {
    const taken = ops.teeSheet.some((b) => b.date === date && b.time === t);
    const block = blockFor(ops.teeBlocks, date, t);
    return { time: t, past: teeAt(date, t) < now, taken, block };
  }).filter((x) => !x.past);
  const closed = dayBlock(ops.teeBlocks, date);
  const mine = ops.teeSheet.filter((b) => phone && b.phone === phone && teeAt(b.date, b.time) >= now).sort((a, b) => teeAt(a.date, a.time) - teeAt(b.date, b.time));
  const q4 = time ? quote(p, date, time, holes, transport, players) : null;

  // Real-time: a price change from the clubhouse while configuring is called out.
  const lastTotal = useRef<number | null>(null);
  const [repriced, setRepriced] = useState(false);
  useEffect(() => {
    if (step !== 'configure' || !q4) { lastTotal.current = null; return; }
    if (lastTotal.current != null && lastTotal.current !== q4.total) { setRepriced(true); haptic('warning'); }
    lastTotal.current = q4.total;
  }, [q4?.total, step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!p.walking && transport === 'walk') setTransport('ride'); }, [p.walking, transport]);
  // The slot was just booked / blocked by someone else.
  const slotGone = step === 'configure' && time && (ops.teeSheet.some((b) => b.date === date && b.time === time) || !!blockFor(ops.teeBlocks, date, time) || !times.includes(time));

  const reserve = () => {
    setErr(null);
    if (!phone) return setErr('Add a mobile number to your profile to book tee times.');
    if (!agree) { haptic('error'); return setErr('Please accept the course policies.'); }
    if (mine.length >= p.maxUpcoming) return setErr(`You can hold up to ${p.maxUpcoming} upcoming tee times.`);
    const b: TeeBooking = { id: newId(), date, time: time!, status: 'reserved', name: golfer.name, size: players, phone, email: golfer.email, source: 'app', holes, transport };
    dispatch({ type: 'reserve', booking: b });
    const saved = JSON.parse(localStorage.getItem('eg.ops.v1') ?? '{}').teeSheet?.find((x: TeeBooking) => x.id === b.id) as TeeBooking | undefined;
    if (!saved) { haptic('error'); return setErr('That tee time is no longer available. Pick another.'); }
    haptic('success');
    setBooked(saved);
    setStep('done');
  };
  const back = () => {
    if (tab === 'mine' || step === 'course') return onBack();
    setErr(null);
    setStep(step === 'configure' ? 'time' : step === 'time' ? 'course' : 'course');
  };

  const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string, boolean?][]; onChange: (v: T) => void; label: string }) => (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
      {options.map(([id, t, disabled]) => (
        <button key={id} role="radio" aria-checked={value === id} disabled={disabled} onClick={() => onChange(id)}
          className={`flex-1 rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 ${value === id ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/55'}`}>{t}</button>
      ))}
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col p-5" data-testid="tee-booking">
      <div className="z-10 mb-4 flex items-center gap-3">
        <button onClick={back} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md"><ChevronLeft size={16} /></button>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white">{tab === 'mine' ? 'My Tee Times' : step === 'course' ? 'Book a Tee Time' : step === 'time' ? venue?.name : step === 'configure' ? 'Your Round' : 'Booked'}</h2>
      </div>
      {step === 'course' && (
        <div role="tablist" className="z-10 mb-3 flex rounded-xl border border-white/10 bg-black/40 p-1 backdrop-blur-md">
          {([['book', 'Book'], ['mine', `My Tee Times${mine.length ? ` · ${mine.length}` : ''}`]] as const).map(([id, l]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-lg py-2 text-[10px] font-bold uppercase tracking-wide ${tab === id ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-400' : 'border border-transparent text-white/50'}`}>{l}</button>
          ))}
        </div>
      )}

      <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-28">
        {tab === 'mine' && (
          <div className="flex flex-col gap-2">
            {mine.map((b) => {
              const cancellable = canCancel(p, b.date, b.time, now);
              return (
                <div key={b.id} className={card} aria-label={`Tee time ${dayLabel(b.date)} ${fmtTime(b.time)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-black text-white">{dayLabel(b.date)} · {fmtTime(b.time)}</div>
                      <div className="text-[11px] text-white/60">Somerby Golf Club · {b.holes ? HOLES_LABEL[b.holes] : '18 holes'} · {b.transport === 'walk' ? 'Walking' : 'Riding'} · {b.size} player{b.size > 1 ? 's' : ''}</div>
                    </div>
                    {b.total != null && <span className="font-mono text-sm font-bold text-emerald-300">${b.total.toFixed(2)}</span>}
                  </div>
                  {b.source === 'app' && (cancellable ? (
                    <button onClick={() => { dispatch({ type: 'cancelTee', id: b.id, phone: phone! }); haptic('warning'); }} className="mt-3 h-10 w-full rounded-xl border border-red-400/30 bg-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-300">Cancel reservation</button>
                  ) : <p className="mt-2 text-[11px] text-amber-200">Inside the {p.cancelHours}-hour cancellation window — call the pro shop to change it.</p>)}
                </div>
              );
            })}
            {!mine.length && <p className="py-10 text-center text-[12px] text-white/45">No upcoming tee times.</p>}
          </div>
        )}

        {tab === 'book' && step === 'course' && (
          <div className="flex flex-col gap-2">
            <label className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input aria-label="Search courses" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-9 pr-3 text-sm text-white placeholder-white/30 focus:outline-none" /></label>
            {VENUES.filter((v) => `${v.name} ${v.location}`.toLowerCase().includes(q.trim().toLowerCase())).map((v) => {
              const openNow = v.onPlatform && isOpenAt(s.courseHours, now);
              const from = v.onPlatform ? Math.min(...p.bands.map((b) => b.weekday9)) : null;
              return (
                <button key={v.id} disabled={!v.onPlatform} onClick={() => { setVenue(v); setStep('time'); setTime(null); }} aria-label={v.name}
                  className={`${card} text-left disabled:opacity-60`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-black text-white">{v.name}</div>
                      <div className="flex items-center gap-1 text-[11px] text-white/55"><MapPin size={11} /> {v.location}</div>
                    </div>
                    {v.onPlatform
                      ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${openNow ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/50'}`}>{openNow ? 'Open now' : 'Closed now'}</span>
                      : <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/50">Call to book</span>}
                  </div>
                  {v.onPlatform ? (
                    <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-white/65">
                      <span className="flex items-center gap-1"><Clock size={11} /> Daily {fmtTime(s.courseHours.open)} – {fmtTime(s.courseHours.close)}</span>
                      <span>From ${from} · book {p.bookingWindowDays} days ahead</span>
                    </div>
                  ) : <p className="mt-2 text-[11px] text-white/45">Online tee times aren’t available for this course yet.</p>}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'book' && step === 'time' && venue && (
          <div className="flex flex-col gap-3">
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="listbox" aria-label="Day">
              {days.map((d) => (
                <button key={d} role="option" aria-selected={d === date} onClick={() => { setDate(d); setTime(null); }}
                  className={`shrink-0 rounded-2xl border px-3 py-2 text-center ${d === date ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-black/40 text-white/70'}`}>
                  <div className="text-[9px] font-bold uppercase tracking-widest">{d === today ? 'Today' : new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="font-mono text-sm">{new Date(`${d}T12:00`).getDate()}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/55"><CalendarDays size={12} /> {dayLabel(date)} · Open {fmtTime(s.courseHours.open)} – {fmtTime(s.courseHours.close)}</div>
            {closed ? (
              <p role="status" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-center text-[12px] text-red-200">Course closed · {closed.reason}</p>
            ) : (
              <ul className="grid grid-cols-3 gap-1.5" aria-label="Tee times">
                {slots.map((x) => {
                  const open = !x.taken && !x.block;
                  const band = bandFor(p, x.time);
                  const each = quote(p, date, x.time, '18', p.walking ? 'walk' : 'ride', 1).greenEach;
                  return (
                    <li key={x.time}>
                      <button disabled={!open} onClick={() => { setTime(x.time); setStep('configure'); setAgree(false); setErr(null); setRepriced(false); }}
                        aria-label={`${fmtTime(x.time)} ${open ? `available from $${each}` : x.block ? `blocked ${x.block.reason}` : 'booked'}`}
                        className={`flex w-full flex-col items-center rounded-xl border py-2 ${open ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-white' : 'border-white/5 bg-white/[0.02] text-white/30'}`}>
                        <span className="font-mono text-[12px] font-semibold">{fmtTime(x.time)}</span>
                        <span className="text-[9px]">{open ? `$${each} · ${band.label}` : x.block ? x.block.reason : 'Booked'}</span>
                      </button>
                    </li>
                  );
                })}
                {!slots.length && <li className="col-span-3 py-6 text-center text-[12px] text-white/45">No more tee times today.</li>}
              </ul>
            )}
          </div>
        )}

        {tab === 'book' && step === 'configure' && time && q4 && (
          <div className="flex flex-col gap-3">
            <div className={card}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">{venue?.name}</div>
              <div className="text-lg font-black text-white">{dayLabel(date)} · {fmtTime(time)}</div>
              <div className="text-[11px] text-white/55">{q4.band.label} · {q4.weekend ? 'Weekend' : 'Weekday'} rate</div>
            </div>
            {slotGone && <p role="alert" className="flex items-center gap-1.5 rounded-xl border border-red-400/30 bg-red-500/10 p-2 text-[11px] text-red-200"><AlertTriangle size={13} /> This tee time was just taken. Please pick another.</p>}
            <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Holes</span>
              <Seg label="Holes" value={holes} onChange={setHoles} options={[['18', '18 holes'], ['front9', '9 · Front'], ['back9', '9 · Back']]} /></div>
            <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Transport</span>
              <Seg label="Transport" value={transport} onChange={setTransport} options={[['walk', 'Walking', !p.walking], ['ride', 'Riding (cart)']]} />
              {!p.walking && <span className="text-[10px] text-white/45">Carts are required at this course.</span>}</div>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-white/70"><Users size={13} /> Players</span>
              <span className="flex items-center gap-3" role="group" aria-label="Players">
                <button aria-label="Fewer players" disabled={players <= 1} onClick={() => setPlayers((n) => n - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 disabled:opacity-30"><Minus size={13} /></button>
                <span className="w-4 text-center font-mono text-lg text-white" aria-live="polite">{players}</span>
                <button aria-label="More players" disabled={players >= 4} onClick={() => setPlayers((n) => n + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 disabled:opacity-30"><Plus size={13} /></button>
              </span>
            </div>

            <section aria-label="Price" className={card}>
              {repriced && <p role="status" className="mb-2 rounded-lg bg-amber-300/15 px-2 py-1 text-[11px] text-amber-100">The course just updated its prices — total refreshed.</p>}
              <ul className="flex flex-col gap-1 text-[12px]">
                {q4.lines.map((l) => <li key={l.label} className="flex justify-between gap-2 text-white/75"><span>{l.label}</span><span className="font-mono">${l.amount.toFixed(2)}</span></li>)}
              </ul>
              {transport === 'ride' && <p className="mt-1 text-[10px] text-white/45">Cart fee is charged {p.cart.mode === 'per-golfer' ? 'per golfer' : 'once per reservation'}.</p>}
              <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-mono text-sm"><span className="text-white/60">Total · pay at check-in</span><span className="font-bold text-emerald-400" data-testid="quote-total">${q4.total.toFixed(2)}</span></div>
            </section>

            <section aria-label="Course policies" className={`${card} flex flex-col gap-2 text-[11px] text-white/70`}>
              <div><b className="flex items-center gap-1 text-white"><X size={11} /> Cancellation</b>{p.policies.cancellation}</div>
              <div><b className="flex items-center gap-1 text-white"><Footprints size={11} /> Course rules</b>{p.policies.rules}</div>
              <div><b className="flex items-center gap-1 text-white"><Shirt size={11} /> Dress code</b>{p.policies.dressCode}</div>
              <label className="mt-1 flex items-start gap-2 text-[12px] text-white/85">
                <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(null); }} className="mt-0.5 accent-emerald-500" />
                I agree to the course’s cancellation policy, rules and dress code.
              </label>
            </section>
            {err && <p role="alert" className="text-center text-[11px] text-rose-300">{err}</p>}
          </div>
        )}

        {step === 'done' && booked && (
          <div className="flex flex-col items-center gap-3 pt-6 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-400/60"><Check size={30} className="text-emerald-400" strokeWidth={3} /></span>
            <div className="text-lg font-black text-white">Tee time booked</div>
            <div className="text-[13px] text-white/75">{dayLabel(booked.date)} · {fmtTime(booked.time)} · {venue?.name}</div>
            <div className="text-[12px] text-white/60">{HOLES_LABEL[booked.holes ?? '18']} · {booked.transport === 'walk' ? 'Walking' : 'Riding'} · {booked.size} player{booked.size > 1 ? 's' : ''}</div>
            <div className="font-mono text-xl font-bold text-emerald-400">${booked.total?.toFixed(2)}</div>
            <p className="text-[11px] text-white/45">Free cancellation until {p.cancelHours} hours before · manage it in My Tee Times.</p>
          </div>
        )}
      </div>

      {tab === 'book' && step === 'configure' && q4 && (
        <div className="absolute inset-x-5 bottom-6 z-20">
          <div className="rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-xl">
            <button disabled={!!slotGone} onClick={reserve} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-xs font-black uppercase tracking-widest text-black disabled:opacity-40">
              {transport === 'ride' ? <Car size={14} /> : <Footprints size={14} />} Reserve · ${q4.total.toFixed(2)}
            </button>
          </div>
        </div>
      )}
      {step === 'done' && (
        <div className="absolute inset-x-5 bottom-6 z-20">
          <button onClick={() => { setStep('course'); setTab('mine'); }} className="w-full rounded-2xl border border-white/10 bg-white/10 py-3.5 text-xs font-bold uppercase tracking-widest text-white">My Tee Times</button>
        </div>
      )}
    </div>
  );
}
