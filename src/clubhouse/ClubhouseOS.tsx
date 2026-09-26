import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import { Bug, CalendarClock, Car, ChefHat, CloudLightning, Megaphone, MessageSquareText, Package, PhoneIncoming, ChevronRight, CircleHelp, History, LayoutDashboard, LifeBuoy, Lock, MapPinOff, Radar, Receipt, RotateCcw, Settings2, ShieldCheck, Trophy, Truck, X, type LucideIcon } from 'lucide-react';
import { SOMERBY } from '../data/course';
import { useOps } from '../ops/useOps';
import { charityOpen, isOpenAt, isOpenOrder } from '../ops/model';
import { EVENTS } from '../tournaments/events';
import { holePoint } from '../ops/carts';
import { threadKey, type BroadcastKind } from '../ops/comms';
import { newId } from '../ops/useOps';
import { venueById } from '../ops/venues';
import { useRole } from '../auth/RoleContext';
// Everyday clubhouse operations
import { TeeSheet } from './everyday/TeeSheet';
import { OpsSettingsView } from './everyday/OpsSettingsView';
import { EodReport } from './everyday/EodReport';
import { SupportTickets } from './everyday/SupportTickets';
import { BevCartView } from './everyday/BevCartView';
import { MessagesView, threadsOf } from './everyday/MessagesView';
import { BroadcastsView } from './everyday/BroadcastsView';
import { StoreManager } from './everyday/StoreManager';
import { PhoneOrderModal } from './everyday/PhoneOrderModal';
import { WeatherHub } from '../weather/WeatherHub';
import { SosAlarm } from './SosAlarm';
import { Modal } from './ui';
import { HelpCenter } from '../help/HelpCenter';
import { BugReport } from '../support/BugReport';
import { setDiagnosticView } from '../support/diagnostics';
// Tournament operations
import { EventCRM } from './tournament/EventCRM';
import { LiveRadar } from './tournament/LiveRadar';
import { useLiveEvent } from './tournament/useLiveEvent';
import { PaceAlerts, StartTournamentSwitch } from './tournament/TournamentControls';
// Shared
import { Queue } from './Queue';
import { ago, glass, hhmm } from './ui';
import { useUndo } from './useUndo';

