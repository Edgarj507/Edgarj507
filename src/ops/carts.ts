import { SOMERBY_DATA } from '../data/course';

/** Beverage carts on the course. Each reports the hole it's at; orders go to the nearest one. */
export interface BevCart { id: string; name: string; hole: number; active: boolean; updatedAt: number }

export const DEFAULT_CARTS: BevCart[] = [
  { id: 'cart-1', name: 'Cart 1 · Front nine', hole: 3, active: true, updatedAt: 0 },
  { id: 'cart-2', name: 'Cart 2 · Back nine', hole: 12, active: true, updatedAt: 0 },
];

/** Holes apart along the routing (the course is a loop, so 18 and 1 are neighbours). */
export const holeDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 18;
  return Math.min(d, 18 - d);
};

/** Nearest active cart to a hole; ties go to the cart with fewer open deliveries. */
export function nearestCart(carts: BevCart[], hole: number, load: (id: string) => number = () => 0): BevCart | undefined {
  return carts
    .filter((c) => c.active)
    .sort((a, b) => holeDistance(a.hole, hole) - holeDistance(b.hole, hole) || load(a.id) - load(b.id) || a.id.localeCompare(b.id))[0];
}

/** A representative point for a hole (middle of its line of play) — used for phone-in orders and cart dots. */
export function holePoint(hole: number): [number, number] {
  const path = SOMERBY_DATA.holes[Math.min(18, Math.max(1, hole)) - 1]?.path ?? [SOMERBY_DATA.center];
  return path[Math.floor(path.length / 2)] as [number, number];
}
