import { useEffect, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibre, Marker } from '../map/maplibre';
import type { FeatureCollection } from 'geojson';
import type { ImageryProvider } from '../map/providers';

type LL = [number, number];

export interface RadarDot { id: string; at: LL; label: string; kind: 'group' | 'late' | 'order' | 'hail' }

interface Props {
  provider: ImageryProvider;
  holes: { number: number; path: LL[] }[];
  dots: RadarDot[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onFail: () => void;
}

const lngLat = ([lat, lng]: LL): [number, number] => [lng, lat];

function courseFeatures(holes: Props['holes']): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: holes.flatMap((h) => [
      { type: 'Feature' as const, properties: { kind: 'hole' }, geometry: { type: 'LineString' as const, coordinates: h.path.map(lngLat) } },
      { type: 'Feature' as const, properties: { kind: 'green', n: String(h.number) }, geometry: { type: 'Point' as const, coordinates: lngLat(h.path[h.path.length - 1]) } },
    ]),
  };
}

/** "God-mode" overview: the whole course north-up on satellite, groups and orders as glowing dots. */
export default function RadarMap({ provider, holes, dots, selected, onSelect, onFail }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const markers = useRef(new Map<string, { m: Marker; node: HTMLDivElement }>());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    let tiles = 0, errors = 0;
    let m: MapLibre;
    try {
      m = new MapLibre({
        container: el.current,
        style: {
          version: 8,
          sources: { satellite: { type: 'raster', tiles: provider.tiles, tileSize: provider.tileSize, maxzoom: provider.maxzoom } },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#0a0a0a' } },
            { id: 'satellite', type: 'raster', source: 'satellite' },
          ],
        },
        bounds: bounds(holes),
        fitBoundsOptions: { padding: 40 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
      });
    } catch {
      onFail();
      return;
    }
    m.touchZoomRotate.disableRotation();
    map.current = m;
    m.on('load', () => {
      m.addSource('course', { type: 'geojson', data: courseFeatures(holes) });
      m.addLayer({ id: 'holes', type: 'line', source: 'course', filter: ['==', ['get', 'kind'], 'hole'], paint: { 'line-color': '#ffffff', 'line-opacity': 0.35, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
      m.addLayer({ id: 'greens', type: 'circle', source: 'course', filter: ['==', ['get', 'kind'], 'green'], paint: { 'circle-radius': 4, 'circle-color': 'rgba(52,211,153,0.25)', 'circle-stroke-color': '#6ee7b7', 'circle-stroke-width': 1 } });
      setReady(true);
    });
    m.on('sourcedata', (e) => { if (e.sourceId === 'satellite' && e.tile) tiles++; });
    m.on('error', () => { if (++errors >= 6 && tiles === 0) onFail(); });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    const live = markers.current;
    return () => { ro.disconnect(); live.clear(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  // Sync DOM markers with the dots (labels set via textContent — no HTML injection).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const seen = new Set<string>();
    for (const d of dots) {
      seen.add(d.id);
      let entry = markers.current.get(d.id);
      if (!entry) {
        const node = document.createElement('div');
        node.addEventListener('click', (e) => { e.stopPropagation(); onSelect?.(d.id); });
        entry = { m: new Marker({ element: node }).setLngLat(lngLat(d.at)).addTo(m), node };
        markers.current.set(d.id, entry);
      }
      entry.m.setLngLat(lngLat(d.at));
      entry.node.className = `eg-radar-dot eg-radar-${d.kind}${selected === d.id ? ' eg-radar-sel' : ''}`;
      entry.node.setAttribute('role', 'button');
      entry.node.setAttribute('aria-label', d.label);
      entry.node.title = d.label;
      entry.node.dataset.label = d.kind === 'order' || d.kind === 'hail' ? '' : d.label.split(' ·')[0];
    }
    for (const [id, e] of markers.current) if (!seen.has(id)) { e.m.remove(); markers.current.delete(id); }
  }, [dots, ready, selected, onSelect]);

  return <div ref={el} className="h-full w-full bg-neutral-950 [&_.maplibregl-canvas]:[filter:brightness(0.75)_contrast(1.25)_saturate(0.8)]" />;
}

function bounds(holes: Props['holes']) {
  const pts = holes.flatMap((h) => h.path);
  const b = new LngLatBounds(lngLat(pts[0]), lngLat(pts[0]));
  pts.forEach((p) => b.extend(lngLat(p)));
  return b;
}
