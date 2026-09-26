import { sanitizeText } from '../../supabase/functions/_shared/validation.ts';

/** Clubhouse inventory: what players can order, at what price, and how many are left. */
export type StoreCategory = 'food' | 'beverage' | 'proshop' | 'apparel' | 'charity';
export interface StoreItem {
  sku: string;
  name: string;
  category: StoreCategory;
  price: number;
  /** null = not tracked (made to order). */
  stock: number | null;
  /** Hidden items can't be ordered in the app. */
  visible: boolean;
}

export const CATEGORY_LABEL: Record<StoreCategory, string> = { food: 'Food', beverage: 'Beverage', proshop: 'Pro Shop', apparel: 'Apparel', charity: 'Charity' };
/** Order-item kind used by the kitchen-hours and charity rules. */
export const kindOf = (c: StoreCategory) => (c === 'food' || c === 'beverage' ? 'fnb' : c === 'charity' ? 'charity' : 'shop') as 'fnb' | 'shop' | 'charity';

export const MULLIGAN_SKU = 'MULLIGAN';

/** Starting catalog (mirrors the menu_items seed). */
export const DEFAULT_MENU: StoreItem[] = [
  { sku: 'BEER_DRAFT', name: 'Draft Beer', category: 'beverage', price: 7, stock: null, visible: true },
  { sku: 'SELTZER', name: 'Hard Seltzer', category: 'beverage', price: 7, stock: 48, visible: true },
  { sku: 'WATER', name: 'Water', category: 'beverage', price: 3, stock: null, visible: true },
  { sku: 'SPORTS_DRINK', name: 'Sports Drink', category: 'beverage', price: 4, stock: 36, visible: true },
  { sku: 'HOTDOG', name: 'Clubhouse Dog', category: 'food', price: 8, stock: null, visible: true },
  { sku: 'TURKEY_WRAP', name: 'Turkey Wrap', category: 'food', price: 11, stock: 12, visible: true },
  { sku: 'BALLS_PROV1', name: 'Pro V1 (sleeve)', category: 'proshop', price: 18, stock: 40, visible: true },
  { sku: 'TEES', name: 'Tees (pack)', category: 'proshop', price: 5, stock: 60, visible: true },
  { sku: 'GLOVE', name: 'Golf Glove', category: 'proshop', price: 22, stock: 15, visible: true },
  { sku: 'CAP', name: 'Somerby Cap', category: 'apparel', price: 28, stock: 20, visible: true },
  { sku: MULLIGAN_SKU, name: 'Charity Mulligan', category: 'charity', price: 10, stock: null, visible: true },
];

export const SKU_RE = /^[A-Z0-9_]{2,32}$/;

export function validateItem(i: StoreItem) {
  const e: Partial<Record<'sku' | 'name' | 'price' | 'stock', string>> = {};
  if (!SKU_RE.test(i.sku)) e.sku = 'Use A–Z, 0–9 and _ (2–32)';
  if (!sanitizeText(i.name, 60)) e.name = 'Required';
  if (!(Number.isFinite(i.price) && i.price >= 0 && i.price <= 1000)) e.price = '$0–$1,000';
  if (i.stock !== null && !(Number.isInteger(i.stock) && i.stock >= 0 && i.stock <= 9999)) e.stock = '0–9,999 or untracked';
  if (!(Object.keys(CATEGORY_LABEL) as string[]).includes(i.category)) e.sku = 'Pick a category';
  return { ok: !Object.keys(e).length, errors: e };
}

export const cleanItem = (i: StoreItem): StoreItem => ({ ...i, name: sanitizeText(i.name, 60), price: Math.round(i.price * 100) / 100 });
