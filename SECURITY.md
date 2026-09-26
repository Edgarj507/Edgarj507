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

## 8. Roles: Player App vs Clubhouse OS (B2B2C RBAC)

| | Player | Staff (Clubhouse OS) |
|---|---|---|
| Sign-in | Phone (SMS OTP in cloud mode), email or guest; Face ID quick-login on enrolled devices | Staff PIN (6 digits) or Face ID on an authorised tablet |
| Tee sheet, rosters, contacts | Own registrations only | Full course (`reg_read` → `is_staff()`) |
| Master toggles (Hail Drink Cart, Live Ordering, mulligan limit) | Read only | Update (`settings_staff`) |
| Orders | Create own; read own | Read course queue; move status only (`orders_staff_update`, column grant on `status`) |

- **Server enforcement** (`supabase/migrations/20260927000000_clubhouse.sql`): staff rights come only from `staff_members` rows, which clients can't write (select-own policy only, no insert/update grants). Every table is behind RLS.
- **Server-side pricing**: `price_order()` recomputes totals from `menu_items`, rejects unknown SKUs and bad quantities, applies the master toggles (`ordering_off`, `hail_cart_off`) and caps charity mulligans per player per 18h (`mulligan_limit`). A client-sent total is ignored. Charity-only orders are recorded as delivered.
- **Verified rosters**: `valid_roster()` requires exactly three players, each with a name, an E.164 phone and an email, with no markup. Registrations are inserted unpaid; only the payment webhook (service role) marks them paid.
- **UI switch**: `RoleProvider` renders *either* the Player App or the Clubhouse OS. A player session never mounts staff views. The staff session lives in memory only: a reload locks it, and it auto-locks after 15 minutes idle.
- **Staff PIN**: PBKDF2-SHA-256 with 150k iterations and a random salt. Comparison is constant-time. Five failures lock it for 5 minutes.
- **Face ID**: WebAuthn platform authenticator with the user-verification flag checked. In this build it is a *local* gate (unlock and purchase confirmation). For server-trusted biometric login, verify the assertion server-side (e.g. SimpleWebAuthn in an edge function) against the stored public key.

**Demo-mode caveats**: without `VITE_SUPABASE_URL`, several things are local-only:
- Ops data (orders, settings, registrations) lives in `localStorage` and is synced across tabs with BroadcastChannel. The role check in `opsReducer` mirrors RLS, but anything on the device is user-editable, so production must use the cloud tables.
- The staff PIN is per-device.
- Payments are simulated and no receipt email is sent.

## 9. Event phases & geofenced location privacy

**Phases.** The Clubhouse OS has two event phases, switched by staff with "Start Tournament" (`course_settings.tournament_live`):

| | Pre-Tournament CRM | Live Event |
|---|---|---|
| Map / radar | None | Satellite pace radar |
| Player locations | Not collected, not stored, not shown | On property only, during the event |
| Captain roster edits | Allowed (`reg_captain_edit` → `event_editable()`) | Locked (staff can still override) |

- **Ending the event** (`on_live_change` trigger) deletes every stored position for the course.

**Geofence** (`src/lib/geofence.ts`, `src/ops/useTelemetry.ts`):
- **Boundary:** the course boundary is the convex hull of every mapped hole, plus a **250 ft (76.2 m) buffer** for phone GPS drift and parking-lot arrivals.
- **Client gate:** the phone watches GPS only while the event is live, the player is on a registered team, and the time is inside the event window. Every fix is checked against the geofence.
- **Auto-kill switch:** if a player hasn't arrived, or leaves the buffer, the app stops sending and deletes the last stored fix (`unping`, or `delete` on `live_positions`). It also severs the broadcast when the app is backgrounded.
- **Server backstop:** `live_positions` RLS (`position_allowed()`) accepts a fix only if the event is live, the sender is the captain or on the roster (phone match via `auth.users`), and the point is inside the course's buffered box. Staff can read positions only while live.
- **Keeping client and server in sync:** a unit test checks that the SQL box matches the app's boundary.
- **Notice:** checkout and round setup both show *"Live tracking is strictly limited to your scheduled tee time and only activates upon arrival at the facility."*

