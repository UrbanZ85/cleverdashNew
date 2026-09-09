// Oblika ene meritve, neodvisna od ponudnika.
//
// Zakaj svoja datoteka: dokler je bil ponudnik en sam, so ti tipi živeli v `history-parse.ts`
// skupaj z razčlenjevanjem ARSO strani. Z drugim ponudnikom (Neverin) to postane napačno
// mesto — `neverin-parse.ts` bi moral uvažati iz ARSO datoteke samo zato, ker je bila prva.
// Tipi so POGODBA MED razčlenjevalniki in vsem, kar pride za njimi (`hourly.ts`, router),
// zato stojijo zase; oba razčlenjevalnika ju izpolnita, nobeden ju ne lasti.
//
// Ključna posledica te oblike: `null` in `0` sta NAMENOMA različna. Postaja brez barometra
// (`pressureHpa: null`) ni postaja z ničelnim tlakom, in "ni merilnika za dež" ni "ni dežja".

export interface StationMeta {
  /** Ime kraja, kot ga izpiše vir (npr. "Vrhnika", "Sveta Marina"). */
  title: string;
  altitudeM: number | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * Časovna cona postaje (IANA, npr. `Europe/Ljubljana`), ali `null`, kadar je vir ne pove.
   *
   * Ura v grafu je KOLEDARSKA ura postaje in ne ura brskalnika (člen V.4). Za ARSO je to
   * vedno `Europe/Ljubljana`, Neverin pa cono pove pri vsaki postaji posebej — in čeprav je
   * `Europe/Zagreb` danes isti odmik, je "isti odmik" lastnost trenutka, ne pogodbe.
   */
  timezone: string | null;
  /**
   * Kdo postajo dejansko upravlja, kadar to ni ponudnik sam.
   *
   * Neverin je OMREŽJE: meritve Svete Marine so IstraStreamove, Neverin jih le zbira in
   * objavlja. Člen VIII zahteva navedbo vira, navedba samo "Neverin" pa bi izpustila tistega,
   * ki postajo v resnici drži. Pri ARSO je `null` — tam sta ponudnik in upravljavec isti.
   */
  operator: { name: string; url: string | null } | null;
}

/** Ena meritev. Vsako polje je lahko `null`: postaja merilnika morda nima (tlak, sevanje,
 * temperatura vode) ali pa je meritev tisti trenutek manjkala. */
export interface StationMeasurement {
  /** Trenutek meritve v UTC (ISO 8601). */
  validUtc: string;
  temperatureC: number | null;
  humidityPct: number | null;
  /** Povprečna hitrost vetra v intervalu, km/h. */
  windAvgKmh: number | null;
  /** Najmočnejši sunek v intervalu, km/h. */
  windMaxKmh: number | null;
  windDirectionDeg: number | null;
  /** Vsota padavin V INTERVALU (ne od začetka dneva), mm. */
  precipitationMm: number | null;
  /** ARSO-jeva vsota padavin od 6. oz. 18. ure UTC dalje, mm. Neverin je ne pošilja. */
  precipitation12hMm: number | null;
  /** Tlak, reduciran na morsko gladino. */
  pressureMslHpa: number | null;
  /** Tlak na lokaciji postaje (nereduciran). */
  pressureHpa: number | null;
  globalRadiationWm2: number | null;
  diffuseRadiationWm2: number | null;
  snowCm: number | null;
  waterTemperatureC: number | null;
  /** Indeks UV. ARSO ga v tej tabeli nima; Neverin ga pošilja pri postajah s senzorjem. */
  uvIndex: number | null;
  /** Ime ARSO ikone pojava/oblačnosti (npr. `mostClear`), brez pripone. */
  cloudsIcon: string | null;
}

export interface ParsedStationHistory {
  station: StationMeta;
  /** Naraščajoče po času. */
  measurements: StationMeasurement[];
}

/** Postaja v seznamu za izbiro. Ponudnik je znan iz sklica (`domain/meteo-station-ref.ts`). */
export interface ProviderStation {
  id: string;
  /** Ime, kakor ga vidi človek ("Bilje Nova Gorica"). */
  title: string;
  altitudeM: number | null;
  latitude: number | null;
  longitude: number | null;
  /** Dvočrkovna oznaka države (`SI`, `HR`, …), kadar jo vir pove. ARSO je ne pove — vse
   * njegove postaje so v Sloveniji. */
  countryCode: string | null;
}

/** Struktura vira se je spremenila do neuporabnosti — klicatelj to prevede v 503 in NE v
 * prazno ploščico (člen VII: tiha napaka je hrošč najvišje resnosti). */
export class StationHistoryFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StationHistoryFormatError';
  }
}
