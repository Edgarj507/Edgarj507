import { useCallback, useEffect, useState } from 'react';
import { initialOps, opsReducer, type OpsAction, type OpsState, type Role } from './model';

/**
 * Demo backend: ops state persisted locally and synced live across tabs/windows (player phone and
 * staff tablet side by side) via BroadcastChannel. In production these rows live in Postgres
 * (supabase/migrations/*_clubhouse.sql) behind RLS and stream over Realtime.
 */
const KEY = 'eg.ops.v1';
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eg-ops') : null;

function read(): OpsState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s?.v === 1 && s.settings && Array.isArray(s.orders) && Array.isArray(s.registrations)) return s;
  } catch { /* corrupt or blocked */ }
  return initialOps();
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
