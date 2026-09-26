/**
 * Course discovery + download from OpenStreetMap.
 *
 *  - nearbyCourses: Overpass `leisure=golf_course` around the golfer, sorted by distance.
 *  - searchCourses: Nominatim free-text search (worldwide), golf-ish results only.
 *  - downloadCourseData: resolves the course area and pulls every golf=hole / golf=green inside it,
 *    then builds hole geometry with the same importer used for the bundled course.
 *
 * Public OSM services are shared infrastructure: keep requests few (debounced search, one download
 * at a time) and point VITE_OVERPASS_URLS / VITE_NOMINATIM_URL at your own cache for production.
 */
import { buildCourse } from './osmCourse.mjs';
import { sanitizeText } from '../../supabase/functions/_shared/validation.ts';
import { distanceM, type LatLng } from '../../supabase/functions/_shared/pins.ts';
import type { CourseData } from '../data/course';

export interface CourseSummary {
  /** Stable id, e.g. "osm-way-157330030". */
  id: string;
  name: string;
  location?: string;
  lat: number;
  lng: number;
  distanceM?: number;
}

export type Fetch = typeof fetch;

export const DEFAULT_LOCATION = { lat: 44.0121, lng: -92.4802, label: 'Rochester, MN' };

/** Nearby list is strictly limited to 10 miles (keeps downloads/storage sane); search covers the rest. */
export const NEARBY_RADIUS_M = 16_093;

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
export const OVERPASS_URLS = (env.VITE_OVERPASS_URLS ?? 'https://overpass-api.de/api/interpreter').split(',').map((s) => s.trim()).filter(Boolean);
export const NOMINATIM_URL = env.VITE_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';

export class DirectoryError extends Error {
  constructor(public code: 'network' | 'busy' | 'not_found' | 'no_holes', message?: string) {
    super(message ?? code);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST an Overpass QL query with retry/backoff and endpoint failover. */
export async function overpass(query: string, fetchFn: Fetch = fetch, signal?: AbortSignal): Promise<{ elements: OsmElement[] }> {
  let lastBusy = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of OVERPASS_URLS) {
      try {
        const res = await fetchFn(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal });
        if (res.ok) return await res.json();
        lastBusy = res.status === 429 || res.status >= 500;
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        lastBusy = false;
      }
    }
    await sleep(800 * 2 ** attempt);
  }
  throw new DirectoryError(lastBusy ? 'busy' : 'network');
}

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

const locationOf = (t: Record<string, string> = {}) =>
  [t['addr:city'] ?? t['is_in:city'], t['addr:state']].filter(Boolean).join(', ') || undefined;

/** OSM tags disc-golf and footgolf courses as golf courses too. */
const NOT_GOLF = /\bdisc\b|frisbee|foot ?golf|mini(ature)? golf|putt[- ]putt/i;

