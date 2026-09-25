import { corsHeaders } from '../_shared/cors.ts';
import { parseScoreSubmission, type ScoreSubmission } from '../_shared/validation.ts';

export interface Deps {
  allowedOrigins: Set<string>;
  /** Verify the bearer JWT with Supabase Auth; returns the user id or null. */
  verifyUser: (jwt: string) => Promise<string | null>;
  /** Calls public.record_hole_score with the service role. Throws Error(message) on rule violations. */
  recordScore: (userId: string, s: ScoreSubmission) => Promise<unknown>;
  /** Returns false when the caller is over their rate limit. */
  allow: (userId: string) => boolean;
}

// Rule violations raised by record_hole_score() → client-safe codes. Anything else is a 500
// with no detail (never leak SQL errors to clients).
const RULE_ERRORS = new Set([
  'round_not_found', 'round_not_active', 'not_participant', 'hole_out_of_range',
  'strokes_out_of_range', 'putts_out_of_range', 'hole_out_of_sequence', 'too_fast', 'too_many_edits',
]);
const MAX_BODY = 1024;

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(cors ?? {}) },
    });

  // Browsers always send Origin on cross-origin requests; unknown origins are refused outright.
  if (origin && !cors) return json(403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors ?? {} });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!req.headers.get('content-type')?.startsWith('application/json')) return json(415, { error: 'json_required' });

  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const userId = jwt ? await deps.verifyUser(jwt) : null;
  if (!userId) return json(401, { error: 'unauthorized' });
  if (!deps.allow(userId)) return json(429, { error: 'rate_limited' });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'body_too_large' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const parsed = parseScoreSubmission(body);
  if (!parsed.ok) return json(422, { error: parsed.error });

  try {
    const row = await deps.recordScore(userId, parsed.value);
    return json(200, { ok: true, score: row });
  } catch (e) {
    const code = e instanceof Error ? e.message.match(/[a-z_]+/)?.[0] : undefined;
    if (code && RULE_ERRORS.has(code)) return json(422, { error: code });
    console.error('submit-score failed', e);
    return json(500, { error: 'internal' });
  }
}

/** Sliding-window limiter per user. Per-instance only; pair with Supabase's platform limits. */
export function rateLimiter(max: number, windowMs: number, now = () => Date.now()) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}
