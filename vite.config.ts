import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Refuse to build if a server-only secret was given a VITE_ prefix (which would bundle it). */
function guardClientEnv(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('VITE_')) continue;
    const payload = v.split('.')[1];
    let role = '';
    try { role = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()).role ?? ''; } catch { /* not a JWT */ }
    if (/SERVICE|SECRET|PRIVATE|PASSWORD|DATABASE_URL/i.test(k) || role === 'service_role' || /^postgres(ql)?:\/\//.test(v)) {
      throw new Error(`${k} looks like a server-only secret and must not use the VITE_ prefix.`);
    }
  }
}

/** Content-Security-Policy for production builds (dev server needs inline scripts for HMR). */
function csp(supabaseUrl: string | undefined): Plugin {
  const api = supabaseUrl ? new URL(supabaseUrl).origin : '';
  const ws = api.replace(/^https:/, 'wss:');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React style={{}} attributes
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${api} ${ws}`.trim(),
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
    plugins: [react(), tailwindcss(), csp(env.VITE_SUPABASE_URL)],
    envPrefix: 'VITE_',
    test: { environment: 'node', globals: true },
  };
});
