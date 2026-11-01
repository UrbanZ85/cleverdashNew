import type { ListingType, Money } from './types.js';

// Aktivne primerljive cene (019, research §6): zahtevane cene drugih oglasov ISTE različice v istem
// zagonu. To so `asking` cene — NIKOLI prodajne in nikoli osnova dobička. Dražbe so izključene (cena
// dražbe je trenutna ponudba, ne zahtevana cena). Čista funkcija.

export const MIN_COMPARABLES = 3;

export interface ComparableInput {
  id: string;
  variantKey: string | null;
  price: Money;
  listingType: ListingType;
}

export interface AskingStats {
  median: number | null;
  min: number | null;
  count: number;
  currency: string;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Statistika zahtevanih cen drugih oglasov iste različice in valute; `null`, kadar jih je manj kot `MIN_COMPARABLES`. */
export function askingStatsFor(self: ComparableInput, all: readonly ComparableInput[]): AskingStats | null {
  if (self.variantKey === null) return null;
  const peers = all.filter((o) => o.id !== self.id && o.variantKey === self.variantKey && o.listingType === 'FIXED_PRICE' && o.price.currency === self.price.currency);
  if (peers.length < MIN_COMPARABLES) return null;
  const prices = peers.map((p) => p.price.amount);
  return {
    median: Math.round(median(prices) * 100) / 100,
    min: Math.min(...prices),
    count: peers.length,
    currency: self.price.currency,
  };
}
