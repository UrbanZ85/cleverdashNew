import type { CatalogCard } from '../../../src/modules/collectibles-scanner/domain/types.js';

// Deterministični katalogni zapisi za teste prepoznave (izmišljene vrednosti cen).

const PRICING = { source: 'cardmarket' as const, currency: 'EUR', updatedAt: '2026-10-21T13:00:00.000Z', avg: 13.5, low: 8, trend: 12, avg7: 12.4, avg30: 13, trendHolo: 20 };

export const CHARIZARD_BASE: CatalogCard = {
  id: 'base1-4',
  language: 'en',
  name: 'Charizard',
  localId: '4',
  setId: 'base1',
  setName: 'Base Set',
  setOfficialCount: 102,
  rarity: 'Rare',
  imageUrl: null,
  variants: { firstEdition: true, holo: true, normal: false, reverse: false },
  pricing: { ...PRICING, trend: 252.57 },
};

/** Druga kartica z istim imenom in številko 4 v drugem setu (Base Set 2 ima 130 kartic). */
export const CHARIZARD_BASE2: CatalogCard = {
  ...CHARIZARD_BASE,
  id: 'base4-4',
  setId: 'base4',
  setName: 'Base Set 2',
  setOfficialCount: 130,
  variants: { firstEdition: false, holo: true, normal: false, reverse: false },
};

export const CHARIZARD_EX: CatalogCard = {
  id: 'sv3-125',
  language: 'en',
  name: 'Charizard ex',
  localId: '125',
  setId: 'sv3',
  setName: 'Obsidian Flames',
  setOfficialCount: 197,
  rarity: 'Double Rare',
  imageUrl: null,
  variants: { firstEdition: false, holo: true, normal: false, reverse: false },
  pricing: PRICING,
};

/** Navaden Charizard (ne ex) z isto številko 125 — ime brez "ex" ne sme ujeti kartice "Charizard ex". */
export const CHARIZARD_PLAIN_125: CatalogCard = { ...CHARIZARD_EX, id: 'xx-125', name: 'Charizard', setId: 'xx', setName: 'Other Set' };

/** Moderna kartica z navadno in reverse različico. */
export const PIKACHU: CatalogCard = {
  id: 'sv1-63',
  language: 'en',
  name: 'Pikachu',
  localId: '63',
  setId: 'sv1',
  setName: 'Scarlet & Violet',
  setOfficialCount: 198,
  rarity: 'Common',
  imageUrl: null,
  variants: { firstEdition: false, holo: false, normal: true, reverse: true },
  pricing: PRICING,
};
