import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, ChefHat, Lock, Radar, Settings2, ShieldCheck, Trophy, Truck, X } from 'lucide-react';
import { SOMERBY } from '../data/course';
import { useOps } from '../ops/useOps';
import { eventGroups, placeGroups } from '../ops/pace';
import { isOpenAt, POSITION_TTL_MS } from '../ops/model';
import { normalizePhone } from '../lib/sms';
import { EVENTS } from '../tournaments/events';
import { useRole } from '../auth/RoleContext';
import { EventCRM } from './EventCRM';
import { LiveRadar } from './LiveRadar';
import { TeeSheet } from './TeeSheet';
import { OpsSettingsView } from './OpsSettingsView';
import { Queue } from './Queue';
import { glass, hhmm, Modal } from './ui';

type View = 'event' | 'tee' | 'settings';
interface Toast { id: string; group: string; text: string }

const DEMO = !import.meta.env.VITE_SUPABASE_URL;

/**
 * Clubhouse OS — staff tablet (landscape). Reachable only with a staff session (PIN / Face ID);
 * in cloud mode every read and write is also gated by RLS (is_staff()).
 *
 * Two event phases: the Pre-Tournament CRM (no map, no locations) and, once staff flip
 * "Start Tournament", the Live Event Radar. The radar and pace alerts exist only while live.
 */
