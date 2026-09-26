import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Car, CheckCheck, ChevronDown, Clock, Lock, MapPin, Minus, Plus, Radar, ShieldCheck, ShoppingBag, Timer, Trophy, Truck } from 'lucide-react';
import { SOMERBY } from '../data/course';
import { imageryProvider } from '../map/providers';
import { useOps } from '../ops/useOps';
import { placeGroups, demoGroups } from '../ops/pace';
import { EVENTS } from '../tournaments/events';
import { useRole } from '../auth/RoleContext';
import type { Order, Registration } from '../ops/model';
import type { RadarDot } from './RadarMap';

const RadarMap = lazy(() => import('./RadarMap'));
const PROVIDER = imageryProvider();
const LATE_MIN = 15;

const glass = 'border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.45)]';
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const ago = (t: number, now: number) => { const m = Math.max(0, Math.round((now - t) / 60_000)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`; };

/**
 * Clubhouse OS — the staff tablet (landscape). Only reachable with a staff session (PIN / Face ID);
 * in cloud mode every read and write here is additionally gated by RLS (is_staff()).
 */
export function ClubhouseOS() {
  const { lockStaff, staffName } = useRole();
  const [ops, dispatch] = useOps('staff');
  const [now, setNow] = useState(() => Date.now());
  const [mapFailed, setMapFailed] = useState(!PROVIDER);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<'today' | 'event'>('today');

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);

  const holes = SOMERBY.data.holes;
  const [groups] = useState(() => demoGroups(Date.now()));
  const placed = useMemo(() => placeGroups(groups, holes.map((h) => h.path), now), [groups, holes, now]);
  const onCourse = placed.filter((g) => g.at);
  const late = onCourse.filter((g) => g.behindMin > LATE_MIN);

  const active = ops.orders.filter((o) => o.status !== 'delivered').sort((a, b) => a.createdAt - b.createdAt);
  const delivered = ops.orders.filter((o) => o.status === 'delivered');
  const revenue = ops.orders.reduce((a, o) => a + o.total, 0);
  const mullsSold = ops.orders.reduce((a, o) => a + o.items.filter((i) => i.kind === 'charity').reduce((s, i) => s + i.qty, 0), 0);

  const dots: RadarDot[] = useMemo(() => [
    ...onCourse.map((g) => ({
      id: g.group.id, at: g.at!, kind: (g.behindMin > LATE_MIN ? 'late' : 'group') as RadarDot['kind'],
      label: `${g.group.name} · hole ${g.hole} · ${g.behindMin > 0 ? `${g.behindMin} min behind` : 'on pace'}`,
    })),
    ...active.map((o) => ({ id: o.id, at: [o.lat, o.lng] as [number, number], kind: o.kind === 'hail' ? 'hail' as const : 'order' as const, label: `${o.kind === 'hail' ? 'Cart hail' : 'Order'} · ${o.player} · hole ${o.hole}` })),
  ], [onCourse, active]);

  const setStatus = (id: string, status: Order['status']) => dispatch({ type: 'status', id, status });
  const select = useCallback((id: string) => setSelected((s) => (s === id ? null : id)), []);
  const sel = placed.find((g) => g.group.id === selected);
  const regs = ops.registrations.filter((r) => r.eventId === EVENTS[0].id);

  return (
    <div className="@container relative h-full w-full overflow-hidden bg-zinc-950 text-white" data-testid="clubhouse-os">
      {/* ── Floating glass header: master controls ── */}
      <header className={`${glass} absolute inset-x-3 top-3 z-30 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-2.5`}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/40"><ShieldCheck size={16} className="text-emerald-400" /></span>
          <div className="leading-tight">
            <div className="text-[11px] font-black tracking-[0.25em]">CLUBHOUSE OS</div>
            <div className="text-[10px] text-white/50">{SOMERBY.name} · {hhmm(now)}</div>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-x-5 gap-y-2">
          <Toggle label="Hail Drink Cart" on={ops.settings.hailCart} onChange={(v) => dispatch({ type: 'setting', patch: { hailCart: v } })} />
          <Toggle label="Live Ordering" on={ops.settings.liveOrdering} onChange={(v) => dispatch({ type: 'setting', patch: { liveOrdering: v } })} />
          <div className="flex items-center gap-2" role="group" aria-label="Mulligan limit per player">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Mulligan limit</span>
            <button aria-label="Lower mulligan limit" onClick={() => dispatch({ type: 'setting', patch: { mulliganLimit: ops.settings.mulliganLimit - 1 } })} className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><Minus size={12} /></button>
            <span className="w-4 text-center font-mono text-sm text-amber-200" aria-live="polite">{ops.settings.mulliganLimit}</span>
            <button aria-label="Raise mulligan limit" onClick={() => dispatch({ type: 'setting', patch: { mulliganLimit: ops.settings.mulliganLimit + 1 } })} className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><Plus size={12} /></button>
          </div>
          <button onClick={lockStaff} className="flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-widest text-white/80 active:scale-95">
            <Lock size={12} /> Lock{staffName ? ` · ${staffName}` : ''}
          </button>
        </div>
      </header>

      <main className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 pt-[5.5rem] @4xl:grid-cols-[1.45fr_1fr] @4xl:overflow-hidden @4xl:pt-[4.75rem]">
        {/* ── Left: pace-of-play radar ── */}
        <section aria-label="Pace of play radar" className="relative min-h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-black">
          {mapFailed || !PROVIDER ? (
            <SvgRadar holes={holes} dots={dots} selected={selected} onSelect={select} />
          ) : (
            <Suspense fallback={<SvgRadar holes={holes} dots={dots} selected={selected} onSelect={select} />}>
              <RadarMap provider={PROVIDER} holes={holes} dots={dots} selected={selected} onSelect={select} onFail={() => setMapFailed(true)} />
            </Suspense>
          )}
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.75)]" />
          <div className={`${glass} absolute left-3 top-3 flex items-center gap-4 rounded-2xl px-3 py-2`}>
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><Radar size={13} /> God-mode</span>
            <Stat label="On course" value={onCourse.length} />
            <Stat label={`>${LATE_MIN}m behind`} value={late.length} tone={late.length ? 'red' : undefined} />
            <Stat label="Open orders" value={active.length} tone={active.length ? 'amber' : undefined} />
          </div>
          <div className={`${glass} absolute bottom-3 left-3 flex gap-3 rounded-xl px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/60`}>
            <Legend c="bg-emerald-500" t="On pace" /><Legend c="bg-red-500" t="Behind" /><Legend c="bg-amber-400" t="Order" /><Legend c="bg-sky-400" t="Hail" />
          </div>
          {sel && (
            <div className={`${glass} absolute bottom-3 right-3 w-56 rounded-2xl p-3`} role="status">
              <div className="flex items-center justify-between text-[12px] font-bold">{sel.group.name} group <span className="font-mono text-[10px] text-white/50">{hhmm(sel.group.teeTime)}</span></div>
              <div className="text-[11px] text-white/60">{sel.group.players.join(', ')}</div>
              <div className={`mt-1 text-[11px] font-bold ${sel.behindMin > LATE_MIN ? 'text-red-400' : 'text-emerald-300'}`}>Hole {sel.hole} · {sel.behindMin > 0 ? `${sel.behindMin} min behind` : 'on pace'}</div>
            </div>
          )}
        </section>

        {/* ── Right: tee sheet (top) + fulfillment queue (bottom) ── */}
        <div className="grid min-h-0 grid-rows-[minmax(260px,1fr)_minmax(260px,1fr)] gap-3">
          <Panel
            title={<><Clock size={13} /> Tee Sheet & Rosters</>}
            aside={
              <div role="tablist" className="flex gap-1 rounded-lg bg-black/40 p-0.5">
                {([['today', `Today · ${groups.length}`], ['event', `Kid’s Cup · ${regs.length}`]] as const).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={sheetTab === id} onClick={() => setSheetTab(id)} className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${sheetTab === id ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50'}`}>{label}</button>
                ))}
              </div>
            }
          >
            {sheetTab === 'today' ? (
              <ul className="flex flex-col gap-1">
                {placed.map((g) => (
                  <li key={g.group.id}>
                    <button onClick={() => select(g.group.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${selected === g.group.id ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/5 bg-white/[0.03]'}`}>
                      <span className="w-16 font-mono text-[11px] text-white/70">{hhmm(g.group.teeTime)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{g.group.name} <span className="font-normal text-white/45">· {g.group.players.length}p</span></span>
                      <PaceTag g={g} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EventRoster regs={regs} />
            )}
          </Panel>

          <Panel title={<><Truck size={13} /> Fulfillment Queue</>} aside={<span className="font-mono text-[10px] text-white/50">${revenue} today · {mullsSold} mulligans</span>}>
            {!active.length && <p className="py-6 text-center text-[11px] text-white/40">No open orders. {delivered.length ? `${delivered.length} delivered today.` : ''}</p>}
            <ul className="flex flex-col gap-2">
              {active.map((o) => (
                <li key={o.id} className={`rounded-2xl border p-3 ${selected === o.id ? 'border-amber-300/60' : 'border-white/10'} ${o.status === 'enroute' ? 'bg-emerald-500/[0.07]' : 'bg-white/[0.04]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => select(o.id)} className="min-w-0 text-left">
                      <div className="flex items-center gap-1.5 text-[12px] font-bold">
                        {o.kind === 'hail' ? <Car size={13} className="text-sky-300" /> : <ShoppingBag size={13} className="text-amber-300" />}
                        {o.kind === 'hail' ? 'Cart hail' : `$${o.total}`} · {o.player}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/55"><MapPin size={10} /> Hole {o.hole} · <span className="font-mono">{o.lat.toFixed(5)}, {o.lng.toFixed(5)}</span> · {ago(o.createdAt, now)}</div>
                      {o.items.length > 0 && <div className="mt-1 text-[11px] text-white/75">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>}
                    </button>
                    {o.status === 'new' ? (
                      <button onClick={() => setStatus(o.id, 'enroute')} className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black active:scale-95">En Route</button>
                    ) : (
                      <button onClick={() => setStatus(o.id, 'delivered')} className="flex shrink-0 items-center gap-1 rounded-xl border border-emerald-400/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 active:scale-95"><CheckCheck size={12} /> Delivered</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </main>
    </div>
  );
}

function EventRoster({ regs }: { regs: Registration[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ev = EVENTS[0];
  if (!regs.length) return <p className="py-6 text-center text-[11px] text-white/40">No teams registered for {ev.name} yet.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      <li className="px-1 text-[10px] text-white/45"><Trophy size={10} className="mr-1 inline text-amber-300" />{ev.name} · {ev.date} · {regs.length}/{ev.teams} teams</li>
      {regs.map((r) => (
        <li key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03]">
          <button onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex w-full items-center gap-3 px-3 py-2 text-left">
            <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{r.teamName}</span>
            <span className="text-[10px] text-white/50">{r.teeTime}</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-300">Paid ${r.total}</span>
            <ChevronDown size={14} className={`text-white/40 transition-transform ${open === r.id ? 'rotate-180' : ''}`} />
          </button>
          {open === r.id && (
            <table className="mb-2 w-full text-left text-[11px]">
              <tbody>
                {[r.captain, ...r.roster].map((c, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-1.5 pl-3 font-semibold">{c.first} {c.last}{i === 0 && <span className="ml-1 text-[9px] text-amber-300">CAPT</span>}</td>
                    <td className="py-1.5"><a href={`tel:${c.phone}`} className="font-mono text-white/70 underline-offset-2 hover:underline">{c.phone}</a></td>
                    <td className="truncate py-1.5 text-white/60">{c.email}</td>
                    <td className="py-1.5 pr-3 text-right"><ShieldCheck size={12} className="inline text-emerald-400" aria-label="Verified contact" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </li>
      ))}
    </ul>
  );
}

function PaceTag({ g }: { g: ReturnType<typeof placeGroups>[number] }) {
  if (!g.started) return <span className="flex items-center gap-1 text-[10px] text-white/40"><Timer size={11} /> Upcoming</span>;
  if (g.finished) return <span className="text-[10px] text-white/40">Finished</span>;
  const tone = g.behindMin > LATE_MIN ? 'bg-red-500/15 text-red-300 ring-red-400/40' : g.behindMin > 5 ? 'bg-amber-400/10 text-amber-200 ring-amber-300/30' : 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30';
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ring-1 ${tone}`}>#{g.hole} · {g.behindMin > 0 ? `+${g.behindMin}m` : 'on pace'}</span>;
}

function Panel({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${glass} flex min-h-0 flex-col rounded-3xl p-3`}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-white/85">{title}</h2>
        {aside}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">{label}</span>
      <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.5)]' : 'bg-white/15'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'amber' }) {
  return (
    <span className="flex flex-col leading-none">
      <span className={`font-mono text-base font-semibold ${tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-300' : 'text-white'}`}>{value}</span>
      <span className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-white/45">{label}</span>
    </span>
  );
}

const Legend = ({ c, t }: { c: string; t: string }) => <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${c}`} />{t}</span>;

/** Offline / no-WebGL fallback: the same radar drawn as a vector plan of the course. */
function SvgRadar({ holes, dots, selected, onSelect }: { holes: { number: number; path: [number, number][] }[]; dots: RadarDot[]; selected: string | null; onSelect: (id: string) => void }) {
  const pts = holes.flatMap((h) => h.path);
  const [minLat, maxLat] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [minLng, maxLng] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = (maxLng - minLng) * k, h = maxLat - minLat;
  const xy = ([lat, lng]: [number, number]) => [((lng - minLng) * k) / w * 1000, (maxLat - lat) / h * 1000 * (h / w)] as const;
  const H = 1000 * (h / w);
  const color = { group: '#10b981', late: '#ef4444', order: '#fbbf24', hail: '#38bdf8' };
  return (
    <svg viewBox={`-60 -60 1120 ${H + 120}`} className="h-full w-full bg-[radial-gradient(circle_at_center,#052e1f,#000)]" role="img" aria-label="Course radar">
      {holes.map((hole) => <polyline key={hole.number} points={hole.path.map((p) => xy(p).join(',')).join(' ')} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={3} strokeDasharray="10 8" />)}
      {dots.map((d) => {
        const [x, y] = xy(d.at);
        return (
          <g key={d.id} onClick={() => onSelect(d.id)} className="cursor-pointer">
            {d.kind === 'late' && <circle cx={x} cy={y} r={14} fill="none" stroke="#ef4444" strokeWidth={3}><animate attributeName="r" from="12" to="40" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.9" to="0" dur="1.6s" repeatCount="indefinite" /></circle>}
            <circle cx={x} cy={y} r={selected === d.id ? 15 : 11} fill={color[d.kind]} stroke="#fff" strokeWidth={3} style={{ filter: `drop-shadow(0 0 8px ${color[d.kind]})` }}><title>{d.label}</title></circle>
          </g>
        );
      })}
    </svg>
  );
}
