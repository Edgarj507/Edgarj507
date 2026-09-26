import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { imageryProvider } from './src/map/providers';

/** Refuse to build if a server-only secret was given a VITE_ prefix (which would bundle it). */
function guardClientEnv(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('VITE_')) continue;
    const payload = v.split('.')[1];
    let role = '';
    try { role = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()).role ?? ''; } catch { /* not a JWT */ }
    if (
      /SERVICE|SECRET|PRIVATE|PASSWORD|DATABASE_URL/i.test(k) || role === 'service_role' || /^postgres(ql)?:\/\//.test(v) ||
      /^sk\./.test(v) // Mapbox secret token; only public pk.* tokens belong in the client
    ) {
      throw new Error(`${k} looks like a server-only secret and must not use the VITE_ prefix.`);
    }
  }
}

/** Content-Security-Policy for production builds (dev server needs inline scripts for HMR). */
function csp(supabaseUrl: string | undefined, mapOrigins: string[]): Plugin {
  const api = supabaseUrl ? new URL(supabaseUrl).origin : '';
  const ws = api.replace(/^https:/, 'wss:');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React style={{}} attributes
    `img-src 'self' data: blob: ${mapOrigins.join(' ')}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${api} ${ws} ${mapOrigins.join(' ')}`.replace(/\s+/g, ' ').trim(),
    "worker-src 'self' blob:", // MapLibre tile-decoding worker
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
  return {
    name: 'eg-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  guardClientEnv(env);
  return {
    // App version for bug-report diagnostics (only the version string is bundled, not package.json).
    define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
    plugins: [
      react(),
      tailwindcss(),
      csp(env.VITE_SUPABASE_URL, [
        ...(imageryProvider(env)?.origins ?? []),
        // Course directory (OpenStreetMap Overpass + Nominatim, or your own mirrors).
        ...(env.VITE_OVERPASS_URLS ?? 'https://overpass-api.de/api/interpreter').split(',').map((u) => new URL(u.trim()).origin),
        new URL(env.VITE_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org').origin,
        // Weather: Open-Meteo conditions, NWS alerts, RainViewer radar (API + tiles).
        'https://api.open-meteo.com', 'https://api.weather.gov', 'https://api.rainviewer.com', 'https://tilecache.rainviewer.com',
      ]),
    ],
    worker: { format: 'es' as const }, // MapLibre v6 runs its worker as an ES module
    envPrefix: 'VITE_',
    test: { environment: 'node', globals: true },
  };
});
