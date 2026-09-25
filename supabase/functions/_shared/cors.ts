/**
 * Strict CORS: only listed origins get CORS headers; preflights from anything else get 403.
 * Note CORS only constrains browsers — authorization is still enforced by JWT + RLS.
 *
 * ALLOWED_ORIGINS is a comma-separated env var, e.g.
 *   https://exclusive.golf,https://app.exclusive.golf,capacitor://localhost,https://localhost
 * (the last two are the iOS and Android Capacitor webview origins).
 */
export function parseOrigins(env: string | undefined): Set<string> {
  return new Set(
    (env ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => /^(https:\/\/[a-z0-9.-]+(:\d+)?|capacitor:\/\/localhost|http:\/\/localhost:\d+)$/i.test(o)),
  );
}

export function corsHeaders(origin: string | null, allowed: Set<string>): Record<string, string> | null {
  if (!origin || !allowed.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
