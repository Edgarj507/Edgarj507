import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, CloudDownload, Flag, Image as ImageIcon, Loader2, LocateFixed, MapPin, Search, Users, X, AlertTriangle, Trash2 } from 'lucide-react';
import { usePrefs } from '../i18n/prefs';
import { useCourses } from '../courses/CourseLibrary';
import { courseTileUrls, prefetchTiles } from '../courses/tiles';
import { DEFAULT_LOCATION, DirectoryError, downloadCourseData, locate, nearbyCourses, searchCourses, type CourseSummary } from '../lib/courseDirectory';
import { imageryProvider } from '../map/providers';
import { supabase } from '../lib/supabase';
import { buildCourseModel, SOMERBY } from '../data/course';

type StepState = 'wait' | 'run' | 'ok' | 'skip' | 'fail';
interface Job {
  course: CourseSummary;
  layout: StepState; holes?: number; note?: string;
  imagery: StepState; tiles?: [number, number];
  pins: StepState; pinCount?: number; pinSkip?: 'auth' | 'blocked';
}

const PROVIDER = imageryProvider();

const ERR: Record<DirectoryError['code'], string> = {
  network: 'Can’t reach the course directory. Check your connection.',
  busy: 'The course directory is busy. Try again in a minute.',
  not_found: 'Course not found.',
  no_holes: 'Holes aren’t mapped for this course yet.',
};

