import { useEffect, useRef, useState } from 'react';
import { Map as MapLibre, Marker } from '../map/maplibre';
import { imageryProvider } from '../map/providers';
import { fetchRadarFrames, radarTiles, type RadarFrames } from './weather';

const PROVIDER = imageryProvider();

/**
 * Doppler radar loop (RainViewer composite) over satellite imagery, centred on the course.
 * Each past frame is its own raster layer; the loop just switches layer opacity, so frames are
 * cached and the animation is smooth.
 */
export default function WeatherRadarMap({ lat, lng, onFail }: { lat: number; lng: number; onFail: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const [radar, setRadar] = useState<RadarFrames | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { fetchRadarFrames().then((r) => { setRadar(r); setFrame(r.frames.length - 1); }).catch(onFail); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!el.current) return;
    let m: MapLibre;
    try {
      m = new MapLibre({
        container: el.current,
        style: {
          version: 8,
          sources: PROVIDER ? { base: { type: 'raster', tiles: PROVIDER.tiles, tileSize: PROVIDER.tileSize, maxzoom: PROVIDER.maxzoom } } : {},
          layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1320' } }, ...(PROVIDER ? [{ id: 'base', type: 'raster' as const, source: 'base', paint: { 'raster-saturation': -0.6, 'raster-brightness-max': 0.6 } }] : [])],
        },
        center: [lng, lat], zoom: 7, minZoom: 3, maxZoom: 11, attributionControl: false, dragRotate: false, pitchWithRotate: false,
      });
    } catch { onFail(); return; }
    m.touchZoomRotate.disableRotation();
    map.current = m;
    const pin = document.createElement('div');
    pin.className = 'h-3 w-3 rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_10px_#10b981]';
    new Marker({ element: pin, anchor: 'center' }).setLngLat([lng, lat]).addTo(m);
    m.on('load', () => setLoaded(true));
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add one raster layer per frame once both the map and the frame list are ready.
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded || !radar) return;
    radar.frames.forEach((f, i) => {
      const id = `radar-${f.time}`;
      if (m.getSource(id)) return;
      m.addSource(id, { type: 'raster', tiles: [radarTiles(radar, i)], tileSize: 256, maxzoom: 7, attribution: 'RainViewer' });
      m.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 0 } } });
    });
  }, [loaded, radar]);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded || !radar) return;
    radar.frames.forEach((f, i) => { if (m.getLayer(`radar-${f.time}`)) m.setPaintProperty(`radar-${f.time}`, 'raster-opacity', i === frame ? 0.75 : 0); });
  }, [frame, loaded, radar]);

  useEffect(() => {
    if (!playing || !radar?.frames.length) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % radar.frames.length), 700);
    return () => clearInterval(id);
  }, [playing, radar]);

  const t = radar?.frames[frame]?.time;
  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" data-testid="weather-radar" />
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-xl bg-black/60 px-2 py-1 text-[10px] text-white/80 backdrop-blur">
        <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause radar' : 'Play radar'} className="rounded-md bg-white/10 px-2 py-0.5 font-bold">{playing ? '❚❚' : '▶'}</button>
        <input type="range" aria-label="Radar frame" min={0} max={Math.max(0, (radar?.frames.length ?? 1) - 1)} value={frame} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} className="flex-1 accent-emerald-500" />
        <span className="font-mono">{t ? new Date(t * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</span>
        <span className="text-white/40">Radar: RainViewer</span>
      </div>
    </div>
  );
}
