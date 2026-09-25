import { useEffect, useReducer, useRef, useState } from 'react';
import { createSecureStore } from './secureStore';
import { isRoundState, newRound, roundReducer } from './round';
import type { Club } from './caddie';

const ROUND_KEY = 'eg.round.v3';
const BAG_KEY = 'eg.bag.v1';

const local = (() => {
  try {
    const ls = window.localStorage;
    ls.getItem('');
    return ls;
  } catch {
    return null; // storage blocked (private mode / sandboxed webview) — run in-memory
  }
})();
const store = local ? createSecureStore(local) : null;

/** 18-hole round state, persisted tamper-evident (score is the value worth protecting). */
export function useRound() {
  const [state, dispatch] = useReducer(roundReducer, undefined, () => newRound());
  const hydrated = useRef(!store);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    store.load<unknown>(ROUND_KEY).then((saved) => {
      if (alive && isRoundState(saved)) dispatch({ type: 'hydrate', state: saved });
      hydrated.current = true;
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (hydrated.current) void store?.save(ROUND_KEY, state);
  }, [state]);

  return [state, dispatch] as const;
}

export const DEFAULT_BAG: Club[] = [
  { label: 'Dr', carry: 265 }, { label: '3W', carry: 240 }, { label: '5W', carry: 225 },
  { label: '4i', carry: 200 }, { label: '5i', carry: 190 }, { label: '6i', carry: 178 },
  { label: '7i', carry: 166 }, { label: '8i', carry: 154 }, { label: '9i', carry: 142 },
  { label: 'PW', carry: 130 }, { label: '52°', carry: 110 }, { label: '56°', carry: 92 },
  { label: '60°', carry: 70 }, { label: 'Putter', carry: 0 },
];

const isBag = (x: unknown): x is Club[] =>
  Array.isArray(x) && x.every((c) => typeof c?.label === 'string' && Number.isFinite(c?.carry));

/** Club carry yardages that drive the HUD's club recommendation. */
export function useBag() {
  const [bag, setBag] = useState<Club[]>(() => {
    try {
      const saved = JSON.parse(local?.getItem(BAG_KEY) ?? 'null');
      return isBag(saved) ? saved : DEFAULT_BAG;
    } catch {
      return DEFAULT_BAG;
    }
  });
  useEffect(() => {
    try { local?.setItem(BAG_KEY, JSON.stringify(bag)); } catch { /* quota / blocked */ }
  }, [bag]);
  return [bag, setBag] as const;
}
