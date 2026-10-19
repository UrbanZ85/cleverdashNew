import { createHash } from 'node:crypto';
import type { ChangeType, Money } from '../types.js';
import { classifyChange } from './price-change.js';

// Zaznava sprememb v generični shrambi (FR-024). Čiste funkcije:
//  - kadar ima rezultat CENO, odloča `classifyChange` (preseljen iz 015: pocenitev, podražitev,
//    nespremenjeno; druga valuta se ne primerja);
//  - kadar cene ni, odloča hash polja `comparable`, ki ga tip označi kot "to šteje za spremembo"
//    (npr. naslov in opis pri sliki) → `CHANGED`;
//  - brez obstoječega zapisa je vedno `NEW`.
// `UNAVAILABLE` tu ni: ni lastnost para (staro, novo), ampak odsotnosti — odloča jo shramba.

/** Determinističen hash nad JSON s sortiranimi ključi; `null` brez vrednosti. */
export function comparableHash(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export interface ChangeInput {
  existingPrice: Money | null;
  existingHash: string | null;
  incomingPrice: Money | null;
  incomingHash: string | null;
  /** `false` = zapisa še ni → `NEW`. */
  exists: boolean;
}

export function detectChange(input: ChangeInput): ChangeType {
  if (!input.exists) return 'NEW';
  if (input.incomingPrice) {
    const change = classifyChange(input.existingPrice, input.incomingPrice);
    // `NEW` iz classifyChange pomeni "ni primerljivo" (ni prejšnje cene ali druga valuta); za
    // obstoječ zapis to ni nova stvar, ampak nespremenjena z drugačnim podatkom o ceni.
    if (change.type === 'PRICE_DOWN' || change.type === 'PRICE_UP') return change.type;
    if (change.type === 'UNCHANGED') return 'UNCHANGED';
  }
  if (input.incomingHash !== null && input.incomingHash !== input.existingHash) return 'CHANGED';
  return 'UNCHANGED';
}
