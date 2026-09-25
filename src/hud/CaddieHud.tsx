import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Aperture, Check, ChevronLeft, Mountain, Thermometer, Wind } from 'lucide-react';
import { MapPlaceholder } from './MapPlaceholder';
import { playsLike, recommendClub, windArrowDeg, type Club, type Conditions } from '../lib/caddie';
import { createSecureStore } from '../lib/secureStore';

// --- Mock feeds (replace with GPS / course DB / weather API) ---
const HOLE = {
  number: 4,
  par: 4,
  bearingDeg: 20,
  /** Line distance + elevation delta to target from the lie after N strokes. */
  lies: [
    { line: 412, elev: -4 },
    { line: 164, elev: 5 },
    { line: 38, elev: 1 },
    { line: 6, elev: 0 },
  ],
};
const WEATHER = { tempF: 72, windMph: 12, windFromDeg: 225 };
const BAG: Club[] = [
  { label: 'Dr', carry: 265 }, { label: '3W', carry: 240 }, { label: '5W', carry: 225 },
  { label: '4i', carry: 200 }, { label: '5i', carry: 190 }, { label: '6i', carry: 178 },
  { label: '7i', carry: 166 }, { label: '8i', carry: 154 }, { label: '9i', carry: 142 },
  { label: 'PW', carry: 130 }, { label: '52°', carry: 110 }, { label: '56°', carry: 92 },
  { label: '60°', carry: 70 }, { label: 'Putter', carry: 0 },
];

interface Shot { club: string; line: number; playsLike: number; t: number }
interface RoundState { hole: number; shots: Shot[] }

const ROUND_KEY = 'eg.round';
const store = (() => {
  try {
    return createSecureStore(window.localStorage);
  } catch {
    return null; // storage blocked (private mode / sandboxed webview) — run in-memory
  }
})();

export interface Buddy { id: string; name: string; liveScore: string }

interface Props {
  onExit: () => void;
  buddies?: Buddy[];
  tournamentMode?: boolean;
}