**Hours of operation:** `price_order()` rejects food and drink with `kitchen_closed` outside the restaurant hours, in the course's timezone. The app shows a locked "Kitchen Closed" state instead of the menu. Pro shop items and charity mulligans are unaffected.

**Tee sheet:** `tee_times` is staff-only (RLS `tee_staff`) and allows one booking per course and start time. A reservation needs a party of 1–4 and a valid phone number.

**Tee-sheet blocks** (`20260929000000_tee_blocks.sql`, staff-only RLS `tee_blocks_staff`):
- **Reasons:** each block has one reason from a fixed list: Maintenance, Private Event, Tournament, Season Closed, Irrigation repair, Weather, League, Other.
- **Scope:** a block covers one tee time, a time window, or whole days across a date range of up to a year.
- **Enforcement:** the `check_tee_block` trigger refuses reservations inside a block, using the course's local time.

**Code layout:** the Clubhouse OS keeps two areas apart:
- `src/clubhouse/everyday/`: Tee Sheet and Settings.
- `src/clubhouse/tournament/`: CRM, Live Radar, pace alerts and the Start switch.
- Tournament state (positions, pace, alerts) is computed only in `tournament/useLiveEvent.ts`, and only while the event is live.

**Demo-mode caveats:**
- Group pace on the radar is simulated. A real on-property fix replaces the simulated dot.
- The server-side geofence is a buffered bounding box; the exact hull-plus-buffer test runs on the phone.

## 10. Legal, fulfillment reporting & event branding

**Legal documents** (`src/legal/`): Terms of Service & EULA, Privacy Policy (including the geofencing policy) and Liability Waiver.
- **Where they appear:** they can be opened at sign-up, at ticket checkout and from Settings → Legal.
- **Mandatory acceptance:**
  - Sign-up (including guest play) requires all three.
  - Every ticket checkout requires the Waiver and the Terms.
- **Records:** acceptances are stored by document version. Changing a document's `version` asks players to accept again.
- **Cloud mode:** each acceptance is also written to `legal_acceptances`.
  - The table is append-only: there are no update or delete grants.
  - Players read only their own rows; organizers see waivers for their own event.
- **Templates only:** the text is a plain-language TEMPLATE. Have counsel review it before launch, especially:
  - jurisdiction;
  - waiver enforceability and minors;
  - captains accepting on behalf of teammates;
  - refunds and dispute resolution.

**Fulfillment and End of Day:**
- Orders move `new` → (`enroute`) → `completed`. The old `delivered` status is migrated.
- Only course staff can change order status (`orders_staff_update`).
- The server stamps `completed_at` (`stamp_completion` trigger, or `price_order()` for charity-only orders); clients can't set it.
- `eod_tally(course, day)` groups completed orders by item for the course's local date. It returns rows only for that course's staff.

**Event branding:**
- Organizers edit the message and banner/flyer: images (PNG, JPEG, WebP) or PDF, 1.5 MB max.
- **Server:** `events_staff_edit` limits edits to course staff. `description` rejects markup, and `banner_path` only allows safe storage keys with an image or PDF extension.
- **Client:** the file's declared type must match its data URL; SVG is rejected.
- **Demo mode:** the flyer is kept inline. In production, upload it to an `event-banners` storage bucket (staff write, public read) and store the key.

**In-House Tournament mode** (`settings.inHouse`) only changes the Clubhouse OS layout. It merges the tee sheet with the CRM / Live Radar; the privacy rules in section 9 are unchanged.