export function CourseSetup({ onBack, onDone, signedIn }: { onBack: () => void; onDone: (courseId: string | null) => void; signedIn: boolean }) {
  const { t, units } = usePrefs();
  const lib = useCourses();
  const [loc, setLoc] = useState<{ lat: number; lng: number; label: string; detected: boolean } | null>(null);
  const [nearby, setNearby] = useState<CourseSummary[] | null>(null);
  const [nearbyErr, setNearbyErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, CourseSummary>>(new Map());
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [finished, setFinished] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const fmtDist = (m?: number) =>
    m == null ? '' : units === 'meters' ? `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km` : `${(m / 1609.34).toFixed(m < 16_000 ? 1 : 0)} mi`;

  // Pre-select existing home courses so this screen doubles as "manage my courses".
  useEffect(() => {
    if (!lib.loaded) return;
    setSelected((cur) => {
      if (cur.size) return cur;
      const m = new Map<string, CourseSummary>();
      for (const id of lib.homeIds) {
        const c = lib.get(id);
        if (c.id === id) m.set(id, { id, name: c.name, location: c.location, lat: c.data.center[0], lng: c.data.center[1] });
      }
      return m;
    });
  }, [lib.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Locate → nearby courses.
  const loadNearby = async (where: { lat: number; lng: number }) => {
    setNearby(null);
    setNearbyErr(null);
    try {
      setNearby(await nearbyCourses(where));
    } catch (e) {
      setNearbyErr(ERR[e instanceof DirectoryError ? e.code : 'network']);
    }
  };
  useEffect(() => {
    locate().then((l) => {
      setLoc(l);
      void loadNearby(l);
    });
  }, []);

  // Debounced worldwide search (Nominatim asks for ≤ 1 request/second).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults(null); setSearchErr(null); return; }
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      setSearching(true);
      setSearchErr(null);
      try {
        setResults(await searchCourses(q, loc ?? DEFAULT_LOCATION, fetch, ctl.signal));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSearchErr(ERR[e instanceof DirectoryError ? e.code : 'network']);
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 700);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [query, loc]);

  const toggle = (c: CourseSummary) =>
    setSelected((m) => { const n = new Map(m); if (n.has(c.id)) n.delete(c.id); else n.set(c.id, c); return n; });

  const pending = [...selected.values()].filter((c) => !lib.has(c.id));

  async function startDownload() {
    const list = [...selected.values()];
    await lib.setHome(list.map((c) => c.id));
    const todo = list.filter((c) => !lib.has(c.id));
    if (!todo.length) return onDone(list.find((c) => lib.get(c.id).playable)?.id ?? null);

    const ctl = new AbortController();
    abort.current = ctl;
    const js: Job[] = todo.map((course) => ({ course, layout: 'wait', imagery: 'wait', pins: 'wait' }));
    setJobs(js);
    setFinished(false);
    const patch = (i: number, p: Partial<Job>) => setJobs((cur) => cur && cur.map((j, k) => (k === i ? { ...j, ...p } : j)));

    for (let i = 0; i < todo.length && !ctl.signal.aborted; i++) {
      const course = todo[i];
      // 1 · Hole layout
      patch(i, { layout: 'run' });
      let data;
      try {
        data = await downloadCourseData(course, fetch, ctl.signal);
        await lib.add(data);
        const model = buildCourseModel(data);
        patch(i, { layout: 'ok', holes: data.holes.length, note: model.playable ? undefined : `${data.holes.length}/${model.holeCount} holes mapped — not playable yet` });
      } catch (e) {
        if ((e as Error).name === 'AbortError') break;
        patch(i, { layout: 'fail', note: ERR[e instanceof DirectoryError ? e.code : 'network'], imagery: 'skip', pins: 'skip', pinSkip: 'blocked' });
        continue;
      }
      // 2 · Satellite imagery (warms the cache for instant on-course loading)
      if (PROVIDER) {
        const urls = courseTileUrls(data, PROVIDER);
        patch(i, { imagery: 'run', tiles: [0, urls.length] });
        const r = await prefetchTiles(urls, (d, total) => patch(i, { tiles: [d, total] }), ctl.signal);
        patch(i, { imagery: r.failed > r.total / 2 ? 'fail' : 'ok' });
      } else patch(i, { imagery: 'skip' });
      // 3 · Community pin positions (live network, signed-in players)
      if (supabase && signedIn) {
        patch(i, { pins: 'run' });
        const { count, error } = await supabase.from('pin_positions').select('*', { count: 'exact', head: true }).eq('course_name', data.name);
        patch(i, { pins: error ? 'fail' : 'ok', pinCount: count ?? 0 });
      } else patch(i, { pins: 'skip', pinSkip: 'auth' });
    }
    setFinished(true);
  }

  // Auto-continue into round setup once everything that could be downloaded is ready.
  const firstPlayable = useMemo(
    () => [...selected.keys()].find((id) => lib.has(id) && lib.get(id).playable) ?? null,
    [selected, lib],
  );
  useEffect(() => {
    if (!finished || !jobs || jobs.some((j) => j.layout === 'fail') || !firstPlayable) return;
    const id = setTimeout(() => onDone(firstPlayable), 1400);
    return () => clearTimeout(id);
  }, [finished, jobs, firstPlayable, onDone]);

  const card = (c: CourseSummary) => {
    const on = selected.has(c.id);
    const cached = lib.has(c.id);
    return (
      <button
        key={c.id}
        role="checkbox"
        aria-checked={on}
        onClick={() => toggle(c)}
        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left backdrop-blur-md transition-all active:scale-[0.99] ${on ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-black/40 hover:bg-white/5'}`}
      >
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${on ? 'border-emerald-400 bg-emerald-500 text-black' : 'border-white/20'}`}>
          {on && <Check size={13} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[12px] font-bold ${on ? 'text-emerald-300' : 'text-white/90'}`}>{c.name}</span>
          <span className="block truncate text-[10px] text-white/45">{c.location ?? '—'}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[11px] text-white/70">{fmtDist(c.distanceM)}</span>
          {cached && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400">Offline</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-4 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white">{t('courses.title')}</h2>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white/60 backdrop-blur-md">
          <LocateFixed size={10} className={loc?.detected ? 'text-emerald-400' : 'text-amber-300'} />
          {loc ? (loc.detected ? t('courses.nearYou') : loc.label) : '…'}
        </span>
      </div>

      <p className="z-10 mb-3 text-[11px] leading-snug text-white/55">
        {t('courses.intro')}
        {lib.loaded && !lib.homeIds.length && (
          <>
            {' '}
            <button
              onClick={async () => { await lib.setHome([SOMERBY.id]); onDone(SOMERBY.id); }}
              className="font-semibold text-emerald-400 underline-offset-2 hover:underline"
            >
              {t('courses.skip')}
            </button>
          </>
        )}
      </p>

      <div className="relative z-10 mb-3 shrink-0">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={80}
          placeholder={t('courses.search')}
          aria-label={t('courses.search')}
          className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-9 pr-9 text-xs text-white placeholder-white/30 backdrop-blur-md focus:border-emerald-500/50 focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/40"><X size={13} /></button>
        )}
      </div>

      <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-28">
        {query.trim().length >= 3 && (
          <section className="mb-5">
            <h3 className="mb-2 flex items-center gap-2 pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
              {t('courses.results')} {searching && <Loader2 size={11} className="animate-spin" />}
            </h3>
            {searchErr && <p className="px-1 text-[11px] text-rose-300">{searchErr}</p>}
            {results && !results.length && !searching && <p className="px-1 text-[11px] text-white/40">{t('courses.noResults')}</p>}
            <div className="flex flex-col gap-2">{results?.map(card)}</div>
          </section>
        )}

        {selected.size > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 pl-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">{t('courses.home')} · {selected.size}</h3>
            <div className="flex flex-wrap gap-1.5">
              {[...selected.values()].map((c) => (
                <span key={c.id} className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 py-1 pl-2.5 pr-1 text-[10px] font-semibold text-emerald-300">
                  {c.name}
                  <button onClick={() => toggle(c)} aria-label={`Remove ${c.name}`} className="rounded-full p-0.5 hover:bg-white/10"><X size={10} /></button>
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 flex items-center gap-2 pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
            <MapPin size={11} /> {t('courses.nearby')} <span className="font-mono normal-case tracking-normal text-white/35">· {units === 'meters' ? '≤ 16 km' : '≤ 10 mi'}</span> {!nearby && !nearbyErr && <Loader2 size={11} className="animate-spin" />}
          </h3>
          {nearbyErr && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-[11px] text-amber-200">
              {nearbyErr}{' '}
              <button onClick={() => loc && loadNearby(loc)} className="font-bold underline">{t('courses.retry')}</button>
            </div>
          )}
          {!nearby && !nearbyErr && Array.from({ length: 5 }, (_, i) => <div key={i} className="mb-2 h-[58px] animate-pulse rounded-xl border border-white/5 bg-white/5" />)}
          {nearby && !nearby.length && <p className="px-1 text-[11px] text-white/45">{t('courses.noneNearby')}</p>}
          <div className="flex flex-col gap-2">{nearby?.map(card)}</div>
        </section>

        {lib.courses.length > 1 && (
          <section className="mt-5">
            <h3 className="mb-2 pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">{t('courses.offline')}</h3>
            {lib.courses.filter((c) => c.data.downloadedAt).map((c) => (
              <div key={c.id} className="mb-1.5 flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px]">
                <span className="truncate text-white/80">{c.name} <span className="text-white/35">· {c.data.holes.length} holes</span></span>
                <button onClick={() => lib.remove(c.id)} aria-label={`Delete ${c.name}`} className="p-1 text-white/40 hover:text-rose-300"><Trash2 size={12} /></button>
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="absolute inset-x-5 bottom-6 z-20">
        <div className="rounded-2xl border border-white/10 bg-black/60 p-1.5 shadow-2xl backdrop-blur-xl">
          <button
            onClick={startDownload}
            disabled={!selected.size}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40"
          >
            <CloudDownload size={15} />
            {pending.length ? `${t('courses.download')} · ${pending.length}` : t('courses.continue')}
          </button>
        </div>
      </div>

      {jobs && (
        <DownloadSheet
          jobs={jobs}
          finished={finished}
          canContinue={!!firstPlayable}
          onCancel={() => { abort.current?.abort(); setJobs(null); }}
          onRetry={() => void startDownload()}
          onContinue={() => onDone(firstPlayable)}
        />
      )}
    </div>
  );
}

function StepIcon({ s }: { s: StepState }) {
  if (s === 'run') return <Loader2 size={12} className="animate-spin text-sky-300" />;
  if (s === 'ok') return <Check size={12} className="text-emerald-400" strokeWidth={3} />;
  if (s === 'fail') return <AlertTriangle size={12} className="text-amber-300" />;
  if (s === 'skip') return <span className="h-1.5 w-1.5 rounded-full bg-white/20" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-white/30" />;
}

function DownloadSheet({ jobs, finished, canContinue, onCancel, onRetry, onContinue }: { jobs: Job[]; finished: boolean; canContinue: boolean; onCancel: () => void; onRetry: () => void; onContinue: () => void }) {
  const { t } = usePrefs();
  const weight = (j: Job) => {
    const s = (x: StepState) => (x === 'ok' || x === 'skip' || x === 'fail' ? 1 : x === 'run' ? 0.5 : 0);
    const img = j.imagery === 'run' && j.tiles ? j.tiles[0] / Math.max(1, j.tiles[1]) : s(j.imagery);
    return (s(j.layout) + img + s(j.pins)) / 3;
  };
  const pct = Math.round((jobs.reduce((a, j) => a + weight(j), 0) / jobs.length) * 100);

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/60 p-4 pb-safe backdrop-blur-sm" role="dialog" aria-label={t('courses.downloading')}>
      <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl ring-1 ring-inset ring-white/5 backdrop-blur-2xl">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">{finished ? t('courses.ready') : t('courses.downloading')}</span>
          <span className="font-mono text-lg font-semibold text-emerald-400" aria-live="polite">{pct}%</span>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>

        <div className="no-scrollbar flex max-h-[50vh] flex-col gap-2.5 overflow-y-auto">
          {jobs.map((j) => (
            <div key={j.course.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="mb-2 truncate text-[12px] font-bold text-white">{j.course.name}</div>
              <ul className="flex flex-col gap-1.5 text-[10px]">
                <li className="flex items-center gap-2"><StepIcon s={j.layout} /><Flag size={11} className="text-white/40" />
                  <span className="flex-1 text-white/70">{t('courses.step.layout')}</span>
                  <span className="font-mono text-white/50">{j.holes != null ? `${j.holes} holes` : ''}</span></li>
                <li className="flex items-center gap-2"><StepIcon s={j.imagery} /><ImageIcon size={11} className="text-white/40" />
                  <span className="flex-1 text-white/70">{t('courses.step.imagery')}</span>
                  <span className="font-mono text-white/50">{j.tiles ? `${j.tiles[0]}/${j.tiles[1]}` : ''}</span></li>
                <li className="flex items-center gap-2"><StepIcon s={j.pins} /><Users size={11} className="text-white/40" />
                  <span className="flex-1 text-white/70">{t('courses.step.pins')}</span>
                  <span className="font-mono text-white/50">{j.pins === 'skip' ? (j.pinSkip === 'auth' ? t('courses.signInForPins') : '—') : j.pinCount != null ? `${j.pinCount} greens` : ''}</span></li>
              </ul>
              {j.note && <p className="mt-2 text-[10px] text-amber-200/90">{j.note}</p>}
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-[10px] font-bold uppercase tracking-widest text-white/70">
            {finished ? t('courses.back') : t('courses.cancel')}
          </button>
          {finished && jobs.some((j) => j.layout === 'fail') && (
            <button onClick={onRetry} className="h-11 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 text-[10px] font-bold uppercase tracking-widest text-amber-200">
              {t('courses.retry')}
            </button>
          )}
          <button
            onClick={onContinue}
            disabled={!finished || !canContinue}
            className="h-11 flex-1 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-[0.2em] text-black transition active:scale-[0.98] disabled:opacity-40"
          >
            {t('courses.setUpRound')}
          </button>
        </div>
      </div>
    </div>
  );
}
