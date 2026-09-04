import type { FreshnessState } from '../../../domain/freshness.js';
import type { CommuteDirection, CommuteTravel } from '../../../domain/commute-route.js';

// Odgovor poti `GET /dashboard/commute`. Ločen od weather.mapper.ts, ker je navedba vira
// druga: `SourceMeta` tam ima `attribution` tipiziran na ARSO.
//
// Googlovi pogoji uporabe zahtevajo navedbo vira za podatke o poti — enako kot člen VIII
// zahteva navedbo za ARSO. Zato je navedba del ODGOVORA in ne besedilo, zapisano v predlogi
// odjemalca: kdo je vir, ve strežnik, ki ga je klical.
export const GOOGLE_ROUTES_ATTRIBUTION = {
  text: 'Čas poti in promet: Google',
  url: 'https://www.google.com/maps',
} as const;

/** Zakaj časa poti ni. Ločena stanja, ker ima vsako svojo pot ven (člen VII). */
export type CommuteTravelUnavailable =
  /** Kraja nista nastavljena — pot vodi v nastavitve. */
  | 'not-configured'
  /** `GOOGLE_MAPS_SERVER_KEY` ni nastavljen — namestitvena naloga, ne uporabnikova. */
  | 'no-api-key'
  /** Vir je odgovoril, a poti med krajema ni. */
  | 'no-route'
  /** Vir ni odgovoril in predpomnjenega podatka še nikoli ni bilo. */
  | 'source-unavailable';

export interface CommuteLegResponse {
  direction: CommuteDirection;
  /** Oznaka za nad zemljevidom, npr. "V službo" — sestavljena iz imen krajev. */
  label: string;
  from: string;
  to: string;
  /** Naslov vdelanega zemljevida, ali `null`, kadar kraja nista dovolj določena. */
  mapEmbedUrl: string | null;
  travel: CommuteTravel | null;
  /** Prisoten natanko takrat, ko je `travel` `null`. */
  travelUnavailable: CommuteTravelUnavailable | null;
  /** `true`, kadar je čas poti iz zadnjega znanega podatka in ne svež (FR-026). */
  stale: boolean;
  /** Starost podatka o poti v sekundah; `null`, kadar podatka ni. */
  ageSeconds: number | null;
}

export interface CommuteResponse {
  configured: boolean;
  legs: CommuteLegResponse[];
  source: {
    nextPollSeconds: number;
    attribution: typeof GOOGLE_ROUTES_ATTRIBUTION;
  };
}

/** Oznaka smeri: "V službo" / "Domov" ostane, imeni krajev pa povesta, KAM. */
export function legLabel(direction: CommuteDirection): string {
  return direction === 'to-work' ? 'V službo' : 'Domov';
}

export function isStale(freshness: FreshnessState): boolean {
  return freshness.kind === 'stale';
}
