/**
 * Input validation & sanitization shared by the React app and the edge functions.
 * Pure TypeScript (no Deno/DOM APIs) so both runtimes import the same rules.
 *
 * Output encoding is React's job (it escapes text by default; we never use
 * dangerouslySetInnerHTML). These helpers reject or normalize input *before* it is stored,
 * and the database repeats the key checks as CHECK constraints.
 */

const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
const MARKUP = /[<>"`\\]/g;

/** Normalize free text: NFC, strip control/bidi chars and markup characters, collapse spaces, cap length. */
export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFC')
    .replace(/\s+/g, ' ') // before CONTROL, so \n and \t become spaces rather than vanishing
    .replace(CONTROL, '')
    .replace(MARKUP, '')
    .trim()
    .slice(0, maxLen);
}

export const HANDLE_RE = /^[a-z0-9._]{3,24}$/;

/** Friend handles: "@Alex_M " → "alex_m"; null when it can't be a valid handle. */
export function normalizeHandle(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const h = input.trim().replace(/^@/, '').toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
}

/** Escape LIKE/ILIKE wildcards so a search for "100%" doesn't match everything. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Course search: sanitized, wildcard-escaped, 2–60 chars; null when too short to search. */
export function courseQuery(input: unknown): string | null {
  const q = sanitizeText(input, 60);
  return q.length >= 2 ? escapeLike(q) : null;
}

export const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,255}\.[a-z]{2,}$/i;
export const passwordProblem = (pw: string) =>
  pw.length < 10 ? 'Use at least 10 characters.' : !/[a-z]/i.test(pw) || !/\d/.test(pw) ? 'Mix letters and numbers.' : null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ScoreSubmission {
  roundId: string;
  hole: number;
  strokes: number;
  putts: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const int = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Strict schema for the submit-score body. Unknown keys are rejected (no mass assignment:
 * user id, timestamps and revision counts are never accepted from the client).
 */
export function parseScoreSubmission(body: unknown): Parsed<ScoreSubmission> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_body' };
  const b = body as Record<string, unknown>;
  const allowed = new Set(['roundId', 'hole', 'strokes', 'putts']);
  if (Object.keys(b).some((k) => !allowed.has(k))) return { ok: false, error: 'unexpected_field' };
  if (typeof b.roundId !== 'string' || !UUID_RE.test(b.roundId)) return { ok: false, error: 'invalid_round' };
  if (!int(b.hole, 1, 18)) return { ok: false, error: 'hole_out_of_range' };
  if (!int(b.strokes, 1, 15)) return { ok: false, error: 'strokes_out_of_range' };
  const putts = b.putts ?? 0;
  if (!int(putts, 0, b.strokes as number)) return { ok: false, error: 'putts_out_of_range' };
  return { ok: true, value: { roundId: b.roundId, hole: b.hole as number, strokes: b.strokes as number, putts: putts as number } };
}
