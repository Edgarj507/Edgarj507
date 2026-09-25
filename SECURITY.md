# Exclusive.Golf security architecture

```
 React app (Vite / Capacitor)                  Supabase
 ─────────────────────────────                 ─────────────────────────────────────────────
 AuthContext ── PKCE ──────────────────────▶  Auth (email/password, Apple, Google)
   │   session in sessionStorage                   │ issues short-lived JWT (sub = user id)
   │                                               ▼
 supabase-js (anon key + user JWT) ────────▶  PostgREST ──▶ Postgres with RLS on every table
   │  profiles / bags / rounds / friends            profiles · bags · rounds · round_players
   │  (reads + owner-scoped writes)                 friendships · hole_scores (read-only)
   │
 useRoundSync ── POST /submit-score ───────▶  Edge Function submit-score
                    Bearer JWT                  CORS allowlist → JWT verify → rate limit
                                                → strict schema → record_hole_score() (service role)
                                                  golf rules + participation + pace + edit caps
```

## 1. Authentication & sessions
| Control | Where |
|---|---|
| Managed auth (email/password + Apple/Google OAuth) | Supabase Auth, `src/auth/AuthContext.tsx` |
| PKCE flow (no tokens in URL fragments) | `src/lib/supabase.ts` |
| Tokens in `sessionStorage` (tab-scoped), not `localStorage` | `src/lib/supabase.ts` |
| Generic auth errors (no account enumeration) | `friendly()` in `AuthContext.tsx` |
| Password policy: ≥10 chars, letters + digits | `passwordProblem()` — also set the same minimum in Supabase Auth settings |
| Unauthenticated users see the sign-in screen; guests play offline only | `App.tsx` gate, `src/views/SignIn.tsx` |

**On HTTP-only cookies:** a static SPA/Capacitor app can't set HTTP-only cookies itself. Options, in order of strength:
1. **Web:** put the app behind a same-site backend that uses `@supabase/ssr` to hold the session in `HttpOnly; Secure; SameSite=Lax` cookies.
2. **Native:** replace the `storage` adapter with Keychain/Keystore (e.g. `capacitor-secure-storage-plugin`).
3. **Today:** strict CSP (below) plus short-lived JWTs (set JWT expiry to ≤ 1 h) plus tab-scoped storage.

## 2. Row-Level Security
Migration: `supabase/migrations/20260925000000_security_core.sql`. Tested against PGlite in `supabase/tests/rls.test.ts` (runs as the real `anon` / `authenticated` / `service_role` roles), and the migration also applies cleanly to Postgres 16.

| Table | Read | Write |
|---|---|---|
| `profiles` | self only (others via `profile_cards`, handicap hidden per `handicap_visibility`) | self; only name/handle/handicap/visibility columns |
| `bags` | owner | owner |
| `friendships` | either party | requester inserts `pending`; only addressee can set `accepted`; either deletes |
| `rounds` | owner, players, or anyone allowed by `visibility` | owner; only `status`/`visibility` updatable; completed rounds can't reopen |
| `round_players` | round owner and players | owner adds self or **accepted friends** only |
| `hole_scores` | self, or per the player's `stats_visibility` (partners see unless Private) | **none**: only `record_hole_score()` via service role |

`anon` has no table access. Column-level grants stop mass-assignment of `owner_id`, `status`, `revisions`, and similar fields.

## 3. Score anti-tampering
`record_hole_score()` is the only write path. It runs server-side with the user id taken from the verified JWT and enforces:
- the round exists and is `active`, and the user is a participant;
- the hole is inside the round's range (front 1–9, back 10–18);
- strokes are 1–15 and putts are between 0 and strokes;
- no jumping more than one hole ahead;
- at least 60 s between new holes;
- at most 3 corrections per hole.

A trigger freezes scores once a round is closed, even for privileged writers. The edge function (`supabase/functions/submit-score`) adds a strict schema that rejects unknown fields, a 1 KB body cap, per-user rate limiting, and error mapping that never leaks SQL.

## 4. Input sanitization & CORS
- **Shared rules:** `supabase/functions/_shared/validation.ts` is used by both the app and the server. It covers text normalization (strips control, bidi and markup characters), handle normalization, LIKE-wildcard escaping for course search, and the score schema.
- **Database checks:** CHECK constraints repeat the rules (handle regex, name/notes/course-name characters and lengths, JSON size limits).
- **Output:** React escapes on output, and the codebase has no `dangerouslySetInnerHTML`.
- **CSP:** production builds get a strict Content-Security-Policy (`script-src 'self'`, `connect-src` limited to the Supabase origin, `object-src 'none'`). Add `frame-ancestors 'none'` as an HTTP header at the host, because meta tags can't set it.
- **CORS:** `_shared/cors.ts` echoes only origins in `ALLOWED_ORIGINS` (https, `capacitor://localhost`, and `http://localhost:<port>` for dev). Preflights from other origins get 403. CORS only restrains browsers; JWT + RLS are the real authorization.

## 5. Secrets
- **Client values:** only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` reach the client. Both are public by design.
- **Build refuses secrets:** `vite.config.ts` refuses to build if any `VITE_*` variable looks like a server secret (name, `service_role` JWT, or DB URL).
- **Bundle scan:** `npm run build` runs `scripts/check-secrets.mjs` over `dist/` and fails on service-role JWTs, DB URLs, private keys, and Stripe/AWS keys.
- **Git:** `.env*` is gitignored (templates: `.env.example`, `supabase/functions/.env.example`). Server secrets go in `supabase secrets set …`.

## 6. Privacy
- **Profile settings:** Profile & Privacy has handicap visibility and live-score/stats visibility, each Public, Friends or Private.
- **Per round:** Round Setup has "Who can see this round", defaulting to the profile setting.
- **Enforcement:** all of these are enforced in SQL (`can_view`, `can_see_stats`), so every read path gets the same answer.
- **Guests:** guest data never leaves the device.

## 7. Crowdsourced pin network
Migration: `supabase/migrations/20260925010000_pin_tracking.sql`. Tests: `supabase/tests/pins.test.ts`.
- **Write path:** reports go only through `report_pin()`. The caller must be playing an active round on that course, and the hole must be in that round.
- **Report quality:** accuracy must be ≤ 10 m (≤ 1 m for LiDAR), and the report must be within 45 m of the green centre. Each user can report once per hole every 2 minutes.
- **Consensus:** it counts only the newest report per user from the last 10 h. It takes the median centre, rejects outliers more than 6 m away, then averages the rest weighted by 1/σ². "Verified" needs 3+ reporters with ≤ 2.5 m spread. This matches `_shared/pins.ts`; the tests check the two agree to within 0.2 m.
- **Reads:** raw reports (location + user) are readable only by their author. `pin_positions` (the consensus) is shared reference data and streams over Realtime.

## Deploying
```bash
supabase link --project-ref <ref>
supabase db push                                   # applies migrations
supabase secrets set ALLOWED_ORIGINS=https://exclusive.golf,capacitor://localhost,https://localhost
supabase functions deploy submit-score
```
Then, in the Supabase dashboard:
- **Auth → Providers:** enable Apple and Google.
- **Auth → URL Configuration:** add your site URL and redirect URLs, including `capacitor://localhost`.
- **Auth settings:** set the minimum password length to 10 and turn on leaked-password protection.
- **Tokens:** set the JWT expiry to ≤ 3600 s.
