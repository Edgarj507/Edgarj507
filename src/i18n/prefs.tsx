import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LANGUAGES, translate, type Lang, type StringKey } from './strings';

export type Units = 'yards' | 'meters';

export interface Prefs {
  lang: Lang;
  units: Units;
  communityPins: boolean;
  /** Language came from device detection (vs. chosen by the user). */
  langDetected: boolean;
}

const KEY = 'eg.prefs.v1';
const YD_TO_M = 0.9144;
/** Regions where golf yardages are conventionally in yards. Everything else defaults to meters. */
const YARD_REGIONS = new Set(['US', 'GB', 'IE', 'CA', 'PR', 'GU', 'VI']);

/** Pick a supported language + default units from the browser/OS locale list. */
export function detectPrefs(locales: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Pick<Prefs, 'lang' | 'units'> {
  let lang: Lang = 'en';
  let region: string | undefined;
  for (const tag of locales) {
    const [base, reg] = tag.replace('_', '-').split('-');
    const b = base?.toLowerCase();
    if (b && b in LANGUAGES) {
      lang = b as Lang;
      region = reg?.toUpperCase();
      break;
    }
  }
  region ??= locales[0]?.replace('_', '-').split('-')[1]?.toUpperCase();
  const units: Units = region ? (YARD_REGIONS.has(region) ? 'yards' : 'meters') : lang === 'en' ? 'yards' : 'meters';
  return { lang, units };
}

function load(): Prefs {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && s.lang in LANGUAGES && (s.units === 'yards' || s.units === 'meters')) {
      return { lang: s.lang, units: s.units, communityPins: s.communityPins !== false, langDetected: !!s.langDetected };
    }
  } catch { /* blocked or corrupt */ }
  return { ...detectPrefs(), communityPins: true, langDetected: true };
}

/** Convert a yardage for display. All internal maths stays in yards. */
export const convert = (yards: number, units: Units) => (units === 'meters' ? yards * YD_TO_M : yards);

interface PrefsValue extends Prefs {
  set: (patch: Partial<Omit<Prefs, 'langDetected'>>) => void;
  t: (key: StringKey) => string;
  /** Rounded distance in the user's unit. */
  d: (yards: number) => number;
  /** Unit suffix: "y" or "m". */
  u: string;
}

const Ctx = createContext<PrefsValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* quota / blocked */ }
    document.documentElement.lang = prefs.lang;
  }, [prefs]);

  const value = useMemo<PrefsValue>(() => ({
    ...prefs,
    set: (patch) => setPrefs((p) => ({ ...p, ...patch, langDetected: patch.lang ? false : p.langDetected })),
    t: (key) => translate(prefs.lang, key),
    d: (yards) => Math.round(convert(yards, prefs.units)),
    u: prefs.units === 'meters' ? 'm' : 'y',
  }), [prefs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return v;
}
