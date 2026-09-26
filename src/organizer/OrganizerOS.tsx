import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, CalendarRange, RotateCcw, Search, X, CircleHelp, CloudLightning, Lock, MapPin, Megaphone, Pencil, Plus, Star, Trash2, Trophy, Users } from 'lucide-react';
import { useRole } from '../auth/RoleContext';
import { useOps, newId } from '../ops/useOps';
import { validateEvent, venueById, VENUES, type TournamentEvent } from '../ops/venues';
import type { BroadcastKind } from '../ops/comms';
import { EventCRM } from '../clubhouse/tournament/EventCRM';
import { BroadcastsView } from '../clubhouse/everyday/BroadcastsView';
import { WeatherHub } from '../weather/WeatherHub';
import { HelpCenter } from '../help/HelpCenter';
import { field, glass, Modal } from '../clubhouse/ui';
import { setDiagnosticView } from '../support/diagnostics';
import { haptic } from '../lib/haptics';
import { useUndo } from '../clubhouse/useUndo';
import { RosterDesk } from './RosterDesk';

type View = 'events' | 'roster' | 'teams' | 'broadcasts' | 'weather';

/**
 * Organizer OS — for tournament organizers who run events at one or more verified courses.
 * Create and schedule events across venues, manage each event's teams (CRM), watch the weather
 * at the venue and notify the field. Organizers never see course operations (tee sheet, store,
 * orders) and their broadcasts only reach their own event's registrants.
 */
