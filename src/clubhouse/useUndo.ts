import { useCallback, useEffect, useState } from 'react';
import { haptic } from '../lib/haptics';
import { inverseOf, type OpsAction, type OpsState } from '../ops/model';
import { newId } from '../ops/useOps';

export interface HistoryEntry { id: string; label: string; at: number; inverse: OpsAction }

/**
 * Staff fault tolerance: every correctable action is recorded with its inverse, so a mis-tap
 * ("Mark Completed" on the wrong order, a wrong block, a toggle) can be reverted from the
 * snackbar or the Recent Actions drawer. Kept for the session (last 50 actions).
 */
export function useUndo(state: OpsState, dispatch: (a: OpsAction) => void) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [snack, setSnack] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    if (!snack) return;
    const id = setTimeout(() => setSnack(null), 7_000);
    return () => clearTimeout(id);
  }, [snack]);

  /** Dispatch `a`, remembering how to reverse it. */
  const act = useCallback((a: OpsAction, label: string) => {
    const inverse = inverseOf(state, a);
    dispatch(a);
    if (!inverse) return;
    const e = { id: newId(), label, at: Date.now(), inverse };
    setHistory((h) => [e, ...h].slice(0, 50));
    setSnack(e);
  }, [state, dispatch]);

  // Side effects stay outside state updaters (StrictMode runs updaters twice).
  const undo = useCallback((id: string) => {
    const e = history.find((x) => x.id === id);
    if (!e) return;
    dispatch(e.inverse);
    haptic('warning');
    setHistory((h) => h.filter((x) => x.id !== id));
    setSnack((sn) => (sn?.id === id ? null : sn));
  }, [dispatch, history]);

  return { act, undo, history, snack, dismissSnack: () => setSnack(null) };
}
