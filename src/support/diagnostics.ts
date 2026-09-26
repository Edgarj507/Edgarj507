import type { Diagnostics } from '../ops/model';

/**
 * Bug-report auto-diagnostics. Captures recent client errors in a small ring buffer and builds a
 * non-sensitive metadata payload. Everything is scrubbed: no emails, phone numbers, tokens or GPS
 * coordinates ever leave the device in a report.
 */
const MAX_ERRORS = 20;
const errors: { at: number; msg: string }[] = [];
let currentView = 'unknown';
let installed = false;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Redact personal data and secrets from free text (error messages, stack lines). */
export function scrub(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]')
    .replace(/\b(bearer|token|apikey|api_key|access_token|key)=?[:\s]*[\w.-]{16,}/gi, '$1 [secret]')
    .replace(/\b(sk|pk)\.[\w.-]{16,}/g, '[secret]')
    .replace(/[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/gi, '[email]')
    .replace(/-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, '[coords]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]')
    .replace(/\b[0-9a-f]{32,}\b/gi, '[hex]')
    .slice(0, 300);
}

function record(msg: unknown) {
  const text = msg instanceof Error ? `${msg.name}: ${msg.message}` : typeof msg === 'string' ? msg : (() => { try { return JSON.stringify(msg); } catch { return String(msg); } })();
  errors.unshift({ at: Date.now(), msg: scrub(text) });
  errors.length = Math.min(errors.length, MAX_ERRORS);
}

/** Start capturing errors (window errors, unhandled rejections, console.error). Idempotent. */
export function installErrorCapture() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => record(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => record(e.reason));
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => { record(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')); orig(...args); };
}

export const setDiagnosticView = (view: string) => { currentView = view; };
export const recentErrors = () => errors.map((e) => `${new Date(e.at).toISOString()} ${e.msg}`);
/** Test hook. */
export const recordError = record;

export function collectDiagnostics(role: 'player' | 'staff'): Diagnostics {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;
  return {
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
    view: currentView,
    role,
    online: nav?.onLine ?? true,
    userAgent: (nav?.userAgent ?? '').slice(0, 300),
    language: nav?.language ?? '',
    viewport: win ? `${win.innerWidth}x${win.innerHeight}@${win.devicePixelRatio}x` : '',
    standalone: !!win?.matchMedia?.('(display-mode: standalone)').matches,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    recentErrors: recentErrors(),
  };
}
