import type { AskingStats } from './comparables.js';
import type { Valuation, ValueConfidence } from './types.js';

// Vrednotenje zbirateljskega predmeta (019, FR-017, FR-018). Čista funkcija, ki SESTAVI vrednost iz že
// pridobljenih podatkov in jih pusti LOČENE: `asking` (zahtevane cene), `estimate` (katalog/cenik) in
// `sold` (preverjene prodaje). Vrst se ne mešajo in nobena se ne izmišlja:
//   - `sold` ima prednost in je edina osnova DOBIČKA;
//   - `estimate`/`guide` sta ocena: dasta popust, ne dobička;
//   - `asking` nikoli ni osnova.
// Kadar osnove ni, je izid "premalo podatkov" (confidence `insufficient`).

export const SOLD_PERIOD_MONTHS = 6;

export interface ValuationInput {
  /** Valuta oglasa; vrednost iz vira v drugi valuti ni primerljiva (brez pretvorbe). */
  listingCurrency: string;
  /** `canValue(identification)`: ali sme oglas sploh dobiti vrednost. */
  identified: boolean;
  /** Razlog, zakaj ne (npr. dvoumnosti), za opombo; ignorirano, kadar `identified`. */
  notIdentifiedReason?: string | null;
  asking: AskingStats | null;
  estimate: NonNullable<Valuation['estimate']> | null;
  sold: NonNullable<Valuation['sold']> | null;
  /** Vir ni odgovoril in je uporabljen star podatek. */
  stale?: boolean;
  /** Dodatna opomba klicatelja (npr. "ocena velja za neocenjeno kartico"). */
  extraNote?: string | null;
}

function soldConfidence(count: number): ValueConfidence {
  if (count >= 10) return 'high';
  if (count >= 4) return 'medium';
  return count >= 1 ? 'low' : 'insufficient';
}

function lower(c: ValueConfidence): ValueConfidence {
  return c === 'high' ? 'medium' : c === 'medium' ? 'low' : c === 'low' ? 'insufficient' : 'insufficient';
}

export function buildValuation(input: ValuationInput): Valuation {
  const notes: string[] = [];
  if (input.extraNote) notes.push(input.extraNote);
  const stale = input.stale ?? false;

  const empty = (note: string): Valuation => ({
    asking: input.asking ? { ...input.asking } : null,
    estimate: input.estimate,
    sold: input.sold,
    primary: null,
    confidence: 'insufficient',
    comparable: false,
    stale,
    note: [note, ...notes].join(' '),
  });

  if (!input.identified) {
    return empty(`Premalo podatkov: ${input.notIdentifiedReason ?? 'različica ni zanesljivo določena'}; vrednost se ne primerja.`);
  }

  const soldOk = input.sold !== null && input.sold.count > 0 && input.sold.currency === input.listingCurrency;
  const estimateOk = input.estimate !== null && input.estimate.currency === input.listingCurrency && input.estimate.value > 0;

  if (!soldOk && !estimateOk) {
    if (input.sold && input.sold.currency !== input.listingCurrency) notes.push(`Valuta prodaj (${input.sold.currency}) ni valuta oglasa (${input.listingCurrency}); primerjava ni mogoča.`);
    if (input.estimate && input.estimate.currency !== input.listingCurrency) notes.push(`Valuta ocene (${input.estimate.currency}) ni valuta oglasa (${input.listingCurrency}); primerjava ni mogoča.`);
    return empty(input.asking ? 'Premalo podatkov: ni preverjenih prodaj ali ocene. Zahtevane cene niso prodajne cene.' : 'Premalo podatkov: ni preverjenih prodaj ali ocene.');
  }

  let primary: Valuation['primary'];
  let confidence: ValueConfidence;
  if (soldOk) {
    primary = 'sold';
    confidence = soldConfidence(input.sold!.count);
    if (input.sold!.count < 3) notes.push('Zelo malo prodaj; vrednost je orientacijska.');
  } else {
    primary = input.estimate!.basis === 'guide' ? 'guide' : 'estimate';
    // Ocena iz kataloga ali cenika NI prodaja: zaupanje je najnižje, dobiček se ne izračuna.
    confidence = 'low';
    notes.push(primary === 'guide' ? 'Vrednost je ocena iz cenika, ne preverjena prodaja; dobiček se ne izračuna.' : 'Vrednost je katalogna ocena, ne preverjena prodaja; dobiček se ne izračuna.');
  }
  if (stale) {
    confidence = lower(confidence);
    notes.push('Podatek je star (vir ni odgovoril); zaupanje je znižano.');
  }

  return {
    asking: input.asking ? { ...input.asking } : null,
    estimate: input.estimate,
    sold: input.sold,
    primary,
    confidence,
    comparable: confidence !== 'insufficient',
    stale,
    note: notes.length > 0 ? notes.join(' ') : null,
  };
}

/** Osnova odstotka popusta in vrsta; `null`, kadar vrednosti ni ali ni primerljiva. */
export function discountBase(v: Valuation | null): { value: number; basis: 'sold' | 'guide' | 'estimate' } | null {
  if (!v || !v.comparable || v.confidence === 'insufficient' || v.primary === null) return null;
  if (v.primary === 'sold' && v.sold) return { value: v.sold.median ?? v.sold.average, basis: 'sold' };
  if ((v.primary === 'guide' || v.primary === 'estimate') && v.estimate) return { value: v.estimate.value, basis: v.primary };
  return null;
}

/** Osnova dobička: SAMO preverjene prodaje (mediana, sicer povprečje). */
export function profitBase(v: Valuation | null): number | null {
  if (!v || !v.comparable || v.confidence === 'insufficient' || v.primary !== 'sold' || !v.sold) return null;
  return v.sold.median ?? v.sold.average;
}
