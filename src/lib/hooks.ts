import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createSecureStore } from './secureStore';
import { isRoundState, newRound, roundReducer } from './round';
import type { Club } from './caddie';
import { deriveBag, EMPTY_GEAR, type GearSelection } from './bag';

const ROUND_KEY = 'eg.round.v3';

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

const GEAR_KEY = 'eg.gear.v1';
const CARRY_KEY = 'eg.carry.v1';

function useLocalJson<T>(key: string, fallback: T, valid: (x: unknown) => x is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = JSON.parse(local?.getItem(key) ?? 'null');
      return valid(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try { local?.setItem(key, JSON.stringify(value)); } catch { /* quota / blocked */ }
  }, [key, value]);
  return [value, setValue] as const;
}

const strArr = (x: unknown) => Array.isArray(x) && x.every((v) => typeof v === 'string');
const isGear = (x: unknown): x is GearSelection => {
  const g = x as GearSelection;
  return !!g && strArr(g.brands) && strArr(g.models) && strArr(g.options);
};
const isCarryMap = (x: unknown): x is Record<string, number> =>
  !!x && typeof x === 'object' && !Array.isArray(x) &&
  Object.values(x).every((v) => Number.isInteger(v) && v >= 0 && v <= 400);

/**
 * The golfer's bag: gear picked in My Bag → clubs with estimated carries, plus per-club carry
 * overrides. This is what the HUD's club recommendation uses.
 */
export function useBag() {
  const [gear, setGear] = useLocalJson<GearSelection>(GEAR_KEY, EMPTY_GEAR, isGear);
  const [overrides, setOverrides] = useLocalJson<Record<string, number>>(CARRY_KEY, {}, isCarryMap);
  const bag = useMemo(() => deriveBag(gear, overrides, DEFAULT_BAG), [gear, overrides]);
  const setCarry = (key: string, carry: number) =>
    setOverrides((o) => ({ ...o, [key]: Math.max(5, Math.min(400, Math.round(carry))) }));
  const resetCarry = (key: string) => setOverrides(({ [key]: _drop, ...rest }) => rest);
  return { bag, gear, setGear, setCarry, resetCarry };
}
