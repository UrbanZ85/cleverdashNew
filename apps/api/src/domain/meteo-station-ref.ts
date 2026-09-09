import { DEFAULT_STATION_ID, isValidStationId } from './arso-station.js';
import { isValidNeverinSlug } from './neverin-station.js';

// Sklic na postajo, ki pove TUDI, čigava je: `arso:VRHNIKA`, `neverin:sveta-marina`.
//
// Zakaj kvalificiran sklic in ne dve ločeni nastavitvi: postaje iz obeh omrežij so v vmesniku
// en sam seznam, med katerim uporabnik izbira, in en sam nabor priljubljenih, med katerimi
// preklaplja. Če bi bila ponudnik in oznaka ločeni polji, bi bil vsak seznam mešanih postaj
// par vzporednih tabel, ki se morata ujemati po indeksu — in prvi vrstni red, ki se razide,
// pokaže meritve napačne postaje pod pravim imenom.
//
// Oznaki se ne moreta pomešati (ARSO je VELIKO, Neverin malo), a se na to NE zanašamo:
// razločevanje po obliki vrednosti je pravilo, ki drži, dokler ga en nov ponudnik ne podre.
//
// Zakaj v `domain/` in ne v modulu `meteo`: sklic potrebujeta DVA modula — `meteo` (prenese
// vir) in `settings` (preveri, kar uporabnik shrani) — uvoz med moduloma pa prepoveduje
// člen I. Enak razlog kot pri `domain/arso-station.ts` in `domain/neverin-station.ts`.

export const METEO_PROVIDERS = ['arso', 'neverin'] as const;
export type MeteoProviderId = (typeof METEO_PROVIDERS)[number];

export interface MeteoStationRef {
  provider: MeteoProviderId;
  /** Oznaka znotraj ponudnikovega prostora imen — pri ARSO velike črke, pri Neverinu slug. */
  id: string;
}

/** Koliko postaj hkrati sme imeti uporabnik izbranih. Preklopnik na zavihku je vrstica čipov;
 * pri dvajsetih postaja preklopnik seznam, ki ga je treba brati, in to je že nastavitveni
 * zaslon. Meja je hkrati zgornja meja PRENOSOV, ki jih en uporabnik sproži (člen VIII). */
export const MAX_SELECTED_STATIONS = 8;

/** Postaja, ki jo dobi uporabnik, dokler si svoje ne izbere (glej `arso-station.ts`). */
export const DEFAULT_STATION_REF: MeteoStationRef = { provider: 'arso', id: DEFAULT_STATION_ID };

export function isValidProvider(value: string): value is MeteoProviderId {
  return (METEO_PROVIDERS as readonly string[]).includes(value);
}

/** Ali je oznaka veljavna V PROSTORU IMEN tega ponudnika. Oba vzorca sta ozka namenoma: iz
 * oznake se sestavi naslov, ki ga strežnik sam prenese (člen VIII, SSRF). */
export function isValidStationIdFor(provider: MeteoProviderId, id: string): boolean {
  return provider === 'arso' ? isValidStationId(id) : isValidNeverinSlug(id);
}

/**
 * Razčleni `<ponudnik>:<oznaka>`.
 *
 * Vrednost BREZ dvopičja se bere kot ARSO in se pri tem povelikočrkovi. To ni prijaznost do
 * klicatelja, ampak združljivost nazaj: dokler je bil ponudnik en sam, so bile nastavitve
 * shranjene kot gola oznaka (`VRHNIKA`) in take so še vedno v bazi. Dokument v bazi je lahko
 * starejši od pravil, zato se bere ob VSAKEM branju in ne enkrat ob selitvi.
 */
export function parseStationRef(value: string): MeteoStationRef | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const separator = trimmed.indexOf(':');
  if (separator === -1) {
    const legacy = trimmed.toUpperCase();
    return isValidStationId(legacy) ? { provider: 'arso', id: legacy } : null;
  }

  const provider = trimmed.slice(0, separator).toLowerCase();
  const rawId = trimmed.slice(separator + 1);
  if (!isValidProvider(provider)) return null;

  // ARSO oznake so v naslovu vedno z velikimi črkami, Neverinovi slugi vedno z malimi —
  // poenotenje tu pomeni, da se `arso:vrhnika` in `ARSO:VRHNIKA` shranita kot isti sklic in
  // da seznam priljubljenih iste postaje ne vsebuje dvakrat.
  const id = provider === 'arso' ? rawId.toUpperCase() : rawId.toLowerCase();
  return isValidStationIdFor(provider, id) ? { provider, id } : null;
}

/** Zapis sklica, kakor se shrani v nastavitve in kakor ga sprejme `?station=`. */
export function formatStationRef(ref: MeteoStationRef): string {
  return `${ref.provider}:${ref.id}`;
}

export function stationRefEquals(a: MeteoStationRef, b: MeteoStationRef): boolean {
  return a.provider === b.provider && a.id === b.id;
}

/**
 * Razčleni seznam sklicev in odvrže neveljavne ter podvojene.
 *
 * Odvrže in NE zavrne: seznam pride iz nastavitev, ki so lahko starejše od pravil, in ena
 * postaja, ki je vir ne pozna več, ne sme pomeniti praznega zavihka za vse ostale.
 */
export function parseStationRefs(values: readonly string[]): MeteoStationRef[] {
  const out: MeteoStationRef[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const ref = parseStationRef(value);
    if (!ref) continue;
    const key = formatStationRef(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length >= MAX_SELECTED_STATIONS) break;
  }
  return out;
}
