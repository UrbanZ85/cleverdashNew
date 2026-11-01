import type { CollectibleCategoryId, CollectibleCondition } from './types.js';

// Stanje oglasa iz eBay `conditionId` (019). ID-ji stanj niso enaki v vseh kategorijah (pri karticah je
// "Graded"/"Ungraded", pri igrah "Very Good" itd.), zato se pri karticah razbere samo nedvoumno "novo";
// vse drugo je `UNKNOWN` — nič se ne domneva (FR-016). Čista funkcija.

export function conditionFromListing(category: CollectibleCategoryId, conditionId: string | null): CollectibleCondition {
  if (conditionId === null) return 'UNKNOWN';
  if (category === 'trading-cards') return conditionId === '1000' ? 'NEW' : 'UNKNOWN';
  switch (conditionId) {
    case '1000':
    case '1500':
      return 'NEW';
    case '2750':
      return 'LIKE_NEW';
    case '3000':
    case '4000':
    case '5000':
    case '6000':
      return 'USED';
    case '7000':
      return 'FOR_PARTS';
    default:
      return 'UNKNOWN';
  }
}

/** eBay `conditionIds` za izbrana stanja; `null` = brez omejitve (prazno ali vključeno `UNKNOWN`). */
export function ebayConditionIds(conditions: readonly CollectibleCondition[]): string[] | null {
  if (conditions.length === 0 || conditions.includes('UNKNOWN')) return null;
  const ids = new Set<string>();
  for (const c of conditions) {
    if (c === 'NEW') ['1000', '1500'].forEach((i) => ids.add(i));
    else if (c === 'LIKE_NEW') ids.add('2750');
    else if (c === 'USED') ['3000', '4000', '5000', '6000'].forEach((i) => ids.add(i));
    else if (c === 'FOR_PARTS') ids.add('7000');
  }
  return [...ids];
}
