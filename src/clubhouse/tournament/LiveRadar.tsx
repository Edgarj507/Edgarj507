import { lazy, Suspense, useMemo, useRef, useState, type PointerEvent as RPE, type WheelEvent as RWE } from 'react';
import { FastForward, Radar, Truck } from 'lucide-react';
import { imageryProvider } from '../../map/providers';
import { isOpenOrder, type Order } from '../../ops/model';
import type { placeGroups } from '../../ops/pace';
import type { RadarDot } from './RadarMap';
import { ZoomControls } from './ZoomControls';
import { Queue } from '../Queue';
import { glass, hhmm, Panel, Stat } from '../ui';

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
  onStatus: (id: string, s: Order['status'], label: string) => void;
  /** Demo: positions are simulated; lets staff fast-forward the event clock. */
  onFastForward?: () => void;
  /** Beverage carts / SOS pins shown on top of groups and orders. */
  extraDots?: RadarDot[];
}

/** Live Event mode: God-mode pace radar (left) + fulfillment queue (right). Mounted only while live. */
export function LiveRadar({ holes, placed, alertMin, orders, now, liveSince, selected, onSelect, onStatus, onFastForward, extraDots = [] }: Props) {
  const [mapFailed, setMapFailed] = useState(!PROVIDER);
  const onCourse = placed.filter((g) => g.at);
  const late = onCourse.filter((g) => g.behindMin > alertMin);
  const active = orders.filter(isOpenOrder);

  const dots: RadarDot[] = useMemo(() => [
    ...onCourse.map((g) => ({
      id: g.group.id, at: g.at!, kind: (g.behindMin > alertMin ? 'late' : 'group') as RadarDot['kind'],
      label: `${g.group.name} · hole ${g.hole} · ${g.behindMin > 0 ? `+${g.behindMin} min` : 'on pace'}`,
    })),
    ...active.map((o) => ({ id: o.id, at: [o.lat, o.lng] as LL, kind: o.kind === 'hail' ? 'hail' as const : 'order' as const, label: `${o.kind === 'hail' ? 'Cart hail' : 'Order'} · ${o.player} · hole ${o.hole}` })),
    ...extraDots,
  ], [onCourse, active, alertMin, extraDots]);
  const sel = placed.find((g) => g.group.id === selected);
  const elapsed = Math.max(0, Math.round((now - liveSince) / 60_000));

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 @4xl:grid-cols-[1.5fr_1fr] @4xl:grid-rows-[minmax(0,1fr)]" data-testid="live-radar">
      <section aria-label="Pace of play radar" className="relative min-h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-black">
        {mapFailed || !PROVIDER ? (
          <SvgRadar holes={holes} dots={dots} selected={selected} onSelect={onSelect} />
        ) : (
          <Suspense fallback={<SvgRadar holes={holes} dots={dots} selected={selected} onSelect={onSelect} />}>
            <RadarMap provider={PROVIDER} holes={holes} dots={dots} selected={selected} onSelect={onSelect} onFail={() => setMapFailed(true)} />
          </Suspense>
        )}
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.75)]" />
        {/* Top overlays wrap instead of overlapping when the radar is narrow (in-house split view). */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <div className={`${glass} pointer-events-auto flex items-center gap-5 rounded-2xl px-3 py-2`}>
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><Radar size={13} /> God-mode</span>
            <Stat label="On course" value={onCourse.length} />
            <Stat label={`>${alertMin}m behind`} value={late.length} tone={late.length ? 'red' : undefined} />
            <Stat label="Elapsed" value={`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`} />
          </div>
          {onFastForward && (
            <button onClick={onFastForward} className={`${glass} pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/70`} title="Positions are simulated in demo mode">
              <FastForward size={12} /> Demo clock +15 min
            </button>
          )}
        </div>
        <div className={`${glass} absolute bottom-3 left-3 flex gap-3 rounded-xl px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/60`}>
          <Legend c="bg-emerald-500" t="On pace" /><Legend c="bg-red-500" t="Behind" /><Legend c="bg-amber-400" t="Order" /><Legend c="bg-sky-400" t="Hail" /><Legend c="bg-violet-400" t="Cart" />
        </div>
        {sel && (
          <div className={`${glass} absolute bottom-3 right-3 w-60 rounded-2xl p-3`} role="status">
            <div className="flex items-center justify-between text-[12px] font-bold">{sel.group.name}<span className="font-mono text-[10px] text-white/50">{hhmm(sel.group.teeTime)}</span></div>
            <div className="text-[11px] text-white/60">{sel.group.players.join(', ')}</div>
            <div className={`mt-1 text-[11px] font-bold ${sel.behindMin > alertMin ? 'text-red-400' : 'text-emerald-300'}`}>Hole {sel.hole} · {sel.behindMin > 0 ? `+${sel.behindMin} min behind` : 'on pace'}</div>
          </div>
        )}
      </section>

      {/* Right column: the queue grows with its orders from 25% to 50% of the screen height;
          the pace board takes whatever is left. Both scroll. */}
      <div className="flex min-h-0 flex-col gap-3">
        <Panel label="Fulfillment queue panel" title={<><Truck size={13} /> Fulfillment Queue</>} scroll="thin"
          aside={<span className="font-mono text-[10px] text-white/50">{active.length} open</span>}
          className="shrink-0 transition-[height] duration-500 ease-out"
          style={{ height: `clamp(25vh, calc(104px + ${active.length} * 118px), 50vh)` }}>
          <Queue orders={orders} now={now} selected={selected} onSelect={onSelect} onStatus={onStatus} />
        </Panel>
        <Panel label="Pace board panel" title={<>Pace board</>} scroll="thin" className="min-h-[160px] flex-1" aside={<span className="text-[10px] text-white/45">{onCourse.length} groups · slowest first</span>}>
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

/**
 * Offline / no-WebGL fallback: the same radar drawn as a vector plan of the course. Zoom and pan
 * change only the SVG viewBox, and every pin is drawn in the same user-space coordinates as the
 * holes, so pins cannot drift from their positions at any zoom level.
 */
function SvgRadar({ holes, dots, selected, onSelect }: { holes: { number: number; path: LL[] }[]; dots: RadarDot[]; selected: string | null; onSelect: (id: string) => void }) {
  const pts = holes.flatMap((h) => h.path);
  const [minLat, maxLat] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [minLng, maxLng] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = (maxLng - minLng) * k, h = maxLat - minLat;
  const xy = ([lat, lng]: LL) => [((lng - minLng) * k) / w * 1000, (maxLat - lat) / h * 1000 * (h / w)] as const;
  const H = 1000 * (h / w);
  const home = { x: -60, y: -60, w: 1120, h: H + 120 };
  const [vb, setVb] = useState(home);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof home } | null>(null);
  const scale = home.w / vb.w; // >1 when zoomed in; keeps pin size constant on screen
  const color = { group: '#10b981', late: '#ef4444', order: '#fbbf24', hail: '#38bdf8', cart: '#a78bfa', sos: '#dc2626' };

  const zoomAt = (factor: number, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => setVb((v) => {
    const nw = Math.min(home.w, Math.max(home.w / 8, v.w / factor));
    const f = nw / v.w;
    return { x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, w: nw, h: v.h * f };
  });
  const toUser = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    // preserveAspectRatio xMidYMid meet: uniform scale, centered
    const s = Math.min(r.width / vb.w, r.height / vb.h);
    return { x: vb.x + (clientX - r.left - (r.width - vb.w * s) / 2) / s, y: vb.y + (clientY - r.top - (r.height - vb.h * s) / 2) / s, s };
  };
  const onWheel = (e: RWE<SVGSVGElement>) => { const p = toUser(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y); };
  const onDown = (e: RPE<SVGSVGElement>) => { if ((e.target as Element).closest('[data-radar-id]')) return; drag.current = { x: e.clientX, y: e.clientY, vb }; svg.current?.setPointerCapture(e.pointerId); };
  const onMove = (e: RPE<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const s = toUser(e.clientX, e.clientY).s;
    setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) / s, y: d.vb.y - (e.clientY - d.y) / s });
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className="relative h-full w-full">
      <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="h-full w-full touch-none select-none bg-[radial-gradient(circle_at_center,#052e1f,#000)]" role="img" aria-label="Course radar" data-testid="svg-radar"
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {holes.map((hole) => <polyline key={hole.number} points={hole.path.map((p) => xy(p).join(',')).join(' ')} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={3 / scale} strokeDasharray={`${10 / scale} ${8 / scale}`} />)}
        {dots.map((d) => {
          const [x, y] = xy(d.at);
          const r = (selected === d.id ? 15 : d.kind === 'sos' ? 16 : 11) / scale;
          return (
            <g key={d.id} data-radar-id={d.id} role="button" aria-label={d.label} onClick={() => onSelect(d.id)} className="cursor-pointer">
              {(d.kind === 'late' || d.kind === 'sos') && <circle cx={x} cy={y} r={14 / scale} fill="none" stroke={color[d.kind]} strokeWidth={3 / scale}><animate attributeName="r" from={12 / scale} to={40 / scale} dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.9" to="0" dur="1.6s" repeatCount="indefinite" /></circle>}
              {d.kind === 'cart' || d.kind === 'order' || d.kind === 'hail'
                ? <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={4 / scale} fill={color[d.kind]} stroke="#fff" strokeWidth={3 / scale} style={{ filter: `drop-shadow(0 0 8px ${color[d.kind]})` }}><title>{d.label}</title></rect>
                : <circle cx={x} cy={y} r={r} fill={color[d.kind]} stroke="#fff" strokeWidth={3 / scale} style={{ filter: `drop-shadow(0 0 8px ${color[d.kind]})` }}><title>{d.label}</title></circle>}
            </g>
          );
        })}
      </svg>
      <ZoomControls onIn={() => zoomAt(1.5)} onOut={() => zoomAt(1 / 1.5)} onFit={() => setVb(home)} />
    </div>
  );
}
