/**
 * Tactile feedback. Uses Capacitor's Haptics plugin inside the native iOS/Android shell (iOS
 * Safari has no Vibration API), and `navigator.vibrate` in browsers that support it. Everything
 * is a no-op where unsupported or when the player turns haptics off in Settings.
 */
export type Haptic = 'tap' | 'toggle' | 'success' | 'warning' | 'error';

const KEY = 'eg.haptics.v1';
const PATTERN: Record<Haptic, number | number[]> = { tap: 8, toggle: 14, success: [12, 40, 18], warning: [30, 50, 30], error: [60, 40, 60] };

interface CapHaptics { impact(o: { style: 'LIGHT' | 'MEDIUM' }): Promise<void>; notification(o: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): Promise<void> }
const cap = () => (globalThis as { Capacitor?: { Plugins?: { Haptics?: CapHaptics } } }).Capacitor?.Plugins?.Haptics;

export const hapticsEnabled = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setHapticsEnabled = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* blocked */ } };

export function haptic(kind: Haptic = 'tap') {
  if (!hapticsEnabled()) return;
  const native = cap();
  if (native) {
    void (kind === 'tap' || kind === 'toggle'
      ? native.impact({ style: kind === 'tap' ? 'LIGHT' : 'MEDIUM' })
      : native.notification({ type: kind === 'success' ? 'SUCCESS' : kind === 'warning' ? 'WARNING' : 'ERROR' })).catch(() => {});
    return;
  }
  try { navigator.vibrate?.(PATTERN[kind]); } catch { /* unsupported */ }
}

/**
 * App-wide light feedback: every button / switch / radio press gets a tap (switches a firmer
 * "toggle"). Opt out per element with data-haptic="off"; key moments (orders, payments,
 * check-ins, undo) call `haptic('success' | 'warning')` explicitly.
 */
export function installHaptics() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, [role="switch"], [role="radio"], [role="tab"], input[type="checkbox"]');
    if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-haptic="off"]')) return;
    haptic(el.getAttribute('role') === 'switch' || (el as HTMLInputElement).type === 'checkbox' ? 'toggle' : 'tap');
  }, { capture: true, passive: true });
}
