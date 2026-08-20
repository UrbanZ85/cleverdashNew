// Člen IX ustave: logika odločanja je čista funkcija, testirana brez omrežja in brez baze.
// data-model.md, razdelek externalCache: štiri možna stanja glede na obstoj zapisa in
// izid zadnjega poskusa osvežitve. To je edino mesto, ki to odločitev sprejme — router
// (apps/api/src/modules/dashboard/router.ts) samo prikliče rezultat.

export interface CacheRecordSnapshot {
  /** `null`, če zapisa še ni bilo nikoli (prvi zagon, prazna baza). */
  fetchedAt: Date | null;
  expiresAt: Date | null;
  /** Ali je zadnji poskus osvežitve (po izteku TTL) uspel. `null`, če izteka še ni bilo. */
  lastAttemptSucceeded: boolean | null;
}

export type FreshnessState =
  | { kind: 'fresh'; fetchedAt: Date }
  | { kind: 'refreshed'; fetchedAt: Date }
  | { kind: 'stale'; fetchedAt: Date }
  | { kind: 'never-fetched' };

/**
 * Izpelje stanje predpomnjenega podatka za prikaz. Ne kliče ničesar — samo primerja
 * datume, ki ji jih pokliče kdo drug.
 *
 * - `never-fetched`: zapisa ni — FR-026 "sporočilo, da podatka še ni, in ponovni poskus".
 * - `fresh`: znotraj TTL, ni bilo treba osvežiti.
 * - `refreshed`: TTL je potekel, a je osvežitev pravkar uspela (klicatelj to sporoči prek
 *   `lastAttemptSucceeded: true` po uspešnem klicu vira).
 * - `stale`: TTL je potekel in osvežitev ni uspela (ali ni bila poskušena) — prikaže se
 *   zadnji znani podatek z oznako starosti, NIKOLI napaka ali prazen zaslon (FR-026).
 */
export function resolveFreshness(snapshot: CacheRecordSnapshot, now: Date = new Date()): FreshnessState {
  if (!snapshot.fetchedAt) {
    return { kind: 'never-fetched' };
  }
  const withinTtl = snapshot.expiresAt !== null && snapshot.expiresAt > now;
  if (withinTtl) {
    return { kind: 'fresh', fetchedAt: snapshot.fetchedAt };
  }
  if (snapshot.lastAttemptSucceeded) {
    return { kind: 'refreshed', fetchedAt: snapshot.fetchedAt };
  }
  return { kind: 'stale', fetchedAt: snapshot.fetchedAt };
}

export function ageSeconds(fetchedAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - fetchedAt.getTime()) / 1000));
}

/** `stale: true` gre v odgovor API-ja (SourceMeta.stale) samo za `stale` stanje — `fresh`
 * in `refreshed` sta enakovredna z vidika uporabnika (FR-026: podatek je viden). */
export function isStaleForApi(state: FreshnessState): boolean {
  return state.kind === 'stale';
}
