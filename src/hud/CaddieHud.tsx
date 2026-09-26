import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Aperture, Check, ChevronLeft, BadgeCheck, ChevronRight, Cloud, CloudOff, Flag, HandCoins, Users, RotateCcw, ShieldHalf, Volume2, VolumeX } from 'lucide-react';
import { MapPlaceholder } from './MapPlaceholder';
import { imageryProvider } from '../map/providers';
import { aimPosition, ballPosition, holeGeometry, shotBearing } from '../map/geometry';

// MapLibre (~250 KB gz) loads only when the HUD opens.
const SatelliteMap = lazy(() => import('../map/SatelliteMap'));
const PROVIDER = imageryProvider();
import { PuttView } from './PuttView';
import { playsLike, recommendClub, windArrowDeg, type Club, type Conditions } from '../lib/caddie';
import { lieFor, type Hole, type TeeId } from '../data/course';
import { usePrefs } from '../i18n/prefs';
import { usePinFeed } from '../lib/pinFeed';
import { bearingDeg, distanceM, liveDistance } from '../../supabase/functions/_shared/pins.ts';
import { mulligansLeft, type Format, type MulliganLedger, type Outcome, type Shot } from '../lib/round';
import { ShotModal } from './ShotModal';
import { MulliganSheet } from './MulliganSheet';
import { caddiePhrase, speak, speechAvailable } from '../lib/voiceCaddie';
import type { ClubStats } from '../lib/hooks';
import type { SyncStatus } from '../lib/sync';

// Mock weather feed (replace with weather API).
const WEATHER = { tempF: 72, windMph: 12, windFromDeg: 225, rainPct: 20, uv: 6 };

export interface Buddy { id: string; name: string; liveScore: string }

interface Props {
  hole: Hole;
  tee: TeeId;
  strokes: number;
  /** Format-aware running score for finished holes, e.g. "+2", "12 pts", "1 UP". */
  roundScore: string;
  format: Format;
  isLastHole: boolean;
  bag: Club[];
  onLog: (shot: Shot) => void;
  onUndo: () => void;
  onNext: () => void;
  onScorecard: () => void;
  onExit: () => void;
  buddies?: Buddy[];
  tournamentMode?: boolean;
  sync?: SyncStatus;
  courseName: string;
  courseAttribution: string;
  /** Server round id, enabling the live community pin network. */
  remoteRoundId?: string;
  /** Every hole's centre line (Course Guardian wireframe). */
  holeLines?: [number, number][][];
  clubStats?: ClubStats;
  /** Scramble charity ledger, when mulligan packs were sold. */
  ledger?: MulliganLedger;
  onMulligan?: (player: string) => void;
  onUnmulligan?: (index: number) => void;
}

const M_TO_YD = 1.09361;

const TEE_DOT: Record<TeeId, string> = { black: 'bg-zinc-900 ring-zinc-500', blue: 'bg-blue-600 ring-blue-300', white: 'bg-gray-100 ring-white', red: 'bg-red-600 ring-red-300' };
const FORMAT_TAG: Record<Format, string> = {
  'Stroke Play': 'Card', 'Match Play': 'Match', 'Stableford': 'Stbl', 'Scramble': 'Team', 'Best Ball': 'Team', 'Alt Shot': 'Team',
};

const glass = 'bg-black/40 backdrop-blur-xl backdrop-saturate-150 border border-white/10 shadow-lg';
const scoreColor = (s: string) => (s.startsWith('-') ? 'text-red-400' : s === 'E' ? 'text-emerald-400' : 'text-white/90');

