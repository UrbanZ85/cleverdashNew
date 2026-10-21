import type { LegoCondition, Valuation, ValuationConfidence } from './types.js';

// Vrednotenje seta (018, FR-014 do FR-016). Čista funkcija nad odgovorom cenika.
//
// Pravila, ki jih ta datoteka varuje:
//  - vrednost je iz PRODAJ (`sold`, zadnjih 6 mesecev); aktivne ponudbe (`stock`) so ločeno polje in
//    NIKOLI ne vplivajo na vrednost ali zaupanje (cena v oglasu ni cena prodaje);
//  - povprečje, število prodaj in mediana so samo tisto, kar vir da; mediana samo iz posameznih prodaj
//    (`details`), nikoli ocenjena iz agregata;
//  - novo in rabljeno sta ločena izračuna (`N`/`U`); stanje, ki ni jasno novo ali jasno kompletno
//    rabljeno, NE dobi vrednosti (kompletnosti se ne domneva);
//  - druga valuta = primerljivost `false`, brez pretvorbe (research §6).

export interface PriceGuide {
  currency: string | null;
  average: number | null;
  /** BrickLink `qty_avg_price`: povprečje, tehtano s količino. */
  qtyAverage: number | null;
  min: number | null;
  max: number | null;
  /** `unit_quantity`: število prodaj (ali ponudb pri `stock`). */
  count: number;
  /** Posamezne vrstice, če jih vir da. */
  details: ReadonlyArray<{ unitPrice: number; quantity: number }> | null;
}

export interface ValuationInput {
  sold: PriceGuide | null;
  stock: PriceGuide | null;
  newOrUsed: 'N' | 'U';
  /** Valuta oglasa, s katero se primerja. */
  listingCurrency: string;
  /** Odgovor je prišel iz starega predpomnilnika (vir ni odgovoril). */
  stale: boolean;
}

/** Katero vrednotenje velja za stanje; `null` = ne vrednoti se (kompletnost/stanje ni jasno). */
export function guideFor(condition: LegoCondition): { newOrUsed: 'N' | 'U' } | { skip: string } {
  switch (condition) {
    case 'NEW_SEALED':
      return { newOrUsed: 'N' };
    case 'USED_COMPLETE':
      return { newOrUsed: 'U' };
    case 'NEW_OPEN_BOX':
      return { skip: 'Odprta škatla: vrednost za zapečatene sete ne velja, vrednost za rabljene pa ni primerljiva.' };
    case 'USED_INCOMPLETE':
      return { skip: 'Nekompleten set: vrednost za kompletne sete ne velja.' };
    case 'PARTS_ONLY':
      return { skip: 'Samo deli: set ni kompleten.' };
    default:
      return { skip: 'Stanje ali kompletnost ni preverjena: vrednost kompletnega seta se ne domneva.' };
  }
}

const CONFIDENCE_ORDER: ValuationConfidence[] = ['insufficient', 'low', 'medium', 'high'];

function confidenceFor(count: number): ValuationConfidence {
  if (count >= 10) return 'high';
  if (count >= 3) return 'medium';
  if (count >= 1) return 'low';
  return 'insufficient';
}

function lower(confidence: ValuationConfidence): ValuationConfidence {
  const i = CONFIDENCE_ORDER.indexOf(confidence);
  return CONFIDENCE_ORDER[Math.max(0, i - 1)]!;
}

/** Tehtana mediana posameznih prodaj; `null` brez podrobnosti. */
export function weightedMedian(details: PriceGuide['details']): number | null {
  if (!details || details.length === 0) return null;
  const rows = details
    .filter((d) => Number.isFinite(d.unitPrice) && Number.isFinite(d.quantity) && d.quantity > 0)
    .map((d) => ({ price: d.unitPrice, qty: d.quantity }))
    .sort((a, b) => a.price - b.price);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const half = total / 2;
  let seen = 0;
  for (let i = 0; i < rows.length; i += 1) {
    seen += rows[i]!.qty;
    if (seen > half) return round2(rows[i]!.price);
    if (seen === half) return round2((rows[i]!.price + (rows[i + 1]?.price ?? rows[i]!.price)) / 2);
  }
  return round2(rows[rows.length - 1]!.price);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function valuate(input: ValuationInput): Valuation {
  const { sold, stock } = input;
  const active = stock ? { average: stock.qtyAverage ?? stock.average, min: stock.min, count: stock.count } : null;
  const empty = (note: string): Valuation => ({
    basis: 'sold',
    newOrUsed: input.newOrUsed,
    currency: sold?.currency ?? null,
    average: null,
    median: null,
    salesCount: 0,
    periodMonths: 6,
    confidence: 'insufficient',
    stale: input.stale,
    active,
    comparable: false,
    note,
  });
  if (!sold || sold.count <= 0) return empty('Premalo podatkov: ni prodaj v zadnjih šestih mesecih. Aktivne ponudbe niso prodajne cene.');
  const average = sold.qtyAverage ?? sold.average;
  if (average === null || !Number.isFinite(average)) return empty('Premalo podatkov: cenik ne vsebuje povprečne cene prodaj.');

  let confidence = confidenceFor(sold.count);
  if (input.stale) confidence = lower(confidence);
  const comparable = sold.currency !== null && sold.currency === input.listingCurrency;
  const notes: string[] = [];
  if (!comparable) notes.push(`Valuta cenika (${sold.currency ?? 'neznana'}) ni valuta oglasa (${input.listingCurrency}); primerjava ni mogoča.`);
  if (input.stale) notes.push('Podatek je star (vir ni odgovoril); zaupanje je znižano.');
  if (sold.count < 3) notes.push('Zelo malo prodaj; vrednost je orientacijska.');
  return {
    basis: 'sold',
    newOrUsed: input.newOrUsed,
    currency: sold.currency,
    average: round2(average),
    median: weightedMedian(sold.details),
    salesCount: sold.count,
    periodMonths: 6,
    confidence,
    stale: input.stale,
    active,
    comparable,
    note: notes.length > 0 ? notes.join(' ') : null,
  };
}
