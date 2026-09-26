import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, ChefHat, ChevronRight, Lock, MapPinOff, Radar, Settings2, ShieldCheck, Trophy, Truck, X, type LucideIcon } from 'lucide-react';
import { SOMERBY } from '../data/course';
import { useOps } from '../ops/useOps';
import { isOpenAt } from '../ops/model';
import { EVENTS } from '../tournaments/events';
import { useRole } from '../auth/RoleContext';
// Everyday clubhouse operations
import { TeeSheet } from './everyday/TeeSheet';
import { OpsSettingsView } from './everyday/OpsSettingsView';
// Tournament operations
import { EventCRM } from './tournament/EventCRM';
import { LiveRadar } from './tournament/LiveRadar';
import { useLiveEvent } from './tournament/useLiveEvent';
import { PaceAlerts, StartTournamentSwitch } from './tournament/TournamentControls';
// Shared
import { Queue } from './Queue';
import { glass, hhmm } from './ui';

type View = 'tee' | 'settings' | 'tournament';

const DEMO = !import.meta.env.VITE_SUPABASE_URL;

/**
 * Clubhouse OS — staff tablet (landscape). Reachable only with a staff session (PIN / Face ID);
 * in cloud mode every read and write is also gated by RLS (is_staff()).
 *
 * Two separate areas:
 *   • Clubhouse (everyday): Tee Sheet and Settings — the daily running of the course.
 *   • Tournament: the Pre-Event CRM, which becomes the Live Event Radar once staff flip
 *     "Start Tournament". No map or locations exist before that switch.
 */
