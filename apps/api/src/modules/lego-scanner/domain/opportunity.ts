import { computeOpportunity, EU_COUNTRIES, scoreFor } from '../../../platform/scanner/domain/opportunity-math.js';
import type { LegoCondition, Money, Opportunity, OpportunityParams, Valuation } from './types.js';

// Ocena priložnosti LEGO (018, FR-017, FR-018). Aritmetika je od 019 skupna
// (`platform/scanner/domain/opportunity-math.ts`); tu ostane samo to, kar je LEGO: kdaj je stanje dovolj
// zanesljivo in katera vrednost iz cenika je osnova (mediana, sicer povprečje PRODAJ — ne aktivnih ponudb).

export { EU_COUNTRIES, scoreFor };

export interface OpportunityInput {
  price: Money;
  shipping: Money | null;
  shippingKnown: boolean;
  sellerCountry: string | null;
  condition: LegoCondition;
  /** `false`, kadar identifikacija ni zanesljiva (paket, deli, ročni pregled …). */
  identified: boolean;
  valuation: Valuation | null;
  params: OpportunityParams;
}

export function evaluateOpportunity(input: OpportunityInput): Opportunity {
  const blockers: string[] = [];
  if (!input.identified) blockers.push('identification');
  if (input.condition !== 'NEW_SEALED' && input.condition !== 'USED_COMPLETE') blockers.push('condition');

  const v = input.valuation;
  const valueBase = v && v.comparable && v.confidence !== 'insufficient' && v.currency === input.price.currency ? (v.median ?? v.average) : null;

  return computeOpportunity({
    price: input.price,
    shipping: input.shipping,
    shippingKnown: input.shippingKnown,
    sellerCountry: input.sellerCountry,
    blockers,
    profitBase: valueBase,
    confidence: v?.confidence ?? 'insufficient',
    params: input.params,
  });
}