type View = 'tee' | 'eod' | 'settings' | 'support' | 'tournament' | 'ops' | 'carts' | 'messages' | 'broadcasts' | 'store' | 'weather';
const LABEL: Partial<Record<View, string>> = { tee: 'Tee Sheet', eod: 'End of Day', support: 'Support Tickets', settings: 'Settings', carts: 'Beverage Carts', messages: 'Messages', broadcasts: 'Broadcasts', store: 'Store & Inventory', weather: 'Weather' };

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
  const event = ops.events.find((e) => e.id === s.activeEventId) ?? ops.events[0] ?? EVENTS[0];
  const home = venueById('somerby')!;
  const [view, setView] = useState<View>(() => (s.tournamentLive ? 'tournament' : 'tee'));
  const [clock, setClock] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [report, setReport] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { act, undo, history, snack, dismissSnack } = useUndo(ops, dispatch);
  const [phoneOrder, setPhoneOrder] = useState(false);
  const [cartId, setCartId] = useState(() => ops.carts[0]?.id ?? '');
  const [cartMode, setCartMode] = useState(false);
  const [thread, setThread] = useState<{ key: string; name: string } | null>(null);
  const [cartChat, setCartChat] = useState(false);
  const [preset, setPreset] = useState<{ kind: BroadcastKind; n: number }>({ kind: 'general', n: 0 });
  const unreadMsgs = threadsOf(ops.messages).reduce((n, t) => n + t.unread, 0);
  const openThread = (o: { name: string; phone?: string }) => ({ key: threadKey(o.phone, o.name), name: o.name });
  const readThread = useCallback((t: string) => dispatch({ type: 'readThread', thread: t, by: 'staff' }), [dispatch]);
  const cartName = useCallback((id: string) => ops.carts.find((c) => c.id === id)?.name ?? id, [ops.carts]);
  const broadcastPreset = (kind: BroadcastKind) => { setPreset((p) => ({ kind, n: p.n + 1 })); setView('broadcasts'); };

  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 5_000); return () => clearInterval(id); }, []);
  const live = useLiveEvent(ops, event.id, clock);
  const select = useCallback((id: string) => setSelected((x) => (x === id ? null : id)), []);
  const openOrders = ops.orders.filter(isOpenOrder).length;
  const kitchenOpen = isOpenAt(s.kitchenHours, clock);
  // In-House Tournament mode merges the tee sheet and tournament pages into one Operations view.
  const current: View = s.inHouse ? (view === 'tee' || view === 'tournament' ? 'ops' : view) : view === 'ops' ? 'tee' : view;
  const tournament = current === 'tournament';
  const crumbs = current === 'tournament' ? ['Tournament', event.name, s.tournamentLive ? 'Live Radar' : 'Pre-Event CRM']
    : current === 'ops' ? ['Clubhouse', 'Operations', `In-house · ${s.tournamentLive ? 'Live' : 'Pre-event'}`]
    : ['Clubhouse', LABEL[current] ?? 'Settings'];
  useEffect(() => setDiagnosticView(`clubhouse/${current}`), [current]);
  const unresolved = ops.tickets.filter((t) => t.status !== 'resolved').length;
  const onStatus = (id: string, st: typeof ops.orders[number]['status'], label: string) => {
    act({ type: 'status', id, status: st }, label);
    if (st === 'completed') haptic('success');
  };
  const startSwitch = (
    <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-2.5">
      <StartTournamentSwitch live={s.tournamentLive} onChange={(v) => { dispatch({ type: 'setting', patch: { tournamentLive: v } }); setView(s.inHouse ? 'ops' : 'tournament'); }} />
      <p className="mt-1.5 flex items-start gap-1 text-[9px] leading-snug text-white/45">
        {s.tournamentLive ? <>Tracking on the property only (+250 ft)</> : <><MapPinOff size={10} className="mt-px shrink-0" /> No map or locations before the start</>}
      </p>
    </div>
  );
  const teeSheet = (
    <TeeSheet bookings={ops.teeSheet} blocks={ops.teeBlocks} courseHours={s.courseHours} now={clock}
      onBook={(b) => act({ type: 'book', booking: b }, `Booked ${b.name} at ${b.time}`)} onCancel={(id) => act({ type: 'unbook', id }, 'Cancelled a reservation')}
      onBlock={(k) => act({ type: 'block', block: k }, `Blocked: ${k.reason}`)} onUnblock={(id) => act({ type: 'unblock', id }, 'Removed a block')}
      onEditBlock={(k) => act({ type: 'editBlock', block: k }, `Edited block: ${k.reason}`)} />
  );
  const tournamentView = s.tournamentLive && s.liveSince ? (
    <LiveRadar holes={live.holes} placed={live.placed} alertMin={s.paceAlertMin} orders={ops.orders} now={live.now} liveSince={s.liveSince}
      selected={selected} onSelect={select} onStatus={onStatus}
      onFastForward={DEMO ? live.fastForward : undefined}
      extraDots={[
        ...ops.carts.filter((c) => c.active).map((c) => ({ id: `cart:${c.id}`, at: holePoint(c.hole), kind: 'cart' as const, label: `${c.name} · hole ${c.hole}` })),
        ...ops.sos.filter((a) => (a.status === 'active' || a.status === 'acknowledged') && a.lat != null && a.lng != null).map((a) => ({ id: `sos:${a.id}`, at: [a.lat!, a.lng!] as [number, number], kind: 'sos' as const, label: `SOS · ${a.name}` })),
      ]} />
  ) : (
    <EventCRM event={event} regs={live.regs} details={ops.eventDetails[event.id]}
      onSave={(id, p) => act({ type: 'roster', id, ...p }, `Edited roster: ${p.teamName}`)}
      onMarkPaid={(id, amount) => act({ type: 'pay', id, amount }, `Recorded $${amount} payment`)}
      onCheckIn={(id, on, team) => { act({ type: 'checkIn', id, at: on ? Date.now() : null }, `${on ? 'Checked in' : 'Undid check-in:'} ${team}`); if (on) haptic('success'); }}
      onSaveDetails={(p) => act({ type: 'eventDetails', eventId: event.id, patch: p }, 'Updated event page')} />
  );

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
        <Breadcrumb tournament={tournament} items={crumbs} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span role="status" className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${kitchenOpen ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
            <ChefHat size={11} /> Kitchen {kitchenOpen ? 'open' : 'closed'}
          </span>
          <button onClick={() => setPhoneOrder(true)} aria-label="Phone-In Order" className="flex h-8 items-center gap-1.5 rounded-full border border-sky-300/40 bg-sky-400/10 px-3 text-[10px] font-bold uppercase tracking-widest text-sky-100">
            <PhoneIncoming size={12} /> Phone-In<span className="hidden @7xl:inline"> Order</span>
          </button>
          <button onClick={() => setQueueOpen(true)} className="relative flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80">
            <Truck size={12} /> Orders
            {openOrders > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-black">{openOrders}</span>}
          </button>
          <button onClick={() => setHistoryOpen(true)} aria-label="Recent actions" className="relative flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80">
            <History size={12} /><span className="hidden @7xl:inline">History</span>{history.length > 0 && <span className="font-mono text-white/50">{history.length}</span>}
          </button>
          <button onClick={() => setReport(true)} aria-label="Report a problem" className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/40 text-white/80"><Bug size={14} /></button>
          <button onClick={() => setHelp(true)} aria-label="Help" className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/40 text-white/80"><CircleHelp size={15} /></button>
          <button onClick={lockStaff} className="flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80 active:scale-95">
            <Lock size={12} /> Lock{staffName ? ` · ${staffName}` : ''}
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 gap-3 p-3">
        {/* ── Left rail: two clearly separated areas ── */}
        <aside className="no-scrollbar flex w-52 shrink-0 flex-col gap-3 overflow-y-auto" aria-label="Clubhouse OS navigation">
          {s.inHouse ? (
            <section aria-label="Clubhouse operations" className={`${glass} rounded-2xl p-2`}>
              <SectionLabel dot={s.tournamentLive ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'} title="Clubhouse" sub={`In-house tournament · ${event.name}`} />
              <NavItem icon={LayoutDashboard} label="Operations" active={current === 'ops'} onClick={() => setView('ops')} tone="emerald" badge={s.tournamentLive ? 'LIVE' : undefined} />
              <NavItem icon={Car} label="Bev Carts" active={current === 'carts'} onClick={() => setView('carts')} tone="emerald" badge={ops.orders.filter((o) => o.cartId && isOpenOrder(o)).length ? String(ops.orders.filter((o) => o.cartId && isOpenOrder(o)).length) : undefined} />
              <NavItem icon={MessageSquareText} label="Messages" active={current === 'messages'} onClick={() => setView('messages')} tone="emerald" badge={unreadMsgs ? String(unreadMsgs) : undefined} />
              <NavItem icon={Megaphone} label="Broadcasts" active={current === 'broadcasts'} onClick={() => setView('broadcasts')} tone="emerald" />
              <NavItem icon={CloudLightning} label="Weather" active={current === 'weather'} onClick={() => setView('weather')} tone="emerald" />
              <NavItem icon={Package} label="Store" active={current === 'store'} onClick={() => setView('store')} tone="emerald" />
              <NavItem icon={Receipt} label="End of Day" active={current === 'eod'} onClick={() => setView('eod')} tone="emerald" />
              <NavItem icon={LifeBuoy} label="Support" active={current === 'support'} onClick={() => setView('support')} tone="emerald" badge={unresolved ? String(unresolved) : undefined} />
              <NavItem icon={Settings2} label="Settings" active={current === 'settings'} onClick={() => setView('settings')} tone="emerald" />
              {startSwitch}
            </section>
          ) : (
            <>
              <section aria-label="Clubhouse operations" className={`${glass} rounded-2xl p-2`}>
                <SectionLabel dot="bg-emerald-400" title="Clubhouse" sub="Everyday operations" />
                <NavItem icon={CalendarClock} label="Tee Sheet" active={current === 'tee'} onClick={() => setView('tee')} tone="emerald" />
                <NavItem icon={Car} label="Bev Carts" active={current === 'carts'} onClick={() => setView('carts')} tone="emerald" badge={ops.orders.filter((o) => o.cartId && isOpenOrder(o)).length ? String(ops.orders.filter((o) => o.cartId && isOpenOrder(o)).length) : undefined} />
                <NavItem icon={MessageSquareText} label="Messages" active={current === 'messages'} onClick={() => setView('messages')} tone="emerald" badge={unreadMsgs ? String(unreadMsgs) : undefined} />
                <NavItem icon={Megaphone} label="Broadcasts" active={current === 'broadcasts'} onClick={() => setView('broadcasts')} tone="emerald" />
                <NavItem icon={CloudLightning} label="Weather" active={current === 'weather'} onClick={() => setView('weather')} tone="emerald" />
                <NavItem icon={Package} label="Store" active={current === 'store'} onClick={() => setView('store')} tone="emerald" />
                <NavItem icon={Receipt} label="End of Day" active={current === 'eod'} onClick={() => setView('eod')} tone="emerald" />
                <NavItem icon={LifeBuoy} label="Support" active={current === 'support'} onClick={() => setView('support')} tone="emerald" badge={unresolved ? String(unresolved) : undefined} />
                <NavItem icon={Settings2} label="Settings" active={current === 'settings'} onClick={() => setView('settings')} tone="emerald" />
              </section>

              <section aria-label="Tournament operations" className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-2 backdrop-blur-2xl">
                <SectionLabel dot={s.tournamentLive ? 'bg-red-500 animate-pulse' : 'bg-amber-300'} title="Tournament" sub={event.name} />
                <NavItem icon={s.tournamentLive ? Radar : Trophy} label={s.tournamentLive ? 'Live Radar' : 'Pre-Event CRM'} active={tournament} onClick={() => setView('tournament')} tone="amber"
                  badge={s.tournamentLive ? 'LIVE' : `${live.regs.length} teams`} />
                {startSwitch}
              </section>
            </>
          )}
        </aside>

        <main className="@container relative min-h-0 min-w-0 flex-1 overflow-y-auto @4xl:overflow-hidden">
          {current === 'tee' && teeSheet}
          {current === 'eod' && <EodReport orders={ops.orders} now={clock} courseName={SOMERBY.name} />}
          {current === 'settings' && <OpsSettingsView settings={s} now={clock} onChange={(patch) => act({ type: 'setting', patch }, `Changed ${Object.keys(patch).join(', ')}`)} />}
          {current === 'support' && <SupportTickets tickets={ops.tickets} now={clock} onStatus={(id, status, note) => act({ type: 'ticketStatus', id, status, note }, `Ticket #${id.slice(0, 8).toUpperCase()} → ${status}`)} />}
          {current === 'tournament' && tournamentView}
          {current === 'carts' && (
            <BevCartView ops={ops} now={clock} cartId={cartId} onCartId={setCartId} onStatus={onStatus}
              onCart={(id, patch) => act({ type: 'cartUpdate', id, patch }, `${cartName(id)}: ${patch.hole ? `at hole ${patch.hole}` : patch.active ? 'on duty' : 'off duty'}`)}
              onAssign={(orderId, to) => act({ type: 'assignCart', orderId, cartId: to }, `Reassigned to ${cartName(to)}`)}
              onMessage={(o) => { setThread(openThread(o)); setView('messages'); }}
              onSos={(c) => { const [lat, lng] = holePoint(c.hole); dispatch({ type: 'sos', alert: { id: newId(), from: 'cart', name: c.name, hole: c.hole, lat, lng, at: Date.now(), status: 'active' } }); }}
              onExit={undefined} />
          )}
          {current === 'carts' && (
            <button onClick={() => setCartMode(true)} className="absolute bottom-3 right-3 rounded-full border border-violet-300/40 bg-violet-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-100">Open cart mode (full screen)</button>
          )}
          {current === 'messages' && <MessagesView messages={ops.messages} now={clock} author={staffName ?? 'Clubhouse'} open={thread} onOpen={setThread} onSend={(m) => dispatch({ type: 'message', msg: m })} onRead={readThread} />}
          {current === 'broadcasts' && <BroadcastsView key={preset.n} preset={preset.kind} broadcasts={ops.broadcasts} now={clock} author={staffName ?? 'Clubhouse'} eventId={event.id} onSend={(b) => { dispatch({ type: 'broadcast', broadcast: b }); haptic('success'); }} />}
          {current === 'store' && (
            <StoreManager menu={ops.menu} charityLive={charityOpen(s)} inHouse={s.inHouse}
              onUpsert={(i, label) => act({ type: 'menuUpsert', item: i }, label)} onRemove={(i) => act({ type: 'menuRemove', sku: i.sku }, `Removed ${i.name}`)} />
          )}
          {current === 'weather' && <WeatherHub lat={home.lat} lng={home.lng} place={home.name} onBroadcast={broadcastPreset} />}
          {current === 'ops' && (
            <div className="grid h-full min-h-0 grid-cols-1 gap-3 @5xl:grid-cols-2" data-testid="unified-ops">
              <div className="@container min-h-0 overflow-y-auto" aria-label="Daily operations">{teeSheet}</div>
              <div className="@container min-h-0 overflow-y-auto rounded-3xl border border-amber-300/20 p-1" aria-label="Tournament">{tournamentView}</div>
            </div>
          )}
          {s.tournamentLive && <PaceAlerts toasts={live.toasts} onDismiss={live.dismiss} onOpen={(g) => { setView(s.inHouse ? 'ops' : 'tournament'); setSelected(g); }} />}
        </main>
      </div>

      {phoneOrder && (
        <PhoneOrderModal ops={ops} onClose={() => setPhoneOrder(false)}
          onSubmit={(o) => { dispatch({ type: 'order', order: o }); haptic('success'); setPhoneOrder(false); }} />
      )}
      {cartMode && (
        <div className="absolute inset-0 z-[60] flex flex-col bg-zinc-950 p-3 @container" aria-label="Beverage Cart OS">
          <BevCartView ops={ops} now={clock} cartId={cartId} onCartId={setCartId} onStatus={onStatus}
            onCart={(id, patch) => act({ type: 'cartUpdate', id, patch }, `${cartName(id)} updated`)}
            onAssign={(orderId, to) => act({ type: 'assignCart', orderId, cartId: to }, `Reassigned to ${cartName(to)}`)}
            onMessage={(o) => { setThread(openThread(o)); setCartChat(true); }}
            onSos={(c) => { const [lat, lng] = holePoint(c.hole); dispatch({ type: 'sos', alert: { id: newId(), from: 'cart', name: c.name, hole: c.hole, lat, lng, at: Date.now(), status: 'active' } }); }}
            onExit={() => setCartMode(false)} />
          {cartChat && (
            <Modal title="Message golfer" wide onClose={() => setCartChat(false)}>
              <div className="h-[60vh] @container">
                <MessagesView messages={ops.messages} now={clock} author={cartName(cartId)} from="cart" open={thread} onOpen={setThread} onSend={(m) => dispatch({ type: 'message', msg: m })} onRead={readThread} />
              </div>
            </Modal>
          )}
        </div>
      )}
      <SosAlarm alerts={ops.sos} now={clock} staffName={staffName ?? 'Staff'}
        onAck={(id) => { dispatch({ type: 'sosStatus', id, status: 'acknowledged', by: staffName ?? 'Staff' }); haptic('success'); }}
        onResolve={(id) => dispatch({ type: 'sosStatus', id, status: 'resolved', by: staffName ?? 'Staff' })}
        onMessage={(a) => { dispatch({ type: 'sosStatus', id: a.id, status: 'acknowledged', by: staffName ?? 'Staff' }); setThread(openThread({ name: a.name, phone: a.phone })); setCartMode(false); setView('messages'); }} />
      {help && <HelpCenter audience="staff" onClose={() => setHelp(false)} onReport={() => { setHelp(false); setReport(true); }} />}
      {report && <BugReport role="staff" reporter={staffName ?? 'Staff'} onSubmit={(t) => dispatch({ type: 'ticket', ticket: t })} onClose={() => setReport(false)} />}
      {snack && (
        <div role="status" aria-label="Undo" className="absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/15 bg-zinc-900/95 py-2 pl-4 pr-2 shadow-2xl backdrop-blur-2xl">
          <span className="max-w-[340px] truncate text-[12px] text-white/85">{snack.label}</span>
          <button onClick={() => undo(snack.id)} className="flex items-center gap-1 rounded-xl bg-amber-300 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-black"><RotateCcw size={12} /> Undo</button>
          <button onClick={dismissSnack} aria-label="Dismiss" className="text-white/40"><X size={14} /></button>
        </div>
      )}
      {historyOpen && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/40" onClick={() => setHistoryOpen(false)}>
          <aside onClick={(e) => e.stopPropagation()} aria-label="Recent actions" className={`${glass} m-3 flex w-full max-w-md flex-col rounded-3xl bg-zinc-950/85 p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]"><History size={13} /> Recent actions</h2>
              <button onClick={() => setHistoryOpen(false)} aria-label="Close history" className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><X size={14} /></button>
            </div>
            <p className="mb-2 text-[10px] text-white/45">Tap Undo to reverse a mistake. Starting or ending a tournament can’t be undone here.</p>
            <ul className="eg-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {history.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="min-w-0"><span className="block truncate text-[12px] text-white/85">{e.label}</span><span className="text-[10px] text-white/40">{ago(e.at, clock)}</span></span>
                  <button onClick={() => undo(e.id)} className="flex shrink-0 items-center gap-1 rounded-xl border border-amber-300/40 bg-amber-300/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-amber-100"><RotateCcw size={11} /> Undo</button>
                </li>
              ))}
              {!history.length && <li className="py-8 text-center text-[11px] text-white/40">No actions yet this session.</li>}
            </ul>
          </aside>
        </div>
      )}
      {queueOpen && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/40" onClick={() => setQueueOpen(false)}>
          <aside onClick={(e) => e.stopPropagation()} aria-label="Orders" className={`${glass} m-3 flex w-full max-w-md flex-col rounded-3xl bg-zinc-950/85 p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]"><Truck size={13} /> Fulfillment Queue</h2>
              <button onClick={() => setQueueOpen(false)} aria-label="Close orders" className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><X size={14} /></button>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto"><Queue orders={ops.orders} now={clock} onStatus={onStatus} cartName={cartName} /></div>
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
