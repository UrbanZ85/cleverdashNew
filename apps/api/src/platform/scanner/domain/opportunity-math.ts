import type { Money } from '../types.js';

// Aritmetika ocene priložnosti (izvlečeno iz LEGO skenerja v 019, research §2). Čista funkcija: vsaka
// postavka je prikazana, vsaka manjkajoča vhodna vrednost pusti dobiček `null` z razlogom v `missing[]`.
// Nikoli ne domneva poštnine = 0, davkov = 0 pri neznani državi ali vrednosti iz neprimerljivih podatkov.
//
//   skupni strošek       = cena + poštnina + davki + provizija kupca
//   konservativna vred.  = osnova vrednosti × (1 − konservativnost)
//   provizije prodaje    = konservativna vrednost × delež provizij
//   rezerva za tveganje  = skupni strošek × delež rezerve
//   dobiček              = konservativna vrednost − provizije prodaje − rezerva − skupni strošek
//   ROI                  = dobiček / skupni strošek
//
// Parametri so ocene lastnika namestitve (okolje), ne tržna dejstva; zato je `illustrative` vedno `true`.
// Modul ne pozna nobenega tipa skenerja: razloge ("kaj manjka") in osnovo vrednosti določi klicatelj.

/** Države članice EU: nakup pri prodajalcu v EU ne zahteva uvozne obdavčitve (cena vsebuje DDV prodajalca). */
export const EU_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export type ValueConfidence = 'high' | 'medium' | 'low' | 'insufficient';

/** Parametri izračuna priložnosti (odstotki); iz okolja, privzetki dokumentirani. */
export interface OpportunityParams {
  sellingFeePct: number;
  riskReservePct: number;
  conservativeDiscountPct: number;
  buyerFeePct: number;
}

export interface Opportunity {
  /** Vedno `true`: izračun je ocena z dokumentiranimi parametri, ne dejstvo. */
  illustrative: true;
  price: number;
  shipping: number | null;
  taxes: number | null;
  buyerFees: number;
  acquisitionCost: number | null;
  conservativeValue: number | null;
  sellingFees: number | null;
  riskReserve: number | null;
  profit: number | null;
  roi: number | null;
  discountPct: number | null;
  score: number | null;
  /** Kaj preprečuje izračun (npr. `shipping`, `taxes`, `valuation`, ali razlogi klicatelja). */
  missing: string[];
}

export interface OpportunityMathInput {
  price: Money;
  shipping: Money | null;
  shippingKnown: boolean;
  sellerCountry: string | null;
  /** Razlogi, ki jih je klicatelj že ugotovil in preprečujejo dobiček (npr. `identification`); gredo na začetek `missing`. */
  blockers: readonly string[];
  /** Osnova za dobiček (npr. mediana preverjenih prodaj) ali `null`, kadar je ni. */
  profitBase: number | null;
  /** Osnova za odstotek popusta (lahko tudi ocena); privzeto `profitBase`. `undefined` = enako kot `profitBase`. */
  discountBase?: number | null;
  /** Oznaka v `missing`, kadar `profitBase` ni na voljo (privzeto `valuation`). */
  profitBaseMissing?: string;
  /** Zaupanje v osnovo (za oceno 0–100). */
  confidence: ValueConfidence;
  params: OpportunityParams;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 0–100: do 70 točk iz ROI (50 % ROI = polno), do 30 iz zaupanja vrednosti; izguba ali ničla = 0. */
export function scoreFor(profit: number, roi: number | null, confidence: ValueConfidence): number {
  if (profit <= 0 || roi === null || roi <= 0) return 0;
  const roiPart = Math.min(roi / 0.5, 1) * 70;
  const confPart = confidence === 'high' ? 30 : confidence === 'medium' ? 20 : confidence === 'low' ? 10 : 0;
  return Math.round(roiPart + confPart);
}

export function computeOpportunity(input: OpportunityMathInput): Opportunity {
  const { price, params } = input;
  const missing: string[] = [...input.blockers];

  const buyerFees = round2((price.amount * params.buyerFeePct) / 100);

  const shipping = input.shippingKnown && input.shipping && input.shipping.currency === price.currency ? input.shipping.amount : null;
  if (shipping === null) missing.push('shipping');

  const country = input.sellerCountry?.toUpperCase() ?? null;
  const taxes = country && EU_COUNTRIES.has(country) ? 0 : null;
  if (taxes === null) missing.push('taxes');

  const valueBase = input.profitBase;
  if (valueBase === null) missing.push(input.profitBaseMissing ?? 'valuation');

  const discountBase = input.discountBase === undefined ? valueBase : input.discountBase;
  const discountPct = discountBase !== null && discountBase > 0 ? round2(((discountBase - price.amount) / discountBase) * 100) : null;
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
  return { ...base, conservativeValue, sellingFees, riskReserve, profit, roi, score: scoreFor(profit, roi, input.confidence) };
}