export function ClubhouseOS() {
  const { lockStaff, staffName } = useRole();
  const [ops, dispatch] = useOps('staff');
  const s = ops.settings;
  const event = EVENTS[0];
  const [view, setView] = useState<View>('event');
  const [clock, setClock] = useState(() => Date.now());
  const [simOffset, setSimOffset] = useState(0); // demo: fast-forward simulated positions
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'start' | 'end' | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const alerted = useRef(new Set<string>());

  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 5_000); return () => clearInterval(id); }, []);
  const now = clock + simOffset;

  const regs = ops.registrations.filter((r) => r.eventId === event.id);
  const holes = SOMERBY.data.holes;

  // ── Live phase only: pace + positions. Nothing is computed or shown before the start. ──
  const placed = useMemo(() => {
    if (!s.tournamentLive || !s.liveSince) return [];
    const groups = eventGroups(regs, s.liveSince, s.paceMinPerHole);
    const fresh = ops.positions.filter((p) => clock - p.at < POSITION_TTL_MS);
    return placeGroups(groups, holes.map((h) => h.path), now, s.paceMinPerHole).map((g) => {
      // A real on-property GPS fix from anyone in the group replaces the simulated dot.
      const reg = regs.find((r) => r.id === g.group.id);
      const phones = reg ? [reg.captain, ...reg.roster].map((c) => normalizePhone(c.phone)).filter(Boolean) : [];
      const fix = fresh.find((p) => phones.includes(p.phone));
      return fix ? { ...g, at: [fix.lat, fix.lng] as [number, number], gps: true } : { ...g, gps: false };
    });
  }, [s.tournamentLive, s.liveSince, s.paceMinPerHole, regs, ops.positions, holes, now, clock]);

  // Global pace alerts: one toast when a group crosses the staff-defined limit.
  useEffect(() => {
    if (!s.tournamentLive) { alerted.current.clear(); setToasts([]); return; }
    const fresh: Toast[] = [];
    for (const g of placed) {
      const late = g.started && !g.finished && g.behindMin > s.paceAlertMin;
      if (late && !alerted.current.has(g.group.id)) {
        alerted.current.add(g.group.id);
        fresh.push({ id: `${g.group.id}-${now}`, group: g.group.id, text: `${g.group.name} is +${g.behindMin} mins behind pace on Hole ${g.hole}` });
      } else if (!late) alerted.current.delete(g.group.id);
    }
    if (fresh.length) setToasts((t) => [...fresh, ...t].slice(0, 5));
  }, [placed, s.tournamentLive, s.paceAlertMin, now]);
  useEffect(() => {
    if (!toasts.length) return;
    const id = setTimeout(() => setToasts((t) => t.slice(0, -1)), 12_000);
    return () => clearTimeout(id);
  }, [toasts]);

  const setLive = (live: boolean) => {
    dispatch({ type: 'setting', patch: { tournamentLive: live } });
    setSimOffset(0);
    setConfirm(null);
    setView('event');
  };
  const select = useCallback((id: string) => setSelected((x) => (x === id ? null : id)), []);
  const openOrders = ops.orders.filter((o) => o.status !== 'delivered').length;
  const kitchenOpen = isOpenAt(s.kitchenHours, clock);

  const nav: [View, string, typeof Radar][] = [
    ['event', s.tournamentLive ? 'Live Radar' : 'Pre-Tournament CRM', s.tournamentLive ? Radar : Trophy],
    ['tee', 'Tee Sheet', CalendarClock],
    ['settings', 'Settings', Settings2],
  ];

  return (
    <div className="@container relative flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-white" data-testid="clubhouse-os">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.10),transparent_55%)]" />

      {/* ── Floating glass header ── */}
      <header className={`${glass} relative z-30 m-3 mb-0 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-2.5`}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/40"><ShieldCheck size={16} className="text-emerald-400" /></span>
          <div className="leading-tight">
            <div className="text-[11px] font-black tracking-[0.25em]">CLUBHOUSE OS</div>
            <div className="text-[10px] text-white/50">{SOMERBY.name} · {hhmm(clock)}</div>
          </div>
        </div>
        <nav role="tablist" aria-label="Clubhouse views" className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {nav.map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${view === id ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/55 hover:text-white/80'}`}>
              <Icon size={12} />{label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span role="status" className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${kitchenOpen ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
            <ChefHat size={11} /> Kitchen {kitchenOpen ? 'open' : 'closed'}
          </span>
          <button onClick={() => setQueueOpen(true)} className="relative flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80">
            <Truck size={12} /> Orders
            {openOrders > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-black">{openOrders}</span>}
          </button>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 py-1 pl-3 pr-1">
            <span className={`text-[10px] font-black uppercase tracking-widest ${s.tournamentLive ? 'text-red-300' : 'text-white/70'}`}>
              {s.tournamentLive ? <span className="flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />Live</span> : 'Start Tournament'}
            </span>
            <button role="switch" aria-checked={s.tournamentLive} aria-label="Start Tournament" onClick={() => setConfirm(s.tournamentLive ? 'end' : 'start')}
              className={`relative h-6 w-11 rounded-full transition-colors ${s.tournamentLive ? 'bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.55)]' : 'bg-white/15'}`}>
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${s.tournamentLive ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <button onClick={lockStaff} className="flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80 active:scale-95">
            <Lock size={12} /> Lock{staffName ? ` · ${staffName}` : ''}
          </button>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto p-3 @4xl:overflow-hidden">
        {view === 'event' && (s.tournamentLive && s.liveSince ? (
          <LiveRadar holes={holes} placed={placed} alertMin={s.paceAlertMin} orders={ops.orders} now={now} liveSince={s.liveSince}
            selected={selected} onSelect={select} onStatus={(id, st) => dispatch({ type: 'status', id, status: st })}
            onFastForward={DEMO ? () => setSimOffset((o) => o + 15 * 60_000) : undefined} />
        ) : (
          <EventCRM event={event} regs={regs}
            onSave={(id, p) => dispatch({ type: 'roster', id, ...p })}
            onMarkPaid={(id, amount) => dispatch({ type: 'pay', id, amount })} />
        ))}
        {view === 'tee' && (
          <TeeSheet bookings={ops.teeSheet} courseHours={s.courseHours} now={clock}
            onBook={(b) => dispatch({ type: 'book', booking: b })} onCancel={(id) => dispatch({ type: 'unbook', id })} />
        )}
        {view === 'settings' && <OpsSettingsView settings={s} now={clock} onChange={(patch) => dispatch({ type: 'setting', patch })} />}
      </main>

      {/* ── Global pace alerts ── */}
      <div className="pointer-events-none absolute left-6 top-[10.5rem] z-40 flex w-[360px] max-w-[calc(100%-3rem)] flex-col gap-2" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} role="alert" className="pointer-events-auto flex items-start gap-2.5 rounded-2xl border border-red-400/40 bg-red-950/70 p-3 shadow-[0_0_30px_rgba(239,68,68,0.35)] backdrop-blur-2xl">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
            <button onClick={() => { setView('event'); setSelected(t.group); }} className="flex-1 text-left text-[12px] font-semibold leading-snug text-red-50">{t.text}</button>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss alert" className="text-red-200/60"><X size={14} /></button>
          </div>
        ))}
      </div>

      {queueOpen && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/40" onClick={() => setQueueOpen(false)}>
          <aside onClick={(e) => e.stopPropagation()} aria-label="Orders" className={`${glass} m-3 flex w-full max-w-md flex-col rounded-3xl bg-zinc-950/85 p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]"><Truck size={13} /> Fulfillment Queue</h2>
              <button onClick={() => setQueueOpen(false)} aria-label="Close orders" className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><X size={14} /></button>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto"><Queue orders={ops.orders} now={clock} onStatus={(id, st) => dispatch({ type: 'status', id, status: st })} /></div>
          </aside>
        </div>
      )}

      {confirm && (
        <Modal title={confirm === 'start' ? 'Start the tournament?' : 'End the tournament?'} onClose={() => setConfirm(null)}>
          {confirm === 'start' ? (
            <ul className="mb-5 flex flex-col gap-2 text-[12px] leading-snug text-white/75">
              <li>• The Pre-Tournament CRM switches to the <b className="text-white">Live Event Radar</b>.</li>
              <li>• Registered players’ phones start sharing location, <b className="text-white">only while on the property</b> (course boundary + 250 ft). Off-property phones send nothing.</li>
              <li>• Captains can no longer edit rosters.</li>
            </ul>
          ) : (
            <p className="mb-5 text-[12px] leading-snug text-white/75">Location sharing stops on every phone and all stored positions are deleted. The CRM comes back.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirm(null)} className="h-11 rounded-2xl border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/70">Cancel</button>
            <button onClick={() => setLive(confirm === 'start')} className={`h-11 rounded-2xl text-[10px] font-black uppercase tracking-widest ${confirm === 'start' ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
              {confirm === 'start' ? 'Go live' : 'End tournament'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
