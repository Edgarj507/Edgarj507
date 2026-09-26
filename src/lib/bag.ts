import { BRANDS, EQUIPMENT, optionId, type Category, type Model } from '../data/equipment';
import type { Club } from './caddie';

/** Gear chosen in the My Bag wizard (ids from data/equipment). */
export interface GearSelection {
  brands: string[];
  models: string[];
  options: string[];
}

export const EMPTY_GEAR: GearSelection = { brands: [], models: [], options: [] };

/** A club in the bag, derived from gear, with its (possibly overridden) carry. */
export interface BagClub extends Club {
  /** Stable key for carry overrides. */
  key: string;
  source: string;
  estimated: boolean;
}

const IRON_CARRY: Record<string, number> = {
  '1i': 225, '2i': 215, '3i': 205, '4i': 195, '5i': 185, '6i': 175, '7i': 165,
  '8i': 153, '9i': 141, PW: 130, W: 120, AW: 118, GW: 110, SW: 92,
};
const SORT = ['Drivers', 'Fairways', 'Hybrids', 'Irons', 'Wedges', 'Putters'] as const;

export const parseLoft = (option: string) => {
  const m = option.match(/(\d+(?:\.\d+)?)°/);
  return m ? Number(m[1]) : null;
};

/**
 * Typical amateur (≈95 mph driver) carry by loft, interpolated.
 * Woods/hybrids and wedges get separate curves because same-loft heads carry differently.
 */
const WOOD_CURVE: [number, number][] = [[8, 270], [10.5, 262], [12, 255], [13.5, 245], [15, 238], [16.5, 230], [18, 222], [21, 208], [24, 196], [27, 185], [30, 175]];
const WEDGE_CURVE: [number, number][] = [[42, 140], [44, 133], [46, 126], [48, 120], [50, 112], [52, 105], [54, 98], [56, 90], [58, 82], [60, 75], [62, 68], [64, 60]];

function interp(curve: [number, number][], x: number) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return Math.round(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
    }
  }
  return curve[curve.length - 1][1];
}

const fmtLoft = (l: number) => `${Number.isInteger(l) ? l : l.toFixed(1)}°`;

function woodLabel(category: Category, loft: number) {
  if (category === 'Drivers') return `Dr ${fmtLoft(loft)}`;
  if (category === 'Hybrids') return `Hy ${fmtLoft(loft)}`;
  const n = loft <= 16 ? 3 : loft <= 19.5 ? 5 : loft <= 22.5 ? 7 : 9;
  return `${n}W ${fmtLoft(loft)}`;
}

/** Map one catalog option to a club; null for options that aren't a playable club (none today). */
export function clubFromOption(model: Model, option: string): Omit<BagClub, 'key' | 'source' | 'estimated'> | null {
  switch (model.category) {
    case 'Putters':
      return { label: 'Putter', carry: 0 };
    case 'Irons':
      return option in IRON_CARRY ? { label: option, carry: IRON_CARRY[option] } : null;
    case 'Wedges': {
      const loft = parseLoft(option);
      return loft == null ? null : { label: fmtLoft(loft), carry: interp(WEDGE_CURVE, loft) };
    }
    default: {
      const loft = parseLoft(option);
      return loft == null ? null : { label: woodLabel(model.category, loft), carry: interp(WOOD_CURVE, loft) };
    }
  }
}

/**
 * Clubs for the HUD, derived from the gear selection. Duplicate labels keep the first match
 * (e.g. a 7i from two iron sets). Carry overrides from the user win over estimates.
 * Falls back to `fallback` when no playable club is selected.
 */
export function deriveBag(gear: GearSelection, overrides: Record<string, number>, fallback: Club[]): BagClub[] {
  const byLabel = new Map<string, BagClub & { rank: number }>();
  for (const brand of BRANDS) {
    if (!gear.brands.includes(brand)) continue;
    for (const model of EQUIPMENT[brand]) {
      for (const option of model.options) {
        if (!gear.options.includes(optionId(brand, model, option))) continue;
        const club = clubFromOption(model, option);
        if (!club || byLabel.has(club.label)) continue;
        byLabel.set(club.label, {
          ...club,
          key: club.label,
          source: `${brand} ${model.name}`,
          estimated: true,
          rank: SORT.indexOf(model.category),
        });
      }
    }
  }
  const derived = [...byLabel.values()]
    .sort((a, b) => a.rank - b.rank || b.carry - a.carry)
    .map(({ rank: _rank, ...c }) => c);
  const clubs: BagClub[] = derived.length
    ? derived
    : fallback.map((c) => ({ ...c, key: c.label, source: 'Default bag', estimated: true }));
  return clubs.map((c) => (c.key in overrides ? { ...c, carry: overrides[c.key], estimated: false } : c));
}
