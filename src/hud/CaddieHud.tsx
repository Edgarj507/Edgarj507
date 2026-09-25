import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Aperture, Check, ChevronLeft, Flag, Mountain, Thermometer } from 'lucide-react';
import { MapPlaceholder } from './MapPlaceholder';
import { playsLike, recommendClub, windArrowDeg, type Club, type Conditions } from '../lib/caddie';
import { createSecureStore } from '../lib/secureStore';

// --- Mock feeds (replace with GPS / course DB / weather API) ---
const HOLE = {
  number: 4,
  par: 4,
  bearingDeg: 20,
  /** Per lie after N strokes: line = yards to the aim target, pin = yards to the flag, elev = target elevation delta (yds). */
  lies: [
    { line: 250, pin: 412, elev: -4 },
    { line: 164, pin: 164, elev: 5 },
    { line: 38, pin: 38, elev: 1 },
    { line: 6, pin: 6, elev: 0 },
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

        {/* Top-right: weather → elevation → distance to pin */}
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-1.5">
          <div className={`${glass} flex flex-col gap-1.5 rounded-2xl px-3 py-2`}>
            <span className="flex items-center justify-end gap-1.5 font-mono text-sm font-semibold leading-none tabular-nums">
              <Thermometer size={12} className="text-amber-300" />
              {WEATHER.tempF}°F
            </span>
            <span className="h-px bg-white/10" />
            <span className="flex items-center justify-end gap-1.5" title="Wind relative to target line (up = helping)">
              <ArrowUp size={13} className="text-sky-300 transition-transform" style={{ transform: `rotate(${arrowDeg}deg)` }} />
              <span className="font-mono text-sm font-semibold leading-none tabular-nums">
                {WEATHER.windMph}
                <span className="ml-0.5 text-[9px] font-bold uppercase text-white/50">mph</span>
              </span>
            </span>
          </div>

          {!tournamentMode && (
            <div className={`${glass} flex items-center gap-1.5 rounded-xl px-2.5 py-1.5`} title="Target elevation vs. ball">
              <Mountain size={12} className="text-white/60" />
              {lie.elev !== 0 && (lie.elev > 0
                ? <ArrowUp size={11} className="text-rose-300" />
                : <ArrowDown size={11} className="text-sky-300" />)}
              <span className="font-mono text-xs font-semibold leading-none tabular-nums">
                {Math.abs(lie.elev)}<span className="text-white/50">y</span>
              </span>
              <span className="text-[9px] font-bold uppercase leading-none tracking-wider text-white/50">
                {lie.elev > 0 ? 'Up' : lie.elev < 0 ? 'Down' : 'Flat'}
              </span>
            </div>
          )}

          <div className={`${glass} flex items-center gap-1.5 rounded-xl px-2.5 py-1.5`}>
            <Flag size={12} className="text-red-400" />
            <span className="font-mono text-xs font-semibold leading-none tabular-nums">
              {lie.pin}<span className="text-white/50">y</span>
            </span>
            <span className="text-[9px] font-bold uppercase leading-none tracking-wider text-white/50">Pin</span>
          </div>
        </div>
      </header>

      {/* ── Bottom sheet ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-safe pl-safe pr-safe">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
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
            className="pointer-events-auto rounded-3xl border border-white/10 bg-white/[0.07] p-2.5 shadow-[0_-8px_40px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/5 backdrop-blur-2xl backdrop-saturate-150"
          >
            {/* Line · Plays Like · Club */}
            <div className="grid grid-cols-3 divide-x divide-white/10 px-1 pb-2.5 pt-1">
              <Stat label="Line" value={lie.line} />
              <Stat label="Plays Like" value={tournamentMode ? '—' : target} accent />
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">Club</span>
                <span className="text-2xl font-black leading-tight tracking-tight">{club?.label ?? '—'}</span>
              </div>
            </div>

            {/* Log Shot */}
            <button
              onClick={logShot}
              disabled={justLogged}
              className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition active:scale-[0.98] ${
                justLogged
                  ? 'bg-white/10 text-white/60'
                  : 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-400'
              }`}
            >
              {justLogged ? (<><Check size={16} strokeWidth={3} /> Logged</>) : 'Log Shot'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${accent ? 'text-emerald-400/80' : 'text-white/50'}`}>{label}</span>
      <span className={`font-mono text-2xl leading-tight tabular-nums ${accent ? 'font-semibold text-emerald-400' : 'font-light'}`}>
        {value}
        {typeof value === 'number' && <span className={`ml-0.5 text-xs ${accent ? 'text-emerald-400/50' : 'text-white/40'}`}>y</span>}
      </span>
    </div>
  );
}
