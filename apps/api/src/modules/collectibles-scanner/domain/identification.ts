import type { Identification } from './types.js';

/** Vrste, ki so lahko ena sama prepoznana stvar (ne paket, reprodukcija, zapečaten izdelek brez cene). */
const VALUABLE_KINDS: ReadonlySet<string> = new Set(['CARD', 'GAME', 'CONSOLE']);

/**
 * Ali sme oglas dobiti vrednost in oceno priložnosti. Zahteva zanesljivo prepoznavo, določen ključ
 * različice in nobene odprte dvoumnosti (jezik, izdaja, površina, ocena …). Vse drugo je "premalo
 * podatkov" ali ročni pregled — nikoli ugibanje (FR-015).
 */
export function canValue(id: Identification): boolean {
  return VALUABLE_KINDS.has(id.kind) && !id.needsReview && id.variantKey !== null && id.ambiguities.length === 0 && (id.confidence === 'high' || id.confidence === 'medium');
}

export function unidentified(reason: string, kind: Identification['kind'] = 'UNIDENTIFIED'): Identification {
  return { kind, confidence: 'none', reason, needsReview: kind === 'UNIDENTIFIED', variantKey: null, ambiguities: [], catalog: null };
}