export function OrganizerOS() {
  const { organizerName, lockOrganizer } = useRole();
  const [ops, dispatch] = useOps('organizer');
  const [view, setView] = useState<View>('events');
  const [selectedId, setSelectedId] = useState(() => ops.settings.activeEventId);
  const [edit, setEdit] = useState<TournamentEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [preset, setPreset] = useState<{ kind: BroadcastKind; n: number }>({ kind: 'general', n: 0 });
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const { act, undo, snack, dismissSnack } = useUndo(ops, dispatch);
  const event = ops.events.find((e) => e.id === selectedId) ?? ops.events[0];
  const venue = event ? venueById(event.venueId) : undefined;
  useEffect(() => setDiagnosticView(`organizer/${view}`), [view]);

  const byDate = useMemo(() => [...ops.events].sort((a, b) => a.startsOn.localeCompare(b.startsOn)), [ops.events]);
  const clash = (e: TournamentEvent) => ops.events.some((x) => x.id !== e.id && x.venueId === e.venueId && x.startsOn === e.startsOn);
  const regs = event ? ops.registrations.filter((r) => r.eventId === event.id) : [];
  const blank = (): TournamentEvent => ({
    id: newId(), name: '', course: '', date: '', longDate: '', time: 'Check-in 7:00 AM · 8:00 AM shotgun', location: '', organizerText: '',
    format: '4-person scramble', foursomePrice: 500, mulliganPrice: 10, cause: '', teams: 36, venueId: '', startsOn: '', organizer: organizerName ?? '', status: 'scheduled',
  });

  const nav: { id: View; label: string; icon: typeof Trophy }[] = [
    { id: 'events', label: 'Events', icon: CalendarRange }, { id: 'roster', label: 'Roster & search', icon: ArrowRightLeft }, { id: 'teams', label: 'Teams', icon: Users },
    { id: 'broadcasts', label: 'Notify field', icon: Megaphone }, { id: 'weather', label: 'Weather', icon: CloudLightning },
  ];

  return (
    <div className="@container relative flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-white" data-testid="organizer-os">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.10),transparent_55%)]" />
      <header className={`${glass} relative z-30 m-3 mb-0 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2.5`}>
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/40"><Trophy size={16} className="text-sky-300" /></span>
        <div className="leading-tight">
          <div className="text-[11px] font-black tracking-[0.25em]">ORGANIZER OS</div>
          <div className="text-[10px] text-white/50">{organizerName}</div>
        </div>
        {event && (
          <label className="ml-2 flex items-center gap-2 rounded-full bg-sky-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-100">
            Event
            <select aria-label="Selected event" value={event.id} onChange={(e) => setSelectedId(e.target.value)} className="max-w-[220px] rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-white">
              {byDate.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        )}
        <label className="relative ml-auto min-w-[220px] flex-1 @5xl:max-w-sm">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input aria-label="Search golfers" value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim()) setView('roster'); }}
            placeholder="Find a golfer · name or phone" className="h-9 w-full rounded-full border border-white/15 bg-black/40 pl-8 pr-3 text-[12px] text-white placeholder-white/35 focus:border-sky-400/50 focus:outline-none" />
        </label>
        <div className="flex items-center gap-2">
          <button onClick={() => setHelp(true)} aria-label="Help" className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/40 text-white/80"><CircleHelp size={15} /></button>
          <button onClick={lockOrganizer} className="flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80"><Lock size={12} /> Sign out</button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3 @3xl:flex-row">
        <nav aria-label="Organizer navigation" className={`${glass} flex shrink-0 gap-1 overflow-x-auto rounded-2xl p-2 @3xl:w-48 @3xl:flex-col`}>
          {nav.map(({ id, label, icon: I }) => (
            <button key={id} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wider ${view === id ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/30' : 'text-white/60 hover:bg-white/5'}`}>
              <I size={14} />{label}
            </button>
          ))}
        </nav>

        <main className="@container relative min-h-0 min-w-0 flex-1 overflow-y-auto">
          {view === 'events' && (
            <div className="flex flex-col gap-3" data-testid="organizer-events">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">Your events · {ops.events.length}</h2>
                <button onClick={() => setEdit(blank())} className="ml-auto flex h-9 items-center gap-1.5 rounded-xl bg-sky-400 px-3 text-[10px] font-black uppercase tracking-widest text-black"><Plus size={13} /> New event</button>
              </div>
              <ul className="grid grid-cols-1 gap-2 @3xl:grid-cols-2" aria-label="Events">
                {byDate.map((e) => {
                  const v = venueById(e.venueId);
                  const teams = ops.registrations.filter((r) => r.eventId === e.id).length;
                  const active = ops.settings.activeEventId === e.id;
                  return (
                    <li key={e.id} className={`${glass} flex flex-col gap-1.5 rounded-2xl p-3 ${e.id === event?.id ? 'ring-1 ring-sky-400/40' : ''}`} aria-label={e.name}>
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => setSelectedId(e.id)} className="min-w-0 text-left">
                          <div className="truncate text-[14px] font-black">{e.name}</div>
                          <div className="text-[11px] text-white/60">{e.date}</div>
                          <div className="flex items-center gap-1 text-[11px] text-white/50"><MapPin size={10} /> {v?.name ?? e.course} · {v?.location}</div>
                        </button>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {active && <span className="flex items-center gap-1 rounded-full bg-amber-300/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-200"><Star size={9} /> Active at course</span>}
                          {v?.onPlatform ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-300">Clubhouse OS</span> : <span className="rounded-full bg-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white/50">Organizer-run</span>}
                        </span>
                      </div>
                      {clash(e) && <div className="flex items-center gap-1 text-[10px] text-amber-200"><AlertTriangle size={11} /> Another event is booked at this venue that day</div>}
                      <div className="text-[11px] text-white/65">{teams}/{e.teams} teams · ${e.foursomePrice}/foursome · {e.format}</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => { setSelectedId(e.id); setView('teams'); }} className="h-8 rounded-lg border border-white/15 px-2.5 text-[9px] font-bold uppercase tracking-widest text-white/80">Teams</button>
                        <button onClick={() => setEdit(e)} aria-label={`Edit ${e.name}`} className="flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-[9px] font-bold uppercase tracking-widest text-white/80"><Pencil size={11} /> Edit</button>
                        {v?.onPlatform && !active && !ops.settings.tournamentLive && (
                          <button onClick={() => { dispatch({ type: 'activeEvent', id: e.id }); haptic('success'); }} className="h-8 rounded-lg border border-amber-300/40 px-2.5 text-[9px] font-bold uppercase tracking-widest text-amber-100">Make active at course</button>
                        )}
                        {!teams && !active && (
                          <button onClick={() => { if (window.confirm(`Delete ${e.name}?`)) dispatch({ type: 'eventRemove', id: e.id }); }} aria-label={`Delete ${e.name}`} className="grid h-8 w-8 place-items-center rounded-lg border border-red-400/30 text-red-300"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {view === 'roster' && (
            <RosterDesk ops={ops} events={ops.events} query={query} onQuery={setQuery} defaultEventId={event?.id}
              actions={{
                onRegister: (r) => { act({ type: 'staffRegister', reg: r }, `Registered ${r.teamName} · ${ops.events.find((e) => e.id === r.eventId)?.name}`); haptic('success'); },
                onMoveTeam: (id, to, label) => { act({ type: 'moveTeam', id, toEventId: to }, label); haptic('success'); },
                onMovePlayer: (id, slot, to, label) => { act({ type: 'movePlayer', id, slot, toEventId: to, newId: newId() }, label); haptic('success'); },
              }} />
          )}
          {view === 'teams' && event && (
            <EventCRM event={event} regs={regs} details={ops.eventDetails[event.id]}
              onSave={(id, p) => dispatch({ type: 'roster', id, ...p })}
              onMarkPaid={(id, amount) => dispatch({ type: 'pay', id, amount })}
              onCheckIn={(id, on) => { dispatch({ type: 'checkIn', id, at: on ? Date.now() : null }); if (on) haptic('success'); }}
              onSaveDetails={(p) => dispatch({ type: 'eventDetails', eventId: event.id, patch: p })} />
          )}
          {view === 'broadcasts' && event && (
            <BroadcastsView key={`${event.id}-${preset.n}`} preset={preset.kind} organizer eventId={event.id}
              broadcasts={ops.broadcasts.filter((b) => b.eventId === event.id)} now={now} author={organizerName ?? 'Organizer'}
              onSend={(b) => { dispatch({ type: 'broadcast', broadcast: b }); haptic('success'); }} />
          )}
          {view === 'weather' && venue && (
            <WeatherHub lat={venue.lat} lng={venue.lng} place={venue.name} onBroadcast={(kind) => { setPreset((p) => ({ kind, n: p.n + 1 })); setView('broadcasts'); }} />
          )}
        </main>
      </div>

      {edit && <EventEditor start={edit} isNew={!ops.events.some((e) => e.id === edit.id)} onClose={() => setEdit(null)}
        onSave={(e) => { dispatch({ type: 'eventUpsert', event: e }); setSelectedId(e.id); setEdit(null); haptic('success'); }} />}
      {help && <HelpCenter audience="staff" onClose={() => setHelp(false)} />}
      {snack && (
        <div role="status" aria-label="Undo" className="absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/15 bg-zinc-900/95 py-2 pl-4 pr-2 shadow-2xl backdrop-blur-2xl">
          <span className="max-w-[360px] truncate text-[12px] text-white/85">{snack.label}</span>
          <button onClick={() => undo(snack.id)} className="flex items-center gap-1 rounded-xl bg-amber-300 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-black"><RotateCcw size={12} /> Undo</button>
          <button onClick={dismissSnack} aria-label="Dismiss" className="text-white/40"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function EventEditor({ start, isNew, onSave, onClose }: { start: TournamentEvent; isNew: boolean; onSave: (e: TournamentEvent) => void; onClose: () => void }) {
  const [e, setE] = useState(start);
  const [touched, setTouched] = useState(false);
  const v = validateEvent(e);
  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-white/50';
  const err = (t?: string) => (touched && t ? <span className="text-[10px] text-rose-300">{t}</span> : null);
  return (
    <Modal title={isNew ? 'New event' : `Edit ${start.name}`} onClose={onClose} wide>
      <div className="grid gap-3">
        <label className="flex flex-col gap-1"><span className={lbl}>Event name</span><input aria-label="Event name" value={e.name} maxLength={80} onChange={(x) => setE({ ...e, name: x.target.value })} className={field} />{err(v.errors.name)}</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><span className={lbl}>Venue (verified courses)</span>
            <select aria-label="Venue" value={e.venueId} onChange={(x) => setE({ ...e, venueId: x.target.value })} className={field}>
              <option value="">Choose a course…</option>
              {VENUES.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.location}</option>)}
            </select>{err(v.errors.venue)}</label>
          <label className="flex flex-col gap-1"><span className={lbl}>Date</span><input aria-label="Event date" type="date" value={e.startsOn} onChange={(x) => setE({ ...e, startsOn: x.target.value })} className={`${field} [color-scheme:dark]`} />{err(v.errors.date)}</label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><span className={lbl}>Schedule</span><input aria-label="Schedule" value={e.time} maxLength={80} onChange={(x) => setE({ ...e, time: x.target.value })} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>Format</span><input aria-label="Format" value={e.format} maxLength={60} onChange={(x) => setE({ ...e, format: x.target.value })} className={field} /></label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1"><span className={lbl}>$ / foursome</span><input aria-label="Foursome price" type="number" min={0} value={e.foursomePrice} onChange={(x) => setE({ ...e, foursomePrice: Number(x.target.value) })} className={`${field} font-mono`} />{err(v.errors.price)}</label>
          <label className="flex flex-col gap-1"><span className={lbl}>Team cap</span><input aria-label="Team cap" type="number" min={1} max={72} value={e.teams} onChange={(x) => setE({ ...e, teams: Math.floor(Number(x.target.value)) })} className={`${field} font-mono`} />{err(v.errors.teams)}</label>
          <label className="flex flex-col gap-1"><span className={lbl}>$ / mulligan</span><input aria-label="Mulligan price" type="number" min={0} value={e.mulliganPrice} onChange={(x) => setE({ ...e, mulliganPrice: Number(x.target.value) })} className={`${field} font-mono`} /></label>
        </div>
        <label className="flex flex-col gap-1"><span className={lbl}>Cause</span><input aria-label="Cause" value={e.cause} maxLength={120} onChange={(x) => setE({ ...e, cause: x.target.value })} placeholder="e.g. Benefits local youth golf" className={field} /></label>
        <label className="flex flex-col gap-1"><span className={lbl}>Message to golfers</span><textarea aria-label="Organizer message" value={e.organizerText} maxLength={800} rows={3} onChange={(x) => setE({ ...e, organizerText: x.target.value })} className={`${field} resize-none`} /></label>
        <button onClick={() => { setTouched(true); if (v.ok) onSave(e); }} className="h-11 rounded-2xl bg-sky-400 text-[11px] font-black uppercase tracking-[0.18em] text-black">{isNew ? 'Create event' : 'Save event'}</button>
      </div>
    </Modal>
  );
}
