import { useEffect, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource, type LngLat } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { LocateFixed } from 'lucide-react';
import { distanceM, type LatLng } from '../../supabase/functions/_shared/pins.ts';
import type { ImageryProvider } from './providers';
import type { FeatureCollection } from 'geojson';

setWorkerUrl(workerUrl);

export interface SatelliteMapProps {
  provider: ImageryProvider;
  /** Tee → green bearing; the map is rotated so the hole plays "up". */
  bearing: number;
  holeKey: string | number;
  ball: LatLng;
  aim: LatLng;
  pin: LatLng;
  /** Format a distance in metres in the user's units, e.g. "150y". */
  fmt: (meters: number) => string;
  labels: { target: string; toPin: string; recenter: string };
  /** Called when imagery can't be shown (no WebGL, blocked tiles, offline). */
  onFail: () => void;
  /** Course Guardian: satellite off, high-contrast wireframe of the course, lower pixel density. */
  guardian?: boolean;
  /** Every hole's centre line, [lat, lng][] per hole, for the wireframe. */
  holeLines?: [number, number][][];
}

function wireFeatures(lines: [number, number][][]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lines.flatMap((path) => [
      { type: 'Feature' as const, properties: { kind: 'hole' }, geometry: { type: 'LineString' as const, coordinates: path.map(([lat, lng]) => [lng, lat]) } },
      { type: 'Feature' as const, properties: { kind: 'green' }, geometry: { type: 'Point' as const, coordinates: [path[path.length - 1][1], path[path.length - 1][0]] } },
    ]),
  };
}

const ll = (p: LatLng): [number, number] => [p.lng, p.lat];

/** Leave room for the HUD: telemetry cards on top, action sheet at the bottom. */
function hudPadding(el: HTMLElement) {
  const h = el.clientHeight;
  return { top: Math.round(h * 0.2), bottom: Math.round(h * 0.28), left: 48, right: 48 };
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

function shotFeatures(ball: LatLng, aim: LatLng, pin: LatLng): FeatureCollection {
  const aimIsPin = distanceM(aim, pin) < 1;
  const path = aimIsPin ? [ll(ball), ll(pin)] : [ll(ball), ll(aim), ll(pin)];
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: path } },
      { type: 'Feature', properties: { kind: 'ball' }, geometry: { type: 'Point', coordinates: ll(ball) } },
      ...(aimIsPin ? [] : [{ type: 'Feature' as const, properties: { kind: 'aim' }, geometry: { type: 'Point' as const, coordinates: ll(aim) } }]),
      { type: 'Feature', properties: { kind: 'pin' }, geometry: { type: 'Point', coordinates: ll(pin) } },
    ],
  };
}