## 11. Security audit (Sep 2026) — findings & fixes

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **Critical** | **Staff access is client-only.** The Clubhouse OS runs off the local ops store (`useOps`) in *both* modes; the role is set in memory by `RoleContext`. The staff PIN is created on first use on any device, so a player could create a PIN on their own phone and open the Clubhouse OS. | **Partly fixed.** In cloud mode, `StaffPortal` now requires a signed-in account with a `staff_members` row (checked on the server under RLS) before a PIN can be created or used. **Still open:** the Clubhouse OS still reads and writes the local ops store instead of the RLS-protected tables; wiring it to them is the next backend task. Demo mode remains local by design. |
| 2 | **High** | **Client-side tampering (demo store).** `order.total`, `registration.paid`, `pay` and `register` come from the client. | **Server-side protection exists:** `price_order()` recomputes totals, and `paid` is service-role only (payment webhook). Demo-only elsewhere; resolved together with #1. |
| 3 | **High** | **Geofence was a bounding box on the server.** Positions anywhere in the box were accepted, and nothing stopped teleporting, rapid-fire or low-accuracy fixes. | **Fixed:** `on_property()` checks the exact course outline plus a 76.2 m (250 ft) buffer. `check_position()` rejects more than one fix per 3 s, speeds above 25 m/s, and accuracy worse than 100 m. Fixes are accepted only within 12 h of the event going live, and `purge_stale_positions()` deletes positions by the end of the event day. **Limitation:** GPS can't be proven genuine; this limits spoofing, it doesn't eliminate it. |
| 4 | Medium | **Order/hail spam and unknown courses.** | **Fixed:** at most 5 open orders and 1 open hail per player (`limit_open_orders`); `unknown_course` is rejected. |
| 5 | Medium | **Player cancel had no server rule.** | **Fixed:** policy `orders_player_cancel` allows only their own order, only while `new`, within 2 minutes, and only to `cancelled`. |
| 6 | Medium | **Self check-in.** Captains can update their own registration row. | **Fixed:** the `guard_checkin` trigger makes `checked_in_at` staff-only. |
| 7 | Low | **`mailto:`/`tel:` injection.** `EMAIL_RE` allows `?` and `&`, so `a?cc=x@evil.com` could add recipients. | **Fixed:** links now use `encodeURIComponent`. |
| 8 | Low | **CSV formula injection** in the End of Day export. | **Fixed:** `csvCell()` prefixes `= + - @` values. |
| 9 | Info | **XSS.** No `dangerouslySetInnerHTML`; React escapes all user text; MapLibre labels use `textContent`; SVG uploads are refused; flyers open as typed blobs. Team names, notes, tickets and organizer text are sanitized and have `<>` checks in the database. | No issue found. |

**Support tickets:**
- Reporters can't set a ticket's status; only course staff can change status or notes.
- Each reporter is limited to 10 tickets per day.
- Diagnostics are capped at 12 KB, and personal data and secrets are scrubbed from them on the device.
- Screenshots are re-encoded through a canvas, which strips EXIF/GPS metadata.

**Undo:** staff corrections are recorded with their inverse action (`inverseOf`). Starting or ending a tournament is intentionally not undoable, because it starts or stops location sharing.

## 12. Comms, SOS, inventory, organizers & course verification

Migration `20261002000000_comms_inventory_organizers.sql`; tests in `supabase/tests/comms_inventory.test.ts`.

| Area | Who can do what (enforced by RLS / triggers) |
|---|---|
| **Store & inventory** (`menu_items`) | Only that course's staff can insert, update or delete items. Golfers see only items that are `active` and `visible`. `price_order()` refuses hidden and sold-out items, decrements stock atomically (`for update`) and restocks on cancel. |
| **Charity mulligans** | Sold only while `course_settings.in_house` **and** `tournament_live` are on (`charity_closed`). The per-player limit still applies, and cancelled orders don't count toward it. |
| **Phone-in orders** | `source = 'phone'` requires course staff (`staff_only`) plus the golfer's name and an E.164 phone number. A free-text note (≤ 200 chars, no `<>`) is allowed. Phone orders bypass the Live Ordering switch, but not kitchen hours or stock. |
| **Beverage carts** | Staff only, so golfers can't see where the carts are. Every order is assigned server-side to the nearest active cart, with ties going to the lighter load. Only staff can reassign. |
| **Messages** | A golfer can write only in their own thread, as `player`. Staff and carts write as `staff`/`cart`. Each side can flip only its own read flag, and the body is immutable. Limit: 20 messages per minute per sender. Bodies are plain text (no `<>`). |
| **Broadcasts** | Staff can send to any audience. Organizers can send only `event` broadcasts, and only for events they own. Event broadcasts are readable only by that event's registered golfers (captain, or roster phone matched to the verified auth phone). Limit: 10 broadcasts per 10 minutes. |
| **SOS** | A golfer can raise an alert only for themselves, and cart SOS requires staff. One open alert per reporter. Only staff can read other people's alerts. The reporter can cancel only while the alert is still `active`. Staff acknowledge (the server stamps `ack_by`/`ack_at`) and resolve; closed alerts can't be reopened. |
| **Organizers & events** | Only verified `organizers` can create events, and only at directory `venues`. `course_name` is derived from the venue and `organizer_id` is forced to the caller. They can edit only their own events, and delete only those with no registrations. Ownership changes are admin/service-role only. Organizers can read and check in their own events' teams. |
| **Course verification** | The applicant creates a `pending` claim with proof (private storage path). Only platform admins can read claims from others or decide them, and each claim is decided once. **Approval is what grants Clubhouse OS access:** it creates the `staff_members` row and the `course_settings` row. |
| **Favorites / shares** | Favorites are private. Event shares can go only to **accepted friends**; they can't be sent to strangers. |

