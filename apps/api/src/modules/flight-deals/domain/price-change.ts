import type { ChangeType, Money } from './types.js';

// Vrsta spremembe cene (FR-027, FR-030). Čista funkcija s primeri iz specifikacije kot testi:
// 120 → 89 = PRICE_DOWN −31 (−25,8 %), 89 → 110 = PRICE_UP +21 (+23,6 %).

export interface PriceChange {
  type: ChangeType;
  /** Nova minus stara, v valuti ponudbe; `null` pri NEW. */
  absolute: number | null;
  /** Zaokroženo na eno decimalko; `null` pri NEW. */
  percent: number | null;
  /** `false`, kadar prejšnja cena obstaja, a je v drugi valuti — primerjave ni (edge case). */
  comparable: boolean;
}

export function percentChange(previous: number, next: number): number {
  if (previous === 0) return 0;
  return Math.round(((next - previous) / previous) * 1000) / 10;
}

export function classifyChange(previous: Money | null, next: Money): PriceChange {
  if (!previous) return { type: 'NEW', absolute: null, percent: null, comparable: false };
  if (previous.currency !== next.currency) {
    return { type: 'NEW', absolute: null, percent: null, comparable: false };
  }
  // Viri vračajo cele vrednosti ali dve decimalki; primerjava na cent brez zaokroževanja.
  const diff = Math.round((next.amount - previous.amount) * 100) / 100;
  if (diff === 0) return { type: 'UNCHANGED', absolute: 0, percent: 0, comparable: true };
  return {
    type: diff < 0 ? 'PRICE_DOWN' : 'PRICE_UP',
    absolute: diff,
    percent: percentChange(previous.amount, next.amount),
    comparable: true,
  };
}

/** Ali vrsta spremembe sproži obvestilo (FR-033). */
export function isNotifiable(type: ChangeType): boolean {
  return type === 'NEW' || type === 'PRICE_DOWN' || type === 'PRICE_UP';
}
