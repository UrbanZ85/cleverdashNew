import type { CollectibleCategoryId } from '../domain/types.js';
import { retroGamingCategory } from './retro-gaming.js';
import { tradingCardsCategory } from './trading-cards.js';
import type { CategoryHandler, FieldDescriptor } from './types.js';

// Register kategorij (019, FR-003). Nova kategorija = nova datoteka v tej mapi + ena vrstica tu + vnos v
// `COLLECTIBLE_CATEGORIES` (domain/types.ts). Obrazec odjemalca se zgradi iz `fields`, zato spremembe
// odjemalca niso potrebne.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = CategoryHandler<any>;

const HANDLERS: Record<CollectibleCategoryId, AnyHandler> = {
  'trading-cards': tradingCardsCategory,
  'retro-gaming': retroGamingCategory,
};

export function getCategory(id: CollectibleCategoryId): AnyHandler {
  return HANDLERS[id];
}

export function listCategories(): AnyHandler[] {
  return Object.values(HANDLERS);
}

export interface CategoryDescriptor {
  category: CollectibleCategoryId;
  label: string;
  fields: FieldDescriptor[];
}

export function describeCategories(): CategoryDescriptor[] {
  return listCategories().map((c) => ({ category: c.id, label: c.label, fields: c.fields }));
}