**Client side:**
- **Weather.** Coordinates sent to Open-Meteo and NWS are rounded to about 1 km. The personal weather guard uses GPS only for the lookup and never shares it with the course.
- **SOS triggering.** SOS requires a 1.5 s press-and-hold to prevent pocket-dials, and always offers `tel:911`.
- **Uploads.** Proof uploads are re-encoded (images, EXIF stripped) or checked for the `%PDF-` magic bytes, and capped at 1.5 MB.
- **Radar pins.** Map pins are LngLat-anchored MapLibre markers; styling is on an inner node, so pins don't drift when zooming. The SVG fallback zooms only its `viewBox`.

**Demo-mode limitations** (no `VITE_SUPABASE_URL`):
- The local store checks roles in `opsReducer`, but anyone with the device can switch roles.
- The **"Demo: approve"** button on course claims stands in for the Exclusive.Golf admin review.
- Organizer sign-in isn't verified.
- Push notifications only reach phones with the app open or backgrounded (Web Notifications). Delivering to closed apps needs APNs/FCM from a server function.
- The lightning risk score is a heuristic (thunderstorm codes, NWS warnings, CAPE). Strike-distance alerts need a licensed feed plugged into `LightningProvider`.

## 13. Tee-time booking, pricing & SOS confirmation

Migration `20261003000000_tee_booking_pricing.sql`; tests in `supabase/tests/tee_booking.test.ts`.

- **Pricing** (`tee_pricing`, `tee_rate_bands`): readable by everyone signed in, and writable only by that course's staff. Policy text is plain (no `<>`) and has length limits.
- **Booking:**
  - Golfers can't insert into `tee_times`. They call `book_tee_time()`, which checks course hours, the tee interval, the booking window, "not in the past", blocks (trigger), the walking rule and the per-golfer limit.
  - The name and phone come from the verified account, and the price comes from `tee_quote()`. A client-sent price is never used.
  - A double booking returns `tee_time_taken` (unique constraint).
- **Privacy:** golfers read only their own reservations. `tee_availability()` shows taken/blocked slots without names or phone numbers.
- **Cancellation:** `cancel_tee_time()` works only on your own app reservation, and only outside the course's cancellation window.
- **SOS false alarms:** tapping SOS only opens a full-screen confirmation. The alert is sent after a 2-second press-and-hold. Releasing early, "No, I'm OK" or closing the screen sends nothing. Cart SOS in the Clubhouse OS needs a second tap to confirm.

## 14. Manual roster entry & cross-tournament reassignment

Migration `20261004000000_roster_entry_reassign.sql`; tests in `supabase/tests/roster_reassign.test.ts`.

- **Functions only:** `staff_register()`, `move_registration()` and `move_player()` are security-definer functions. The caller must manage the event: be staff of that course, or the event's own organizer. A move needs rights on **both** the source and target events.
- **Event checks:** the target must be scheduled, in the future and not full.
- **Duplicates:** a golfer's phone can appear only once per event, whether as a captain account, a captain contact or a roster slot.
- **Payments:** a desk-recorded payment is capped at the foursome price. A moved team keeps its paid amount, and its price becomes the new event's. A moved player carries `min(team paid / players, one seat)`, and the team keeps the rest.
- **Accountless golfers:** walk-up and phone-in captains need no account. They're stored as a validated `captain_contact` using the same rules as roster slots (name, E.164 phone, email, no `<>`).
- **Audit:** every entry and move is written to `registration_audit` (who, from, to, amount), readable only by people who manage those events.
- **Undo (app):** the move actions record an exact snapshot (`restoreRegs`), so Undo puts the registrations back as they were.

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