export function toSummaries(elements: OsmElement[], from: LatLng): CourseSummary[] {
  const out: CourseSummary[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    const c = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
    const name = sanitizeText(e.tags?.name, 80);
    if (!c || !name || NOT_GOLF.test(name)) continue;
    // The same course is often mapped twice (node + area); keep one per name/neighbourhood.
    const key = `${name.toLowerCase()}|${Math.round(c.lat * 50)}|${Math.round(c.lon * 50)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `osm-${e.type}-${e.id}`, name, location: locationOf(e.tags), lat: c.lat, lng: c.lon, distanceM: distanceM(from, { lat: c.lat, lng: c.lon }) });
  }
  return out.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

/**
 * Named golf courses within `radiusM`, nearest first. Nominatim's bounded "golf course" search is
 * one cheap request; Overpass is the fallback (it's more complete but often overloaded).
 */
export async function nearbyCourses(from: LatLng, radiusM = NEARBY_RADIUS_M, fetchFn: Fetch = fetch, signal?: AbortSignal) {
  const within = (list: CourseSummary[]) => list.filter((c) => (c.distanceM ?? Infinity) <= radiusM); // haversine, strict
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((from.lat * Math.PI) / 180));
  const viewbox = [from.lng - dLng, from.lat + dLat, from.lng + dLng, from.lat - dLat].map((n) => n.toFixed(4)).join(',');
  try {
    const res = await fetchFn(`${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=50&bounded=1&viewbox=${viewbox}&q=golf+course`, { signal });
    if (res.ok) {
      const hits = ((await res.json()) as NominatimHit[]).filter((h) => h.category === 'leisure' && h.type === 'golf_course');
      const list = within(toSummaries(hits.map(nominatimToOsm), from));
      if (list.length) return list;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  const q = `[out:json][timeout:30];nwr["leisure"="golf_course"](around:${Math.round(radiusM)},${from.lat},${from.lng});out center tags;`;
  return within(toSummaries((await overpass(q, fetchFn, signal)).elements, from));
}

interface NominatimHit {
  osm_type: string; osm_id: number; lat: string; lon: string; name?: string; display_name: string;
  category?: string; type?: string; address?: Record<string, string>;
}

const GOLFISH = /golf|country club|\blinks\b/i;

function nominatimToOsm(h: NominatimHit): OsmElement {
  const a = h.address ?? {};
  const place = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county;
  return {
    type: h.osm_type as OsmElement['type'], id: h.osm_id, lat: Number(h.lat), lon: Number(h.lon),
    tags: { name: h.name ?? '', ...(place ? { 'addr:city': place } : {}), ...(a.state ? { 'addr:state': a.state } : {}) },
  };
}

/** Worldwide name search. Results are golf courses (or golf-named places that resolve to one on download). */
export async function searchCourses(query: string, from: LatLng, fetchFn: Fetch = fetch, signal?: AbortSignal): Promise<CourseSummary[]> {
  const q = sanitizeText(query, 80);
  if (q.length < 3) return [];
  const run = async (text: string) => {
    const url = `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=15&q=${encodeURIComponent(text)}`;
    let res: Response;
    try {
      res = await fetchFn(url, { headers: { 'Accept-Language': 'en' }, signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new DirectoryError('network');
    }
    if (!res.ok) throw new DirectoryError(res.status === 429 ? 'busy' : 'network');
    return (await res.json()) as NominatimHit[];
  };
  let hits = await run(q);
  const golf = (h: NominatimHit) => (h.category === 'leisure' && h.type === 'golf_course') || GOLFISH.test(h.name ?? '');
  if (!hits.some(golf) && !/golf/i.test(q)) hits = await run(`${q} golf`);
  return hits.filter((h) => golf(h) && !NOT_GOLF.test(h.name ?? '')).map((h) => {
    const a = h.address ?? {};
    const place = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county;
    const lat = Number(h.lat), lng = Number(h.lon);
    return {
      id: `osm-${h.osm_type}-${h.osm_id}`,
      name: sanitizeText(h.name || h.display_name.split(',')[0], 80),
      location: [place, a.state ?? a.country].filter(Boolean).join(', ') || undefined,
      lat, lng, distanceM: distanceM(from, { lat, lng }),
    };
  });
}

/**
 * Download hole geometry for a course. Search hits may point at a clubhouse or restaurant, so the
 * course area is resolved as the golf_course nearest the hit; holes are taken from inside that
 * area (falling back to a radius when the area has no mapped holes).
 */
export async function downloadCourseData(course: CourseSummary, fetchFn: Fetch = fetch, signal?: AbortSignal): Promise<CourseData> {
  const [, type, id] = course.id.split('-');
  const osmType = type === 'relation' ? 'rel' : type;
  const around = `(around:1500,${course.lat},${course.lng})`;
  const areaQ =
    `[out:json][timeout:60];` +
    (osmType === 'node'
      ? `nwr["leisure"="golf_course"](around:800,${course.lat},${course.lng})->.c;`
      : `${osmType}(${id})->.self;(.self;nwr["leisure"="golf_course"](around:800,${course.lat},${course.lng}););nwr._["leisure"="golf_course"]->.c;`) +
    `.c map_to_area->.a;(nwr(area.a)["golf"~"^(hole|green)$"];);out geom tags;`;
  let elements = (await overpass(areaQ, fetchFn, signal)).elements;
  if (!elements.some((e) => e.tags?.golf === 'hole')) {
    elements = (await overpass(`[out:json][timeout:60];(nwr${around}["golf"~"^(hole|green)$"];);out geom tags;`, fetchFn, signal)).elements;
  }
  const built = buildCourse(course.name, elements);
  if (!built.holes.length) throw new DirectoryError('no_holes');
  return {
    id: course.id,
    name: course.name,
    location: course.location,
    center: [course.lat, course.lng],
    attribution: built.attribution,
    holes: built.holes,
    downloadedAt: Date.now(),
  };
}

/** Browser location with a timeout; falls back to Rochester, MN. */
export function locate(timeoutMs = 6000): Promise<{ lat: number; lng: number; label: string; detected: boolean }> {
  return new Promise((resolve) => {
    const fallback = () => resolve({ ...DEFAULT_LOCATION, detected: false });
    if (typeof navigator === 'undefined' || !navigator.geolocation) return fallback();
    const t = setTimeout(fallback, timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Your location', detected: true }); },
      () => { clearTimeout(t); fallback(); },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}
