import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, initialOps, localDate, opsReducer, type OpsAction, type OpsState, type Registration, type Role } from './model';
import { demoTeeSheet, withDemoData } from './demoSeed';
import { EVENTS } from '../tournaments/events';

/**
 * Demo backend: ops state persisted locally and synced live across tabs/windows (player phone and
 * staff tablet side by side) via BroadcastChannel. In production these rows live in Postgres
 * (supabase/migrations/*_clubhouse.sql) behind RLS and stream over Realtime.
 */
const KEY = 'eg.ops.v1';
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eg-ops') : null;

const DEMO = !import.meta.env.VITE_SUPABASE_URL;

/** Load (and upgrade) the stored state; older saves get new settings defaults and fields. */
function read(): OpsState {
  let s: OpsState | null = null;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw?.v === 1 && raw.settings && Array.isArray(raw.orders) && Array.isArray(raw.registrations)) {
      s = {
        ...raw,
        settings: { ...DEFAULT_SETTINGS, ...raw.settings },
        registrations: raw.registrations.map((r: Registration) => ({ ...r, paid: r.paid ?? r.total })),
        teeSheet: Array.isArray(raw.teeSheet) ? raw.teeSheet : [],
        positions: Array.isArray(raw.positions) ? raw.positions : [],
      };
    }
  } catch { /* corrupt or blocked */ }
  if (!s) return DEMO ? withDemoData(initialOps(), EVENTS[0].id) : initialOps();
  // Keep the demo tee sheet on today's date.
  if (DEMO && !s.teeSheet.some((b) => b.id.startsWith('demo-tee-') && b.date === localDate())) {
    s = { ...s, teeSheet: [...demoTeeSheet(), ...s.teeSheet.filter((b) => !b.id.startsWith('demo-tee-'))] };
  }
  return s;
}

export function useOps(role: Role) {
  const [state, setState] = useState<OpsState>(read);
  useEffect(() => {
    const onMsg = () => setState(read());
    chan?.addEventListener('message', onMsg);
    window.addEventListener('storage', onMsg);
    return () => { chan?.removeEventListener('message', onMsg); window.removeEventListener('storage', onMsg); };
  }, []);
  const dispatch = useCallback((a: OpsAction) => {
    const next = opsReducer(read(), a, role);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
    setState(next);
    chan?.postMessage('changed');
  }, [role]);
  return [state, dispatch] as const;
}

export const newId = () => crypto.randomUUID();
