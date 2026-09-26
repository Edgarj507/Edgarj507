import type { CourseData } from '../data/course';
import type { ImageryProvider } from '../map/providers';

const rad = (d: number) => (d * Math.PI) / 180;
const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => Math.floor(((1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2) * 2 ** z);

/** Tile URLs covering every hole (plus a margin) at the zooms the HUD uses. */
export function courseTileUrls(course: CourseData, provider: ImageryProvider, zooms = [15, 16, 17, 18], max = 600): string[] {
  const pts = course.holes.flatMap((h) => [...h.path, h.green]);
  if (!pts.length) return [];
  const pad = 0.0008; // ≈ 80 m
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const [s, n, w, e] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lngs) - pad, Math.max(...lngs) + pad];
  const urls: string[] = [];
  for (const z of zooms.filter((z) => z <= provider.maxzoom)) {
    for (let x = tileX(w, z); x <= tileX(e, z); x++) {
      for (let y = tileY(n, z); y <= tileY(s, z); y++) {
        urls.push(provider.tiles[0].replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
        if (urls.length >= max) return urls;
      }
    }
  }
  return urls;
}

/**
 * Warm the browser cache with a course's imagery so the HUD opens instantly on the course.
 * This uses the provider's normal HTTP caching; guaranteed offline storage requires the provider's
 * offline terms (e.g. Mapbox mobile SDK offline packs).
 */
export async function prefetchTiles(urls: string[], onProgress: (done: number, total: number) => void, signal?: AbortSignal, concurrency = 6) {
  let done = 0, failed = 0, next = 0;
  const worker = async () => {
    while (next < urls.length) {
      if (signal?.aborted) return;
      const url = urls[next++];
      try {
        const r = await fetch(url, { cache: 'force-cache', mode: 'cors', signal });
        if (!r.ok) failed++;
        else await r.blob();
      } catch {
        failed++;
      }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return { total: urls.length, failed };
}