const glass = 'bg-black/40 backdrop-blur-xl backdrop-saturate-150 border border-white/10 shadow-lg';
const scoreColor = (s: string) => (s.startsWith('-') ? 'text-red-400' : s === 'E' ? 'text-emerald-400' : 'text-white/90');
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function CaddieHud({ onExit, buddies = [], tournamentMode = false }: Props) {
  const [round, setRound] = useState<RoundState>({ hole: HOLE.number, shots: [] });
  const [justLogged, setJustLogged] = useState(false);
  const [puttView, setPuttView] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!store) {
      hydrated.current = true;
      return;
    }
    let alive = true;
    store.load<RoundState>(ROUND_KEY).then((saved) => {
      if (alive && saved?.hole === HOLE.number && Array.isArray(saved.shots)) setRound(saved);
      hydrated.current = true;
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (hydrated.current) void store?.save(ROUND_KEY, round);
  }, [round]);

  useEffect(() => {
    if (!justLogged) return;
    const id = setTimeout(() => setJustLogged(false), 1200);
    return () => clearTimeout(id);
  }, [justLogged]);

  const strokes = round.shots.length;
  const lie = HOLE.lies[Math.min(strokes, HOLE.lies.length - 1)];
  const conditions: Conditions = { ...WEATHER, elevationDeltaYds: lie.elev };

  const calc = playsLike(lie.line, HOLE.bearingDeg, conditions);
  const target = tournamentMode ? lie.line : calc.yards;
  const club = recommendClub(target, BAG);
  const arrowDeg = windArrowDeg(WEATHER.windFromDeg, HOLE.bearingDeg);
  const delta = calc.yards - lie.line;

  const logShot = () => {
    if (justLogged || !club) return;
    setRound((r) => ({ ...r, shots: [...r.shots, { club: club.label, line: lie.line, playsLike: target, t: Date.now() }] }));
    setJustLogged(true);
    navigator.vibrate?.(15);
  };

  return (
    <div className="relative h-full w-full overflow-hidden text-white select-none">
      <MapPlaceholder />

      {/* Center reticle */}
      <div className="pointer-events-none absolute left-1/2 top-[42%] short:hidden -translate-x-1/2 -translate-y-1/2 text-white/25">
        <div className="h-10 w-10 rounded-full border border-current" />
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
      </div>

      {/* ── Top overlays ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 pt-safe pl-safe pr-safe">
        {/* Top-left: hole / par / strokes */}
        <div className="pointer-events-auto flex items-start gap-2">
          <button
            onClick={onExit}
            aria-label="Exit round"
            className={`${glass} grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/80 active:scale-95 transition`}
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <div className={`${glass} flex items-stretch gap-3 rounded-2xl px-3 py-2`}>
            <div className="flex flex-col justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50">Hole</span>
              <span className="font-mono text-3xl font-semibold leading-none tabular-nums">{HOLE.number}</span>
            </div>
            <span className="w-px bg-white/15" />
            <dl className="flex flex-col justify-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider">
              <div className="flex justify-between gap-3">
                <dt className="text-white/50">Par</dt>
                <dd className="font-mono tabular-nums">{HOLE.par}</dd>
              </div>
              <div className="flex justify-between gap-3 text-emerald-400">
                <dt>Strokes</dt>
                <dd className="font-mono tabular-nums">{strokes}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Top-right: weather */}
        <div className={`${glass} pointer-events-auto flex shrink-0 flex-col gap-1.5 rounded-2xl px-3 py-2`}>
          <span className="flex items-center justify-end gap-1.5 font-mono text-base font-semibold leading-none tabular-nums">
            <Thermometer size={13} className="text-amber-300" />
            {WEATHER.tempF}°F
          </span>
          <span className="h-px bg-white/10" />
          <span className="flex items-center justify-end gap-1.5" title="Wind relative to target line (up = helping)">
            <ArrowUp size={14} className="text-sky-300 transition-transform" style={{ transform: `rotate(${arrowDeg}deg)` }} />
            <span className="font-mono text-base font-semibold leading-none tabular-nums">
              {WEATHER.windMph}
              <span className="ml-0.5 text-[10px] font-bold uppercase text-white/50">mph</span>
            </span>
          </span>
        </div>
      </header>

      {/* ── Bottom sheet ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-safe pl-safe pr-safe">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
          <div className="flex items-end justify-between gap-2 short:hidden">
            {buddies.length > 0 ? (
              <div className={`${glass} pointer-events-auto flex gap-3 overflow-x-auto no-scrollbar rounded-full px-3 py-1.5`}>
                {buddies.map((b) => (
                  <span key={b.id} className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold">
                    <span className="text-white/70">{b.name.split(' ')[0]}</span>
                    <span className={`font-mono ${scoreColor(b.liveScore)}`}>{b.liveScore}</span>
                  </span>
                ))}
              </div>
            ) : <span />}
            <button
              onClick={() => setPuttView((v) => !v)}
              aria-pressed={puttView}
              className={`pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 backdrop-blur-xl transition active:scale-95 ${
                puttView ? 'border-emerald-400 bg-emerald-500 text-black' : 'border-white/10 bg-black/50 text-emerald-400'
              }`}
            >
              <Aperture size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Putt View</span>
            </button>
          </div>

          <section
            aria-label="Shot caddie"
            className="pointer-events-auto rounded-[28px] border border-white/10 bg-white/[0.07] p-4 shadow-[0_-8px_40px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/5 backdrop-blur-2xl backdrop-saturate-150 short:p-3"
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/25 short:hidden" />

            {/* Line vs Plays Like */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Line</div>
                <div className="font-mono text-4xl font-light leading-none tabular-nums short:text-3xl">
                  {lie.line}<span className="ml-0.5 text-base text-white/40">y</span>
                </div>
              </div>
              <div className="mb-1 h-10 w-px bg-white/10" />
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/80">Plays Like</div>
                <div className="font-mono text-4xl font-semibold leading-none text-emerald-400 tabular-nums short:text-3xl">
                  {tournamentMode ? '—' : target}
                  {!tournamentMode && <span className="ml-0.5 text-base text-emerald-400/50">y</span>}
                </div>
              </div>
            </div>

            {/* Adjustment breakdown */}
            <div className="mt-3 flex flex-wrap gap-1.5 short:hidden">
              {tournamentMode ? (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  Tournament mode · adjustments off
                </span>
              ) : (
                <>
                  <Chip icon={<Wind size={11} />} label="Wind" value={calc.windAdj} />
                  <Chip icon={<Mountain size={11} />} label="Elev" value={calc.elevAdj} />
                  <Chip icon={<Thermometer size={11} />} label="Temp" value={calc.tempAdj} />
                  <span className="ml-auto self-center font-mono text-[11px] text-white/50">{signed(delta)}y net</span>
                </>
              )}
            </div>

            {/* Recommended club */}
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Recommended</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight">{club?.label ?? '—'}</span>
                {club && club.carry > 0 && <span className="font-mono text-[11px] text-white/40">{club.carry}y carry</span>}
              </div>
            </div>

            {/* Log Shot */}
            <button
              onClick={logShot}
              disabled={justLogged}
              className={`mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black uppercase tracking-[0.2em] transition active:scale-[0.98] ${
                justLogged
                  ? 'bg-white/10 text-white/60'
                  : 'bg-emerald-500 text-black shadow-[0_0_24px_rgba(16,185,129,0.35)] hover:bg-emerald-400'
              }`}
            >
              {justLogged ? (<><Check size={18} strokeWidth={3} /> Logged</>) : 'Log Shot'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  const tone = value > 0 ? 'text-rose-300' : value < 0 ? 'text-sky-300' : 'text-white/50';
  return (
    <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/60">
      {icon}
      {label}
      <span className={`font-mono ${tone}`}>{signed(value)}</span>
    </span>
  );
}
