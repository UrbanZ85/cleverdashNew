import { computeOpportunity } from '../../../platform/scanner/domain/opportunity-math.js';
import { discountBase, profitBase } from './valuation.js';
import type { CollectibleCondition, Money, Opportunity, OpportunityParams, Valuation } from './types.js';

// Ocena priložnosti zbirateljskega predmeta (019, FR-018 do FR-022). Aritmetika je skupna z LEGO
// (`platform/scanner/domain/opportunity-math.ts`); tu so samo pravila zbirateljskih predmetov:
//   - DOBIČEK (in ROI, ocena) je samo iz preverjenih prodaj; katalogna ocena ali cenik ju ne dasta;
//   - POPUST se izračuna tudi iz ocene, a je označen z osnovo (`discountBasis`);
//   - neznano stanje ali okvarjen predmet dobiček prepreči;
//   - nizka cena sama po sebi ni priložnost: brez prepoznane različice ni ničesar.

export interface OpportunityInput {
  price: Money;
  shipping: Money | null;
  shippingKnown: boolean;
  sellerCountry: string | null;
  condition: CollectibleCondition;
  /** `canValue(identification)`. */
  identified: boolean;
  valuation: Valuation | null;
  /** Parametri vključno z rezervo za tveganje kategorije in dodatki (nepreverjena ocena, sum reprodukcije). */
  params: OpportunityParams;
}

export function evaluateOpportunity(input: OpportunityInput): Opportunity {
  const blockers: string[] = [];
  if (!input.identified) blockers.push('identification');
  if (input.condition === 'UNKNOWN' || input.condition === 'FOR_PARTS') blockers.push('condition');

  const v = input.valuation;
  const base = profitBase(v);
  const discount = input.identified ? discountBase(v) : null;
  const estimateOnly = v !== null && (v.primary === 'estimate' || v.primary === 'guide');

  const math = computeOpportunity({
    price: input.price,
    shipping: input.shipping,
    shippingKnown: input.shippingKnown,
    sellerCountry: input.sellerCountry,
    blockers,
    profitBase: input.identified ? base : null,
    discountBase: discount ? discount.value : null,
    profitBaseMissing: estimateOnly ? 'sold-prices' : 'valuation',
    confidence: v?.confidence ?? 'insufficient',
    params: input.params,
  });
  return { ...math, discountBasis: discount ? discount.basis : null, profitBasis: math.profit !== null ? 'sold' : null };
}
