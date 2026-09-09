import type { FreshnessState } from '../../../domain/freshness.js';

// Navedba vira in starost podatka za odgovore tega modula.
//
// Enaka oblika kot `modules/dashboard/mappers/weather.mapper.ts`, a namenoma PREPISANA in ne
// uvožena: uvoz iz drugega modula prepoveduje člen I. Cena je nekaj podvojenih vrstic, korist
// pa ta, da odstranitev nadzorne plošče ne podre tega zavihka (in obratno) — enak dogovor kot
// pri prepisanih nizih obsegov v `platform/keycloak/role-mapping.ts`.
//
// Člen VIII: "ARSO podatki so vedno prikazani z navedbo vira". Navedba je zato del PODATKA in
// ne stvar odjemalčeve predloge — odjemalec je ne more pozabiti izrisati.
const ARSO_ATTRIBUTION = {
  text: 'Vir: ARSO',
  url: 'https://meteo.arso.gov.si',
} as const;

export interface MeteoSourceMeta {
  /** Naslov strani vira — v vmesniku je povezava "poglej pri ARSO". */
  url: string;
  fetchedAt: string;
  ageSeconds: number;
  /** Podatek je starejši od TTL in osvežitev ni uspela (FR-026) — prikaže se z oznako. */
  stale: boolean;
  nextPollSeconds: number;
  attribution: typeof ARSO_ATTRIBUTION;
}

export function buildMeteoSourceMeta(
  sourceUrl: string,
  freshness: FreshnessState,
  ageSeconds: number,
  nextPollSeconds: number,
): MeteoSourceMeta {
  return {
    url: sourceUrl,
    fetchedAt: freshness.kind === 'never-fetched' ? new Date(0).toISOString() : freshness.fetchedAt.toISOString(),
    ageSeconds,
    stale: freshness.kind === 'stale',
    nextPollSeconds,
    attribution: ARSO_ATTRIBUTION,
  };
}