export function CaddieHud({
  hole, tee, strokes, roundScore, format, isLastHole, bag, onLog, onUndo, onNext, onScorecard, onExit, buddies = [], tournamentMode = false, sync = 'off', remoteRoundId, courseName, courseAttribution,
  holeLines, clubStats = {}, ledger, onMulligan, onUnmulligan,
}: Props) {
  const [justLogged, setJustLogged] = useState(false);
  const [puttView, setPuttView] = useState(false);
  const [picking, setPicking] = useState(false);
  const [mullOpen, setMullOpen] = useState(false);
  const [ballBy, setBallBy] = useState('me');

  useEffect(() => {
    if (!justLogged) return;
    const id = setTimeout(() => setJustLogged(false), 900);
    return () => clearTimeout(id);
  }, [justLogged]);

  const { t, d, u, units, lang, communityPins, voice, guardian, set } = usePrefs();
  const lie = lieFor(hole, strokes);
  const conditions: Conditions = { ...WEATHER, elevationDeltaYds: lie.elev };

  // Real course geometry: ball sits on the mapped hole line, `lie.pin` yards from the green centre.
  const [mapFailed, setMapFailed] = useState(!PROVIDER);
  const geo = useMemo(() => holeGeometry(hole), [hole]);
  const ball = useMemo(() => ballPosition(geo, lie.pin), [geo, lie.pin]);
  // Line of play into the green (doglegs make this differ from the tee → green bearing).
  const approachBearing = distanceM(ball, geo.green) > 1 ? bearingDeg(ball, geo.green) : hole.bearingDeg;

  // Static course data measures to the green centre; the community pin shifts it along/across
  // the line of play. When the shot is aimed at the flag, the aim line moves with it.
  const pins = usePinFeed({ holeNo: hole.number, bearingDeg: approachBearing, courseName, green: geo.green, enabled: communityPins, remoteRoundId });
  const pinYds = Math.max(1, Math.round(liveDistance(lie.pin, pins.depthM * M_TO_YD, pins.lateralM * M_TO_YD)));
  const lineYds = lie.line === lie.pin ? pinYds : lie.line;
  const pinNote = (() => {
    const k = units === 'meters' ? 1 : M_TO_YD;
    const unit = units === 'meters' ? 'm' : 'yd';
    const parts: string[] = [];
    const dep = Math.round(Math.abs(pins.depthM) * k);
    const lat = Math.round(Math.abs(pins.lateralM) * k);
    if (dep >= 1) parts.push(`${dep}${unit} ${t(pins.depthM < 0 ? 'hud.front' : 'hud.back')}`);
    if (lat >= 1) parts.push(`${lat}${unit} ${t(pins.lateralM < 0 ? 'hud.left' : 'hud.right')}`);
    return parts.length ? parts : [t('hud.centre')];
  })();

  const pinLL = useMemo(() => (pins.live ? { lat: pins.live.lat, lng: pins.live.lng } : geo.green), [pins.live?.lat, pins.live?.lng, geo]);
  const aim = useMemo(() => aimPosition(geo, lie.pin, lineYds, pinLL), [geo, lie.pin, lineYds, pinLL]);
  // Direction of this shot drives the map rotation, wind components and the wind arrow.
  const playBearing = distanceM(ball, aim) > 1 ? shotBearing(ball, aim) : approachBearing;
  const fmtMeters = useCallback((m: number) => `${d(m / 0.9144)}${u}`, [d, u]);
  const mapLabels = useMemo(() => ({ target: t('hud.target'), toPin: t('hud.toPin'), recenter: t('hud.recenter') }), [t]);

  const calc = playsLike(lineYds, playBearing, conditions);
  const target = tournamentMode ? lineYds : calc.yards;
  // Putter only once within 20y; otherwise recommend from full-swing clubs.
  const club = lie.pin <= 20 ? bag.find((c) => c.carry === 0) ?? recommendClub(target, bag) : recommendClub(target, bag.filter((c) => c.carry > 0));
  const arrowDeg = windArrowDeg(WEATHER.windFromDeg, playBearing);

  const players = useMemo(() => [{ id: 'me', name: t('card.you') }, ...buddies.map((b) => ({ id: b.id, name: b.name.split(' ')[0] }))], [buddies, t]);
  const isScramble = format === 'Scramble';

  const logShot = () => {
    if (justLogged || !club) return;
    setPicking(true);
  };
  const commitShot = (outcome: Outcome | undefined) => {
    if (!club) return;
    setPicking(false);
    onLog({ club: club.label, line: lineYds, playsLike: target, t: Date.now(), ...(outcome ? { outcome } : {}), ...(isScramble ? { by: ballBy } : {}) });
    setJustLogged(true);
    navigator.vibrate?.(15);
  };

  // AI voice caddie: announce the numbers whenever the lie changes (new shot or hole).
  const phrase = caddiePhrase({ pin: d(pinYds), line: d(lineYds), playsLike: tournamentMode ? null : d(target), club: club?.label, unit: units, lang });
  useEffect(() => {
    if (!voice) return;
    const id = setTimeout(() => speak(phrase, lang), 500);
    return () => clearTimeout(id);
    // Speak on lie changes, not on every re-render of the same numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice, hole.number, strokes]);
  const toggleVoice = () => {
    const next = !voice;
    set({ voice: next });
    if (next) speak(phrase, lang);
    else if (speechAvailable()) window.speechSynthesis.cancel();
  };

  const mullLeft = ledger ? players.reduce((a, p) => a + Math.max(0, mulligansLeft(ledger, p.id)), 0) : 0;

  return (
    <div className={`relative h-full w-full overflow-hidden text-white select-none ${guardian ? 'eg-guardian' : ''}`}>
      {/* Layer 0: live satellite map (gestures reach it wherever no widget sits above). */}
      {mapFailed || !PROVIDER ? (
        <>
          <MapPlaceholder />
          <div className="pointer-events-none absolute left-1/2 top-[42%] short:hidden -translate-x-1/2 -translate-y-1/2 text-white/25">
            <div className="h-10 w-10 rounded-full border border-current" />
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          </div>
        </>
      ) : (
        <Suspense fallback={<MapPlaceholder />}>
          <SatelliteMap
            provider={PROVIDER}
            bearing={playBearing}
            holeKey={hole.number}
            ball={ball}
            aim={aim}
            pin={pinLL}
            fmt={fmtMeters}
            labels={mapLabels}
            onFail={() => setMapFailed(true)}
            guardian={guardian}
            holeLines={holeLines}
          />
        </Suspense>
      )}

      {/* ── Top overlays ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 pt-safe pl-safe pr-safe">
        {/* Top-left: hole / par / strokes, distance to pin below */}
        <div className="pointer-events-auto flex flex-col items-start gap-1.5">
        <div className="flex items-start gap-2">
          <button
            onClick={onExit}
            aria-label="Exit round"
            className={`${glass} grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/80 active:scale-95 transition`}
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <button
            onClick={onScorecard}
            aria-label="Open scorecard"
            className={`${glass} flex items-stretch gap-3 rounded-2xl px-3 py-2 text-left transition active:scale-[0.98]`}
          >
            <div className="flex flex-col justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50">{t('hud.hole')}</span>
              <span className="font-mono text-3xl font-semibold leading-none tabular-nums">{hole.number}</span>
              <span className="mt-1 flex items-center gap-1 font-mono text-[10px] text-white/50">
                <span className={`h-2 w-2 rounded-full ring-1 ${TEE_DOT[tee]}`} />
                {d(hole.yards)}{u}
              </span>
            </div>
            <span className="w-px bg-white/15" />
            <dl className="flex flex-col justify-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider">
              <div className="flex justify-between gap-3">
                <dt className="text-white/50">{t('hud.par')}</dt>
                <dd className="font-mono tabular-nums">{hole.par}</dd>
              </div>
              <div className="flex justify-between gap-3 text-emerald-400">
                <dt>{t('hud.strokes')}</dt>
                <dd className="font-mono tabular-nums">{strokes}</dd>
              </div>
              <div className="flex justify-between gap-3 text-[9px] text-white/40">
                <dt className="flex items-center gap-1">
                  {FORMAT_TAG[format]}
                  {sync !== 'off' && (sync === 'error'
                    ? <CloudOff size={9} className="text-amber-300" aria-label="Sync pending retry" />
                    : <Cloud size={9} className={sync === 'pending' ? 'animate-pulse text-sky-300' : 'text-emerald-400'} aria-label={sync === 'pending' ? 'Syncing' : 'Synced'} />)}
                </dt>
                <dd className="font-mono text-white/70">{roundScore}</dd>
              </div>
            </dl>
          </button>
        </div>
          <div
            className={`${glass} ml-12 flex flex-col items-start gap-1 rounded-xl px-2.5 py-1.5`}
            aria-label={`${t('hud.pin')} ${d(pinYds)}${u}. ${pins.live ? `${t('hud.communityPin')}: ${pinNote.join(', ')}, ${pins.live.reports} ${t('hud.reports')}` : t('hud.defaultPin')}`}
          >
            <span className="flex items-center gap-1.5">
              <Flag size={12} className="text-red-400" />
              <span className="font-mono text-xs font-semibold leading-none tabular-nums">
                {d(pinYds)}<span className="text-white/50">{u}</span>
              </span>
              <span className="text-[9px] font-bold uppercase leading-none tracking-wider text-white/50">{t('hud.pin')}</span>
              {!tournamentMode && lie.elev !== 0 && (
                <span className="flex items-center gap-0.5 border-l border-white/15 pl-1.5 font-mono text-[10px] text-white/70" title="Target elevation vs. ball">
                  {lie.elev > 0 ? <ArrowUp size={10} className="text-rose-300" /> : <ArrowDown size={10} className="text-sky-300" />}
                  {d(Math.abs(lie.elev))}{u}
                </span>
              )}
            </span>
            {pins.live && (
              <span className="flex items-start gap-1 text-[8px] font-semibold leading-tight text-emerald-300/80" title={`${t('hud.communityPin')} · ${pins.live.reports} ${t('hud.reports')}`}>
                <span className="relative mt-[3px] flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <Users size={9} className="mt-px shrink-0" />
                <span className="flex flex-col items-start">
                  {pinNote.map((part) => <span key={part} className="whitespace-nowrap">{part}</span>)}
                </span>
                {pins.live.status === 'verified' && <BadgeCheck size={9} className="mt-px shrink-0 text-emerald-400" />}
              </span>
            )}
          </div>
        </div>


        {/* Top-right: two compact pills (weather · conditions) + HUD toggles */}
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-1.5">
          <div className={`${glass} flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums`} aria-label="Weather">
            <span>{WEATHER.tempF}°</span>
            <span className="h-3 w-px bg-white/20" />
            <span className="flex items-center gap-1" title="Wind relative to target line (up = helping)">
              <ArrowUp size={11} className="text-sky-300 transition-transform" style={{ transform: `rotate(${arrowDeg}deg)` }} />
              {WEATHER.windMph}<span className="text-[8px] text-white/50">MPH</span>
            </span>
          </div>
          <div className={`${glass} flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums`} aria-label="Conditions">
            <span title={t('hud.rain')}><span aria-hidden>☔️</span> {WEATHER.rainPct}%</span>
            <span className="h-3 w-px bg-white/20" />
            <span title={t('hud.uv')}><span className="text-[8px] text-amber-300">UV</span> {WEATHER.uv}</span>
          </div>
          <div className="flex gap-1.5">
            {speechAvailable() && (
              <button onClick={toggleVoice} aria-pressed={voice} aria-label={t('hud.voice')} title={t('hud.voice')}
                className={`${glass} grid h-8 w-8 place-items-center rounded-full ${voice ? 'text-emerald-400 ring-1 ring-emerald-400/60' : 'text-white/60'}`}>
                {voice ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            )}
            <button onClick={() => set({ guardian: !guardian })} aria-pressed={guardian} aria-label={t('hud.guardian')} title={t('hud.guardian')}
              className={`${glass} grid h-8 w-8 place-items-center rounded-full ${guardian ? 'text-amber-300 ring-1 ring-amber-300/60' : 'text-white/60'}`}>
              <ShieldHalf size={14} />
            </button>
          </div>
          {ledger && (
            <button onClick={() => setMullOpen(true)} className={`${glass} flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-amber-200`}>
              <HandCoins size={12} /> {mullLeft} {t('mull.left')}
            </button>
          )}
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
              onClick={() => setPuttView(true)}
              className="pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-black/50 px-3.5 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)] backdrop-blur-xl transition active:scale-95"
            >
              <Aperture size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">{t('hud.puttView')}</span>
            </button>
          </div>

          <section
            aria-label="Shot caddie"
            className="pointer-events-auto rounded-3xl border border-white/10 bg-white/[0.07] p-2.5 shadow-[0_-8px_40px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/5 backdrop-blur-2xl backdrop-saturate-150"
          >
            {/* Line · Plays Like · Club */}
            <div className="grid grid-cols-3 divide-x divide-white/10 px-1 pb-2.5 pt-1">
              <Stat label={t('hud.line')} value={d(lineYds)} unit={u} />
              <Stat label={t('hud.playsLike')} value={tournamentMode ? '—' : d(target)} unit={u} accent />
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">{t('hud.club')}</span>
                <span className="text-2xl font-black leading-tight tracking-tight">{club ? club.label.replace(/^(\S+) [\d.]+°$/, '$1') : '—'}</span>
              </div>
            </div>

            {/* Undo · Log Shot · Next Hole */}
            <div className="flex gap-2">
              <button
                onClick={onUndo}
                disabled={strokes === 0}
                aria-label="Undo last shot"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/80 transition active:scale-95 disabled:opacity-30"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={logShot}
                disabled={justLogged}
                className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition active:scale-[0.98] ${
                  justLogged
                    ? 'bg-white/10 text-white/60'
                    : 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-400'
                }`}
              >
                {justLogged ? (<><Check size={16} strokeWidth={3} /> {t('hud.logged')}</>) : t('hud.logShot')}
              </button>
              <button
                onClick={onNext}
                className="flex h-11 shrink-0 items-center gap-0.5 rounded-2xl border border-white/10 bg-white/10 pl-3 pr-2 text-[10px] font-black uppercase tracking-widest text-white transition active:scale-95"
              >
                {t(isLastHole ? 'hud.finish' : 'hud.next')}
                <ChevronRight size={14} />
              </button>
            </div>
          </section>
          {!mapFailed && PROVIDER && (
            <p className="pointer-events-none -mt-1 text-center text-[8px] leading-none text-white/35">{PROVIDER.attribution} · {courseAttribution}</p>
          )}
        </div>
      </div>

      {picking && club && (
        <ShotModal
          club={club.label.replace(/^(\S+) [\d.]+°$/, '$1')}
          target={`${d(target)}${u}`}
          stats={clubStats[club.label]}
          players={isScramble ? players : undefined}
          by={ballBy}
          onBy={setBallBy}
          onPick={commitShot}
          onClose={() => setPicking(false)}
        />
      )}
      {mullOpen && ledger && onMulligan && onUnmulligan && (
        <MulliganSheet ledger={ledger} players={players} onUse={onMulligan} onUndo={onUnmulligan} onClose={() => setMullOpen(false)} />
      )}
      {puttView && (
        <PuttView lie={{ ...lie, pin: pinYds }} holeNumber={hole.number} onClose={() => setPuttView(false)} onConfirmCup={pins.report} />
      )}
    </div>
  );
}

function Stat({ label, value, unit, accent = false }: { label: string; value: number | string; unit: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${accent ? 'text-emerald-400/80' : 'text-white/50'}`}>{label}</span>
      <span className={`font-mono text-2xl leading-tight tabular-nums ${accent ? 'font-semibold text-emerald-400' : 'font-light'}`}>
        {value}
        {typeof value === 'number' && <span className={`ml-0.5 text-xs ${accent ? 'text-emerald-400/50' : 'text-white/40'}`}>{unit}</span>}
      </span>
    </div>
  );
}
