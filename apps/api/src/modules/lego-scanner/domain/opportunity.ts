import { round2 } from './valuation.js';
import type { LegoCondition, Money, Opportunity, OpportunityParams, Valuation } from './types.js';

// Ocena priložnosti (018, FR-017, FR-018). Čista funkcija: vsaka postavka je prikazana, vsaka manjkajoča
// vhodna vrednost pusti dobiček `null` z razlogom v `missing[]`. Nikoli ne domneva poštnine = 0,
// davkov = 0 pri neznani državi ali vrednosti iz aktivnih ponudb.
//
//   skupni strošek       = cena + poštnina + davki + provizija kupca
//   konservativna vred.  = (mediana, sicer povprečje prodaj) × (1 − konservativnost)
//   provizije prodaje    = konservativna vrednost × delež provizij
//   rezerva za tveganje  = skupni strošek × delež rezerve
//   dobiček              = konservativna vrednost − provizije prodaje − rezerva − skupni strošek
//   ROI                  = dobiček / skupni strošek
//
// Parametri so ocene lastnika namestitve (okolje), ne tržna dejstva; zato je `illustrative` vedno `true`.

/** Države članice EU: nakup pri prodajalcu v EU ne zahteva uvozne obdavčitve (cena vsebuje DDV prodajalca). */
export const EU_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

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
  const { price, params } = input;
  const missing: string[] = [];
  if (!input.identified) missing.push('identification');
  if (input.condition !== 'NEW_SEALED' && input.condition !== 'USED_COMPLETE') missing.push('condition');

  const buyerFees = round2((price.amount * params.buyerFeePct) / 100);

  const shipping = input.shippingKnown && input.shipping && input.shipping.currency === price.currency ? input.shipping.amount : null;
  if (shipping === null) missing.push('shipping');

  const country = input.sellerCountry?.toUpperCase() ?? null;
  const taxes = country && EU_COUNTRIES.has(country) ? 0 : null;
  if (taxes === null) missing.push('taxes');

  const v = input.valuation;
  const valueBase = v && v.comparable && v.confidence !== 'insufficient' && v.currency === price.currency ? (v.median ?? v.average) : null;
  if (valueBase === null) missing.push('valuation');

  const discountPct = valueBase !== null && valueBase > 0 ? round2(((valueBase - price.amount) / valueBase) * 100) : null;
  const acquisitionCost = shipping !== null && taxes !== null ? round2(price.amount + shipping + taxes + buyerFees) : null;

  const base: Opportunity = {
    illustrative: true,
    price: price.amount,
    shipping,
    taxes,
    buyerFees,
    acquisitionCost,
    conservativeValue: null,
    sellingFees: null,
    riskReserve: null,
    profit: null,
    roi: null,
    discountPct,
    score: null,
    missing,
  };
  if (missing.length > 0 || acquisitionCost === null || valueBase === null) return base;

  const conservativeValue = round2(valueBase * (1 - params.conservativeDiscountPct / 100));
  const sellingFees = round2((conservativeValue * params.sellingFeePct) / 100);
  const riskReserve = round2((acquisitionCost * params.riskReservePct) / 100);
  const profit = round2(conservativeValue - sellingFees - riskReserve - acquisitionCost);
  // ROI kot delež z 3 decimalkami (0,119 = 11,9 %); `Math.round(x * 1000) / 1000` brez plavajoče pike v zapisu.
  const roi = acquisitionCost > 0 ? Math.round((profit / acquisitionCost) * 1000) / 1000 : null;
  return { ...base, conservativeValue, sellingFees, riskReserve, profit, roi, score: scoreFor(profit, roi, v!.confidence) };
}

/** 0–100: do 70 točk iz ROI (50 % ROI = polno), do 30 iz zaupanja vrednosti; izguba ali ničla = 0. */
export function scoreFor(profit: number, roi: number | null, confidence: Valuation['confidence']): number {
  if (profit <= 0 || roi === null || roi <= 0) return 0;
  const roiPart = Math.min(roi / 0.5, 1) * 70;
  const confPart = confidence === 'high' ? 30 : confidence === 'medium' ? 20 : confidence === 'low' ? 10 : 0;
  return Math.round(roiPart + confPart);
}