export default function SatelliteMap({ provider, bearing, holeKey, ball, aim, pin, fmt, labels, onFail, guardian = false, holeLines = [] }: SatelliteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const targetMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState(false);
  const [target, setTarget] = useState<LatLng | null>(null);
  const latest = useRef({ ball, aim, pin, bearing });
  latest.current = { ball, aim, pin, bearing };

  const frame = (animate: boolean) => {
    const m = map.current;
    if (!m || !container.current) return;
    const { ball: b, aim: a, pin: p, bearing: br } = latest.current;
    const bounds = new LngLatBounds(ll(b), ll(b)).extend(ll(a)).extend(ll(p));
    const cam = m.cameraForBounds(bounds, { bearing: br, padding: hudPadding(container.current), maxZoom: 18.5 });
    if (!cam) return;
    if (animate) m.easeTo({ ...cam, duration: 700 });
    else m.jumpTo(cam);
    setMoved(false);
  };

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    if (!hasWebGL()) {
      onFail();
      return;
    }
    let loadedTiles = 0;
    let tileErrors = 0;
    const m = new MapLibre({
      container: container.current,
      style: {
        version: 8,
        sources: {
          satellite: { type: 'raster', tiles: provider.tiles, tileSize: provider.tileSize, maxzoom: provider.maxzoom },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#0a0a0a' } },
          { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 150 } },
        ],
      },
      center: ll(latest.current.ball),
      zoom: 16,
      bearing: latest.current.bearing,
      attributionControl: false, // attribution is rendered by the HUD so it can't collide with widgets
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      fadeDuration: 0,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;

    m.on('load', () => {
      m.addSource('shot', { type: 'geojson', data: shotFeatures(latest.current.ball, latest.current.aim, latest.current.pin) });
      m.addLayer({ id: 'shot-line', type: 'line', source: 'shot', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#ffffff', 'line-opacity': 0.75, 'line-width': 2, 'line-dasharray': [2, 2] } });
      m.addLayer({ id: 'aim', type: 'circle', source: 'shot', filter: ['==', ['get', 'kind'], 'aim'], paint: { 'circle-radius': 14, 'circle-color': 'rgba(16,185,129,0.12)', 'circle-stroke-color': '#34d399', 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'ball', type: 'circle', source: 'shot', filter: ['==', ['get', 'kind'], 'ball'], paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#000000', 'circle-stroke-width': 1.5 } });
      m.addLayer({ id: 'pin', type: 'circle', source: 'shot', filter: ['==', ['get', 'kind'], 'pin'], paint: { 'circle-radius': 5, 'circle-color': '#ef4444', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
      m.addSource('wire', { type: 'geojson', data: wireFeatures(holeLines) });
      m.addLayer({ id: 'wire-hole', type: 'line', source: 'wire', filter: ['==', ['get', 'kind'], 'hole'], layout: { visibility: 'none' }, paint: { 'line-color': '#34d399', 'line-width': 2, 'line-opacity': 0.8 } }, 'shot-line');
      m.addLayer({ id: 'wire-green', type: 'circle', source: 'wire', filter: ['==', ['get', 'kind'], 'green'], layout: { visibility: 'none' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 26], 'circle-color': 'rgba(52,211,153,0.08)', 'circle-stroke-color': '#6ee7b7', 'circle-stroke-width': 1.5 } }, 'shot-line');
      frame(false);
      setReady(true);
    });

    // Imagery health: give up only if nothing ever loaded (offline, blocked host, bad token).
    m.on('sourcedata', (e) => {
      if (e.sourceId === 'satellite' && e.tile) loadedTiles++;
    });
    m.on('error', (e) => {
      const isTile = (e as { sourceId?: string }).sourceId === 'satellite' || /tile|fetch|load/i.test(String(e.error?.message));
      if (isTile && ++tileErrors >= 6 && loadedTiles === 0) onFail();
    });

    m.on('movestart', (e) => {
      if ((e as { originalEvent?: Event }).originalEvent) setMoved(true);
    });
    m.on('click', (e) => setTarget({ lat: e.lngLat.lat, lng: e.lngLat.lng }));

    const ro = new ResizeObserver(() => m.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // Map instance is created once per provider; props flow through refs/effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  // Course Guardian: no imagery requests, flat black + wireframe, 1× pixel ratio.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setLayoutProperty('satellite', 'visibility', guardian ? 'none' : 'visible');
    for (const id of ['wire-hole', 'wire-green']) m.setLayoutProperty(id, 'visibility', guardian ? 'visible' : 'none');
    m.setPaintProperty('bg', 'background-color', guardian ? '#000000' : '#0a0a0a');
    m.setPixelRatio(guardian ? 1 : window.devicePixelRatio || 1);
  }, [guardian, ready]);

  useEffect(() => {
    (map.current?.getSource('wire') as GeoJSONSource | undefined)?.setData(wireFeatures(holeLines));
  }, [holeLines, ready]);

  // Update overlays as the lie / live pin changes.
  useEffect(() => {
    const src = map.current?.getSource('shot') as GeoJSONSource | undefined;
    src?.setData(shotFeatures(ball, aim, pin));
  }, [ball, aim, pin, ready]);

  // Re-frame on a new hole or a new shot.
  useEffect(() => {
    if (!ready) return;
    setTarget(null);
    frame(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeKey, ready, ball.lat, ball.lng]);

  // Tap-to-measure target marker (DOM built with textContent — no HTML injection).
  useEffect(() => {
    const m = map.current;
    targetMarker.current?.remove();
    targetMarker.current = null;
    if (!m || !target) return;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'eg-target';
    el.setAttribute('aria-label', labels.target);
    const ring = document.createElement('span');
    ring.className = 'eg-target-ring';
    const card = document.createElement('span');
    card.className = 'eg-target-card';
    const a = document.createElement('b');
    a.textContent = fmt(distanceM(ball, target));
    const b = document.createElement('small');
    b.textContent = `${fmt(distanceM(target, pin))} ${labels.toPin.toUpperCase()}`; // uppercase label only, keep unit case
    card.append(a, b);
    el.append(ring, card);
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setTarget(null);
    });
    targetMarker.current = new Marker({ element: el, anchor: 'center' }).setLngLat([target.lng, target.lat]).addTo(m);
  }, [target, ball, pin, fmt, labels.target, labels.toPin]);

  return (
    <div className="absolute inset-0 z-0">
      <div
        ref={container}
        data-testid="satellite-map"
        // h-full/w-full, not inset-0: maplibre's CSS sets .maplibregl-map { position: relative }.
        className={`h-full w-full bg-neutral-950 ${guardian ? '' : '[&_.maplibregl-canvas]:[filter:brightness(0.75)_contrast(1.25)_saturate(0.8)]'}`}
      />
      {/* Vignette so floating glass widgets stay legible over bright imagery. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />
      {moved && (
        <button
          onClick={() => frame(true)}
          aria-label={labels.recenter}
          className="absolute right-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/50 text-white/80 shadow-lg backdrop-blur-xl active:scale-95"
        >
          <LocateFixed size={16} />
        </button>
      )}
    </div>
  );
}

export type { LngLat };