export function ClubhouseOS() {
  const { lockStaff, staffName } = useRole();
  const [ops, dispatch] = useOps('staff');
  const s = ops.settings;
  const event = EVENTS[0];
  const [view, setView] = useState<View>(() => (s.tournamentLive ? 'tournament' : 'tee'));
  const [clock, setClock] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 5_000); return () => clearInterval(id); }, []);
  const live = useLiveEvent(ops, event.id, clock);
  const select = useCallback((id: string) => setSelected((x) => (x === id ? null : id)), []);
  const openOrders = ops.orders.filter((o) => o.status !== 'delivered').length;
  const kitchenOpen = isOpenAt(s.kitchenHours, clock);
  const tournament = view === 'tournament';

  return (
    <div className="@container relative flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-white" data-testid="clubhouse-os">
      <div className={`pointer-events-none absolute inset-0 transition-colors ${tournament ? 'bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,0.10),transparent_55%)]' : 'bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.10),transparent_55%)]'}`} />

      {/* ── Floating glass header (shared) ── */}
      <header className={`${glass} relative z-30 m-3 mb-0 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-2.5`}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/40"><ShieldCheck size={16} className="text-emerald-400" /></span>
          <div className="leading-tight">
            <div className="text-[11px] font-black tracking-[0.25em]">CLUBHOUSE OS</div>
            <div className="text-[10px] text-white/50">{SOMERBY.name} · {hhmm(clock)}</div>
          </div>
        </div>
        <Breadcrumb tournament={tournament} items={tournament ? ['Tournament', event.name, s.tournamentLive ? 'Live Radar' : 'Pre-Event CRM'] : ['Clubhouse', view === 'tee' ? 'Tee Sheet' : 'Settings']} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span role="status" className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${kitchenOpen ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
            <ChefHat size={11} /> Kitchen {kitchenOpen ? 'open' : 'closed'}
          </span>
          <button onClick={() => setQueueOpen(true)} className="relative flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80">
            <Truck size={12} /> Orders
            {openOrders > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-black">{openOrders}</span>}
          </button>
          <button onClick={lockStaff} className="flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80 active:scale-95">
            <Lock size={12} /> Lock{staffName ? ` · ${staffName}` : ''}
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 gap-3 p-3">
        {/* ── Left rail: two clearly separated areas ── */}
        <aside className="flex w-52 shrink-0 flex-col gap-3" aria-label="Clubhouse OS navigation">
          <section aria-label="Clubhouse operations" className={`${glass} rounded-2xl p-2`}>
            <SectionLabel dot="bg-emerald-400" title="Clubhouse" sub="Everyday operations" />
            <NavItem icon={CalendarClock} label="Tee Sheet" active={view === 'tee'} onClick={() => setView('tee')} tone="emerald" />
            <NavItem icon={Settings2} label="Settings" active={view === 'settings'} onClick={() => setView('settings')} tone="emerald" />
          </section>

          <section aria-label="Tournament operations" className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-2 backdrop-blur-2xl">
            <SectionLabel dot={s.tournamentLive ? 'bg-red-500 animate-pulse' : 'bg-amber-300'} title="Tournament" sub={event.name} />
            <NavItem icon={s.tournamentLive ? Radar : Trophy} label={s.tournamentLive ? 'Live Radar' : 'Pre-Event CRM'} active={tournament} onClick={() => setView('tournament')} tone="amber"
              badge={s.tournamentLive ? 'LIVE' : `${live.regs.length} teams`} />
            <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-2.5">
              <StartTournamentSwitch live={s.tournamentLive} onChange={(v) => { dispatch({ type: 'setting', patch: { tournamentLive: v } }); setView('tournament'); }} />
              <p className="mt-1.5 flex items-start gap-1 text-[9px] leading-snug text-white/45">
                {s.tournamentLive ? <>Tracking on the property only (+250 ft)</> : <><MapPinOff size={10} className="mt-px shrink-0" /> No map or locations before the start</>}
              </p>
            </div>
          </section>
        </aside>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto @4xl:overflow-hidden">
          {view === 'tee' && (
            <TeeSheet bookings={ops.teeSheet} blocks={ops.teeBlocks} courseHours={s.courseHours} now={clock}
              onBook={(b) => dispatch({ type: 'book', booking: b })} onCancel={(id) => dispatch({ type: 'unbook', id })}
              onBlock={(k) => dispatch({ type: 'block', block: k })} onUnblock={(id) => dispatch({ type: 'unblock', id })} />
          )}
          {view === 'settings' && <OpsSettingsView settings={s} now={clock} onChange={(patch) => dispatch({ type: 'setting', patch })} />}
          {tournament && (s.tournamentLive && s.liveSince ? (
            <LiveRadar holes={live.holes} placed={live.placed} alertMin={s.paceAlertMin} orders={ops.orders} now={live.now} liveSince={s.liveSince}
              selected={selected} onSelect={select} onStatus={(id, st) => dispatch({ type: 'status', id, status: st })}
              onFastForward={DEMO ? live.fastForward : undefined} />
          ) : (
            <EventCRM event={event} regs={live.regs}
              onSave={(id, p) => dispatch({ type: 'roster', id, ...p })}
              onMarkPaid={(id, amount) => dispatch({ type: 'pay', id, amount })} />
          ))}
          {s.tournamentLive && <PaceAlerts toasts={live.toasts} onDismiss={live.dismiss} onOpen={(g) => { setView('tournament'); setSelected(g); }} />}
        </main>
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
    </div>
  );
}

function SectionLabel({ dot, title, sub }: { dot: string; title: string; sub: string }) {
  return (
    <div className="mb-1.5 px-2 pt-1">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-white/85"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{title}</div>
      <div className="truncate text-[9px] text-white/40">{sub}</div>
    </div>
  );
}

function NavItem({ icon: Icon, label, active, onClick, tone, badge }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void; tone: 'emerald' | 'amber'; badge?: string }) {
  const on = tone === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/30';
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wider ${active ? on : 'text-white/60 hover:bg-white/5'}`}>
      <Icon size={14} /><span className="flex-1">{label}</span>
      {badge && <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${badge === 'LIVE' ? 'bg-red-500 text-white' : 'bg-white/10 text-white/60'}`}>{badge}</span>}
    </button>
  );
}

function Breadcrumb({ tournament, items }: { tournament: boolean; items: ReactNode[] }) {
  return (
    <nav aria-label="Location" className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${tournament ? 'bg-amber-300/10 text-amber-100' : 'bg-emerald-500/10 text-emerald-200'}`}>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">{i > 0 && <ChevronRight size={10} className="opacity-50" />}<span className={i === items.length - 1 ? '' : 'opacity-60'}>{it}</span></span>
      ))}
    </nav>
  );
}
