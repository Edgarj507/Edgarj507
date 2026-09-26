import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, fromMin, initialOps, localDate, opsReducer, toMin, type OpsAction, type OpsState, type Order, type Registration, type Role, type TeeBlock } from './model';
import { DEMO_VERIFICATION, demoTeeSheet, withDemoData } from './demoSeed';
import { EVENTS } from '../tournaments/events';

/**
 * Demo backend: ops state persisted locally and synced live across tabs/windows (player phone and
 * staff tablet side by side) via BroadcastChannel. In production these rows live in Postgres
 * (supabase/migrations/*_clubhouse.sql) behind RLS and stream over Realtime.
 */
const KEY = 'eg.ops.v1';
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eg-ops') : null;

const DEMO = !import.meta.env.VITE_SUPABASE_URL;

const legacyBlock = (b: { id: string; date: string; time: string; name: string }): TeeBlock => ({
  id: b.id, reason: 'Other', note: b.name, startDate: b.date, endDate: b.date, from: b.time, to: fromMin(toMin(b.time) + 10),
});

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
        // Older saves stored blocks as 'blocked' bookings; turn each into a one-slot block.
        teeSheet: (Array.isArray(raw.teeSheet) ? raw.teeSheet : []).filter((b: { status: string }) => b.status === 'reserved'),
        teeBlocks: [
          ...(Array.isArray(raw.teeBlocks) ? raw.teeBlocks : []),
          ...(Array.isArray(raw.teeSheet) ? raw.teeSheet : []).filter((b: { status: string }) => b.status === 'blocked').map(legacyBlock),
        ],
        positions: Array.isArray(raw.positions) ? raw.positions : [],
        eventDetails: raw.eventDetails && typeof raw.eventDetails === 'object' ? raw.eventDetails : {},
        tickets: Array.isArray(raw.tickets) ? raw.tickets : [],
        // Newer collections: fall back to the defaults for older saves.
        ...Object.fromEntries((['menu', 'carts', 'messages', 'broadcasts', 'sos', 'events', 'verifications', 'shares'] as const)
          .map((k) => [k, Array.isArray(raw[k]) ? raw[k] : k === 'verifications' && DEMO ? [DEMO_VERIFICATION] : initialOps()[k]])),
        // 'delivered' was renamed 'completed' (End of Day tally counts completed orders).
        orders: raw.orders.map((o: Omit<Order, 'status'> & { status: string }) => (o.status === 'delivered' ? { ...o, status: 'completed', completedAt: o.completedAt ?? o.createdAt } : o)),
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

// Other useOps() hooks in this same page (BroadcastChannel never delivers to its own sender).
const local = new Set<(s: OpsState) => void>();

export function useOps(role: Role) {
  const [state, setState] = useState<OpsState>(read);
  useEffect(() => {
    const onMsg = () => setState(read());
    chan?.addEventListener('message', onMsg);
    window.addEventListener('storage', onMsg);
    local.add(setState);
    return () => { chan?.removeEventListener('message', onMsg); window.removeEventListener('storage', onMsg); local.delete(setState); };
  }, []);
  const dispatch = useCallback((a: OpsAction) => {
    const next = opsReducer(read(), a, role);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
    local.forEach((fn) => fn(next));
    chan?.postMessage('changed');
  }, [role]);
  return [state, dispatch] as const;
}

export const newId = () => crypto.randomUUID();
