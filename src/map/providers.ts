/**
 * Satellite imagery providers. Choose with env:
 *   VITE_MAPBOX_TOKEN=pk.…   → Mapbox Satellite (512px @2x raster tiles)
 *   VITE_MAP_PROVIDER=esri   → Esri World Imagery (default when no Mapbox token)
 *   VITE_MAP_PROVIDER=none   → built-in vector placeholder (no network)
 *
 * Tokens here are *public* client tokens. Mapbox secret tokens (sk.…) are refused at build time.
 */
export interface ImageryProvider {
  id: 'mapbox' | 'esri';
  tiles: string[];
  tileSize: number;
  maxzoom: number;
  attribution: string;
  /** Origins to allow in the Content-Security-Policy. */
  origins: string[];
}

export function imageryProvider(env: Record<string, string | undefined> = import.meta.env): ImageryProvider | null {
  const choice = env.VITE_MAP_PROVIDER?.toLowerCase();
  if (choice === 'none') return null;
  const token = env.VITE_MAPBOX_TOKEN;
  if (token && choice !== 'esri') {
    return {
      id: 'mapbox',
      tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${encodeURIComponent(token)}`],
      tileSize: 512,
      maxzoom: 22,
      attribution: '© Mapbox © Maxar',
      origins: ['https://api.mapbox.com'],
    };
  }
  return {
    id: 'esri',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    origins: ['https://server.arcgisonline.com'],
  };
}
