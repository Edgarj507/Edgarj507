import type { OrderItem } from './model';

/**
 * On-course catalog. Mirrors the menu_items seed in supabase/migrations/*_clubhouse.sql; in cloud
 * mode the server prices orders from that table and ignores any client total.
 */
export interface MenuItem { sku: string; name: string; price: number; kind: OrderItem['kind']; section: string }

export const MENU: MenuItem[] = [
  { sku: 'BEER_DRAFT', name: 'Draft Beer', price: 7, kind: 'fnb', section: 'Food & Drink' },
  { sku: 'WATER', name: 'Water', price: 3, kind: 'fnb', section: 'Food & Drink' },
  { sku: 'HOTDOG', name: 'Clubhouse Dog', price: 8, kind: 'fnb', section: 'Food & Drink' },
  { sku: 'BALLS_PROV1', name: 'Pro V1 (sleeve)', price: 18, kind: 'shop', section: 'Pro Shop' },
  { sku: 'TEES', name: 'Tees (pack)', price: 5, kind: 'shop', section: 'Pro Shop' },
];

export const MULLIGAN: MenuItem = { sku: 'MULLIGAN', name: 'Charity Mulligan', price: 10, kind: 'charity', section: 'Charity' };

export const cartTotal = (items: OrderItem[]) => items.reduce((a, i) => a + i.price * i.qty, 0);
