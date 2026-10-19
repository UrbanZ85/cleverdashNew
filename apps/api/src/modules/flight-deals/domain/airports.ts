import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Airport } from './types.js';

// Vgrajen nabor letališč (FR-003, FR-004). Vir je OurAirports (javna domena), filtriran na
// letališča z rednim potniškim prometom, s časovno cono iz koordinat — glej
// apps/api/scripts/build-airports.mjs in specs/015-flight-deals/research.md §10.
//
// Nabor je SREDSTVO modula in potuje z njim: pot se razreši iz `import.meta.url`, ne iz
// `process.cwd()` (isti razlog kot `modules/timesheet/services/workbook.service.ts`), in
// `copy-assets.mjs` mapo `assets/` kopira v `dist/`. Bere se enkrat ob prvem klicu, ne ob uvozu
// — da uvoz te datoteke v testih, ki nabora ne potrebujejo, ne stane pol megabajta JSON-a.
//
// Vse funkcije so ČISTE nad naborom (člen IX): iskanje, radij in države ne potrebujejo baze.

interface AirportsFile {
  source: string;
  generatedAt: string;
  airports: Airport[];
}

let loaded: AirportsFile | null = null;
let byIata: Map<string, Airport> | null = null;

function ensureLoaded(): AirportsFile {
  if (loaded) return loaded;
  const path = fileURLToPath(new URL('../assets/airports.json', import.meta.url));
  loaded = JSON.parse(readFileSync(path, 'utf-8')) as AirportsFile;
  byIata = new Map(loaded.airports.map((a) => [a.iata, a]));
  return loaded;
}

/** Vsa letališča nabora, v nespremenjenem vrstnem redu (po IATA). */
export function allAirports(): readonly Airport[] {
  return ensureLoaded().airports;
}

export function findAirport(iata: string): Airport | null {
  ensureLoaded();
  return byIata?.get(iata.trim().toUpperCase()) ?? null;
}

/** Ali vsak od podanih IATA ključev obstaja v naboru. Vrne manjkajoče, prazno = vsi obstajajo. */
export function missingAirports(iatas: readonly string[]): string[] {
  ensureLoaded();
  return iatas.filter((code) => !byIata?.has(code.trim().toUpperCase()));
}

/**
 * Male črke brez diakritike — ISTO pravilo kot `apps/web/src/app/core/search/fold-text.ts` in
 * `modules/saved-links/domain/search-text.ts`, da iskanje na zaslonu in prek HTTP najdeta isto
 * (uporabnik vpiše "trst" ali "Trst" in najde "Trieste"; `č` najde `c`).
 */
export function foldAirportText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Iskanje po IATA kodi, imenu letališča, mestu in drugih imenih (OurAirports keywords + slovenski
 * eksonimi iz build-airports.mjs) — FR-003: "trst" najde Trieste.
 *
 * Vrstni red zadetkov je namenoma določen in ne odvisen od vrstnega reda v datoteki: točna
 * koda najprej (uporabnik, ki vpiše "TRS", hoče Trst, ne vseh letališč, katerih ime vsebuje
 * "trs"), nato ujemanja na začetku imena ali mesta, nato ostala. Znotraj skupine po imenu.
 */
export function searchAirports(query: string, limit: number): { airports: Airport[]; total: number } {
  const needle = foldAirportText(query.trim());
  if (needle.length === 0) return { airports: [], total: 0 };

  const exactCode: Airport[] = [];
  const prefix: Airport[] = [];
  const contains: Airport[] = [];
  for (const airport of allAirports()) {
    const code = airport.iata.toLowerCase();
    const name = foldAirportText(airport.name);
    const city = foldAirportText(airport.city);
    const aliases = (airport.aliases ?? []).map(foldAirportText);
    if (code === needle) exactCode.push(airport);
    else if (name.startsWith(needle) || city.startsWith(needle) || aliases.some((a) => a.startsWith(needle))) prefix.push(airport);
    else if (name.includes(needle) || city.includes(needle) || aliases.some((a) => a.includes(needle))) contains.push(airport);
  }
  const byName = (a: Airport, b: Airport) => a.name.localeCompare(b.name, 'sl');
  const all = [...exactCode, ...prefix.sort(byName), ...contains.sort(byName)];
  return { airports: all.slice(0, limit), total: all.length };
}

const EARTH_RADIUS_KM = 6371;

/** Razdalja po ortodromi v kilometrih, zaokrožena na celo število. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))));
}

export interface AirportWithDistance extends Airport {
  distanceKm: number;
}

/**
 * Letališča v radiju okoli točke (FR-004), razvrščena po razdalji. Izhodišče je lahko letališče
 * (potem je samo sebi na razdalji 0 in je prvo) ali domači kraj iz nastavitev poti.
 */
export function airportsNear(
  lat: number,
  lon: number,
  radiusKm: number,
  limit: number,
): { airports: AirportWithDistance[]; total: number } {
  const hits: AirportWithDistance[] = [];
  for (const airport of allAirports()) {
    const d = distanceKm(lat, lon, airport.lat, airport.lon);
    if (d <= radiusKm) hits.push({ ...airport, distanceKm: d });
  }
  hits.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name, 'sl'));
  return { airports: hits.slice(0, limit), total: hits.length };
}

export interface CountryEntry {
  code: string;
  /** Slovensko ime (Intl.DisplayNames); kadar ga ICU ne pozna, angleško iz vira. */
  name: string;
  airportCount: number;
}

let countriesCache: CountryEntry[] | null = null;

/** Države z vsaj enim letališčem v naboru, s slovenskim imenom, razvrščene po njem. */
export function listCountries(): readonly CountryEntry[] {
  if (countriesCache) return countriesCache;
  const names = new Intl.DisplayNames(['sl'], { type: 'region' });
  const counts = new Map<string, { count: number; fallback: string }>();
  for (const a of allAirports()) {
    const entry = counts.get(a.country) ?? { count: 0, fallback: a.countryName };
    entry.count += 1;
    counts.set(a.country, entry);
  }
  countriesCache = [...counts.entries()]
    .map(([code, { count, fallback }]) => ({
      code,
      name: safeRegionName(names, code) ?? fallback,
      airportCount: count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sl'));
  return countriesCache;
}

/** `Intl.DisplayNames.of` vrže napako za kode, ki jih ne pozna (npr. `XK` v starejšem ICU);
 * neznana koda ni razlog, da bi seznam držav odpovedal. */
export function safeRegionName(names: Intl.DisplayNames, code: string): string | null {
  try {
    const name = names.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** Slovensko ime države za eno kodo — za prikaz pri letališču v odgovoru API-ja. */
export function countryNameSl(code: string, fallback: string): string {
  return listCountries().find((c) => c.code === code)?.name ?? fallback;
}

/** Samo za teste. */
export function resetAirportsForTests(): void {
  loaded = null;
  byIata = null;
  countriesCache = null;
}
