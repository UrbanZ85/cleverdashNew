import type { CardFinish, CardLanguage, GradingCompany, RetroCompleteness, RetroRegion, RetroWorking } from './types.js';

// Ključ primerjave različic (019, FR-014). Dve stvari z različnim ključem se NIKOLI ne primerjata in se
// vrednosti ne mešajo: PSA 9 ≠ PSA 10 ≠ neocenjena, prva izdaja ≠ unlimited, japonska ≠ angleška,
// reverse holo ≠ holo, loose ≠ CIB, PAL ≠ NTSC. Čista funkcija; `null` = primerjava ni mogoča.

export type CardEdition = 'first' | 'shadowless' | 'unlimited' | 'standard';

export interface CardVariantParts {
  catalogId: string;
  language: CardLanguage;
  edition: CardEdition;
  finish: CardFinish;
  grading: { company: GradingCompany; grade: string } | null;
}

export function cardVariantKey(p: CardVariantParts): string {
  const grade = p.grading ? `${p.grading.company}${p.grading.grade}` : 'raw';
  return ['card', p.catalogId, p.language, p.edition, p.finish, grade].join('|');
}

export interface RetroVariantParts {
  platform: string;
  /** Normaliziran naslov igre/konzole (glej `retroTitleKey`). */
  title: string;
  region: RetroRegion;
  completeness: RetroCompleteness;
  working: RetroWorking | null;
}

export function retroVariantKey(p: RetroVariantParts): string {
  return ['retro', p.platform, p.title, p.region, p.completeness, p.working ?? '-'].join('|');
}

export function sameVariant(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}
