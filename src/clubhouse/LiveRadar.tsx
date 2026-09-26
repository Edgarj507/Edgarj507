import { lazy, Suspense, useMemo, useState } from 'react';
import { FastForward, Radar, Truck } from 'lucide-react';
import { imageryProvider } from '../map/providers';
import type { Order } from '../ops/model';
import type { placeGroups } from '../ops/pace';
import type { RadarDot } from './RadarMap';
import { Queue } from './Queue';
import { glass, hhmm, Panel, Stat } from './ui';

const RadarMap = lazy(() => import('./RadarMap'));
const PROVIDER = imageryProvider();

type Placed = ReturnType<typeof placeGroups>[number];
type LL = [number, number];

interface Props {
  holes: { number: number; path: LL[] }[];
  placed: Placed[];
  alertMin: number;
  orders: Order[];
  now: number;
  liveSince: number;
  selected: string | null;
  onSelect: (id: string) => void;
  onStatus: (id: string, s: Order['status']) => void;
  /** Demo: positions are simulated; lets staff fast-forward the event clock. */
  onFastForward?: () => void;
}

/** Live Event mode: God-mode pace radar (left) + fulfillment queue (right). Mounted only while live. */
export function LiveRadar({ holes, placed, alertMin, orders, now, liveSince, selected, onSelect, onStatus, onFastForward }: Props) {
  const [mapFailed, setMapFailed] = useState(!PROVIDER);
  const onCourse = placed.filter((g) => g.at);
  const late = onCourse.filter((g) => g.behindMin > alertMin);
  const active = orders.filter((o) => o.status !== 'delivered');

  const dots: RadarDot[] = useMemo(() => [
    ...onCourse.map((g) => ({
      id: g.group.id, at: g.at!, kind: (g.behindMin > alertMin ? 'late' : 'group') as RadarDot['kind'],
      label: `${g.group.name} · hole ${g.hole} · ${g.behindMin > 0 ? `+${g.behindMin} min` : 'on pace'}`,
    })),
    ...active.map((o) => ({ id: o.id, at: [o.lat, o.lng] as LL, kind: o.kind === 'hail' ? 'hail' as const : 'order' as const, label: `${o.kind === 'hail' ? 'Cart hail' : 'Order'} · ${o.player} · hole ${o.hole}` })),
  ], [onCourse, active, alertMin]);
  const sel = placed.find((g) => g.group.id === selected);
  const elapsed = Math.max(0, Math.round((now - liveSince) / 60_000));

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 @4xl:grid-cols-[1.5fr_1fr]" data-testid="live-radar">
      <section aria-label="Pace of play radar" className="relative min-h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-black">
        {mapFailed || !PROVIDER ? (
          <SvgRadar holes={holes} dots={dots} selected={selected} onSelect={onSelect} />
        ) : (
          <Suspense fallback={<SvgRadar holes={holes} dots={dots} selected={selected} onSelect={onSelect} />}>
            <RadarMap provider={PROVIDER} holes={holes} dots={dots} selected={selected} onSelect={onSelect} onFail={() => setMapFailed(true)} />
          </Suspense>
        )}
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.75)]" />
        <div className={`${glass} absolute left-3 top-3 flex items-center gap-5 rounded-2xl px-3 py-2`}>
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><Radar size={13} /> God-mode</span>
          <Stat label="On course" value={onCourse.length} />
          <Stat label={`>${alertMin}m behind`} value={late.length} tone={late.length ? 'red' : undefined} />
          <Stat label="Elapsed" value={`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`} />
        </div>
        {onFastForward && (
          <button onClick={onFastForward} className={`${glass} absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/70`} title="Positions are simulated in demo mode">
            <FastForward size={12} /> Demo clock +15 min
          </button>
        )}
        <div className={`${glass} absolute bottom-3 left-3 flex gap-3 rounded-xl px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/60`}>
          <Legend c="bg-emerald-500" t="On pace" /><Legend c="bg-red-500" t="Behind" /><Legend c="bg-amber-400" t="Order" /><Legend c="bg-sky-400" t="Hail" />
        </div>
        {sel && (
          <div className={`${glass} absolute bottom-3 right-3 w-60 rounded-2xl p-3`} role="status">
            <div className="flex items-center justify-between text-[12px] font-bold">{sel.group.name}<span className="font-mono text-[10px] text-white/50">{hhmm(sel.group.teeTime)}</span></div>
            <div className="text-[11px] text-white/60">{sel.group.players.join(', ')}</div>
            <div className={`mt-1 text-[11px] font-bold ${sel.behindMin > alertMin ? 'text-red-400' : 'text-emerald-300'}`}>Hole {sel.hole} · {sel.behindMin > 0 ? `+${sel.behindMin} min behind` : 'on pace'}</div>
          </div>
        )}
      </section>

      <div className="grid min-h-0 grid-rows-[minmax(240px,1fr)_minmax(200px,0.8fr)] gap-3">
        <Panel title={<><Truck size={13} /> Fulfillment Queue</>} aside={<span className="font-mono text-[10px] text-white/50">{active.length} open</span>}>
          <Queue orders={orders} now={now} selected={selected} onSelect={onSelect} onStatus={onStatus} />
        </Panel>
        <Panel title={<>Pace board</>} aside={<span className="text-[10px] text-white/45">slowest first</span>}>
          <ul className="flex flex-col gap-1">
            {[...onCourse].sort((a, b) => b.behindMin - a.behindMin).map((g) => (
              <li key={g.group.id}>
                <button onClick={() => onSelect(g.group.id)} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-[11px] ${selected === g.group.id ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/5 bg-white/[0.03]'}`}>
                  <span className="min-w-0 flex-1 truncate font-semibold">{g.group.name}</span>
                  <span className="font-mono text-white/50">#{g.hole}</span>
                  <span className={`w-16 rounded-full px-2 py-0.5 text-center font-mono text-[10px] ring-1 ${g.behindMin > alertMin ? 'bg-red-500/15 text-red-300 ring-red-400/40' : g.behindMin > 5 ? 'bg-amber-400/10 text-amber-200 ring-amber-300/30' : 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30'}`}>{g.behindMin > 0 ? `+${g.behindMin}m` : 'on pace'}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

const Legend = ({ c, t }: { c: string; t: string }) => <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${c}`} />{t}</span>;

/** Offline / no-WebGL fallback: the same radar drawn as a vector plan of the course. */
function SvgRadar({ holes, dots, selected, onSelect }: { holes: { number: number; path: LL[] }[]; dots: RadarDot[]; selected: string | null; onSelect: (id: string) => void }) {
  const pts = holes.flatMap((h) => h.path);
  const [minLat, maxLat] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [minLng, maxLng] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = (maxLng - minLng) * k, h = maxLat - minLat;
  const xy = ([lat, lng]: LL) => [((lng - minLng) * k) / w * 1000, (maxLat - lat) / h * 1000 * (h / w)] as const;
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
