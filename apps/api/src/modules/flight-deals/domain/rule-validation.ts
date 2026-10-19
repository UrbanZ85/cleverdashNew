import type { SearchInput } from './rule-input.js';

// POMEN vnosa iskanja — kar zod ne more povedati, ker gre za odnose med polji (FR-005, FR-006,
// FR-009). Čiste funkcije; sporočilo je slovenski stavek za uporabnika, ki ga usmerjevalnik
// vrne kot `badRequest` (FR-014 pravi, da mora uporabnik vedeti, KAJ popraviti).

export interface RuleValidationDeps {
  /** Meja namestitve (FLIGHT_MAX_FLEX_DAYS). */
  maxFlexDays: number;
  /** Vrne IATA kode, ki jih v naboru NI. */
  missingAirports: (iatas: readonly string[]) => string[];
}

/** Prvi razlog, zakaj vnos ni smiseln, ali `null`, kadar je. */
export function validateRule(input: SearchInput, deps: RuleValidationDeps): string | null {
  const missing = deps.missingAirports([
    ...input.departureAirports,
    ...input.destination.airports,
    ...input.excluded.airports,
  ]);
  if (missing.length > 0) {
    return `Letališča ${missing.join(', ')} ni v naboru. Izberi ga iz seznama.`;
  }

  if (input.destination.mode === 'countries' && input.destination.countries.length === 0) {
    return 'Pri iskanju po državah izberi vsaj eno državo.';
  }
  if (input.destination.mode === 'airports' && input.destination.airports.length === 0) {
    return 'Pri iskanju po letališčih izberi vsaj eno ciljno letališče.';
  }

  const overlap = input.departureAirports.filter((a) => input.destination.airports.includes(a));
  if (overlap.length > 0) {
    return `Letališče ${overlap[0]} je hkrati odhodno in ciljno.`;
  }

  if (input.flexDays > deps.maxFlexDays) {
    return `Fleksibilnost je lahko največ ±${deps.maxFlexDays} dni.`;
  }

  const { dates } = input;
  if (dates.mode === 'fixed') {
    if (!dates.departDate) return 'Pri točnih datumih je datum odhoda obvezen.';
    if (dates.returnDate && dates.returnDate < dates.departDate) {
      return 'Datum povratka ne more biti pred datumom odhoda.';
    }
    if (dates.returnDate === null || dates.returnDate === undefined) {
      if (input.minNights !== null || input.maxNights !== null) {
        return 'Enosmerno iskanje nima nočitev — pusti trajanje prazno ali vpiši datum povratka.';
      }
    }
  } else if (dates.mode === 'range') {
    if (!dates.from || !dates.to) return 'Pri obdobju sta začetek in konec obvezna.';
    if (dates.to < dates.from) return 'Konec obdobja ne more biti pred začetkom.';
  } else if (dates.mode === 'rolling') {
    if (!dates.months) return 'Pri tekočem oknu vpiši, koliko mesecev vnaprej naj sistem išče.';
  }

  if (input.minNights !== null && input.maxNights !== null && input.maxNights < input.minNights) {
    return 'Največje število nočitev mora biti vsaj enako najmanjšemu.';
  }
  if ((input.minNights === null) !== (input.maxNights === null)) {
    return 'Vpiši obe meji trajanja (najmanj in največ nočitev) ali nobene.';
  }

  for (const window of [input.outbound, input.inbound]) {
    if (window.earliest && window.latest && window.latest < window.earliest) {
      return 'Najpoznejša ura ne more biti pred najzgodnejšo.';
    }
  }

  if (input.price.maxPerPerson !== null && input.price.maxTotal !== null) {
    const people = input.passengers.adults + input.passengers.childrenAges.length;
    if (input.price.maxTotal < input.price.maxPerPerson) {
      return 'Najvišja skupna cena ne more biti nižja od najvišje cene na osebo.';
    }
    if (input.price.maxTotal > input.price.maxPerPerson * people) {
      // Ni napaka, le neučinkovito — skupna meja nikoli ne bo odločila. Dovoljeno.
    }
  }

  return null;
}

/** Ali je iskanje enosmerno: brez nočitev IN (pri točnih datumih) brez povratka. */
export function isOneWay(input: Pick<SearchInput, 'dates' | 'minNights' | 'maxNights'>): boolean {
  if (input.dates.mode === 'fixed') return !input.dates.returnDate;
  return input.minNights === null && input.maxNights === null;
}

/**
 * Normalizira vnos pred shranjevanjem: dnevi razvrščeni in brez dvojnikov, seznami kod brez
 * dvojnikov. Shema je oblika, ta funkcija pa dogovor, na katerega se zanaša primerjava in
 * izpis (`weekdays` v vmesniku v vrstnem redu pon–ned).
 */
export function normalizeRule(input: SearchInput): SearchInput {
  const uniq = <T>(arr: readonly T[]): T[] => [...new Set(arr)];
  const window = (w: SearchInput['outbound']) => ({ ...w, weekdays: uniq(w.weekdays).sort((a, b) => a - b) });
  return {
    ...input,
    name: input.name.trim(),
    departureAirports: uniq(input.departureAirports),
    destination: {
      mode: input.destination.mode,
      countries: input.destination.mode === 'countries' ? uniq(input.destination.countries) : [],
      airports: input.destination.mode === 'airports' ? uniq(input.destination.airports) : [],
    },
    excluded: { countries: uniq(input.excluded.countries), airports: uniq(input.excluded.airports) },
    outbound: window(input.outbound),
    inbound: window(input.inbound),
    airlines: uniq(input.airlines),
    passengers: { adults: input.passengers.adults, childrenAges: [...input.passengers.childrenAges].sort((a, b) => a - b) },
    flexDays: input.dates.mode === 'rolling' ? 0 : input.flexDays,
  };
}
