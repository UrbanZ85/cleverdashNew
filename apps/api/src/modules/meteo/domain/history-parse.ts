import {
  StationHistoryFormatError,
  type ParsedStationHistory,
  type StationMeasurement,
  type StationMeta,
} from './measurement.js';

// Razčlenjevanje ARSO strani "dvodnevna zgodovina" samodejne postaje.
//
// Zakaj HTML in ne XML: ARSO ponuja XML samo za ZADNJO meritev
// (`observationAms_<postaja>_latest.xml`); enakega naslova s `_history.xml` NI (preverjeno
// 9. 9. 2026 — vrne 404). Zgodovina obstaja izključno kot ta HTML tabela, ki jo sicer
// riše ARSO-jeva stran sama.
//
// Tabela je strojno prijaznejša, kot je videti: vsak stolpec je v vrstici zapisan DVAKRAT —
// najprej skrita celica (`style="display:none;" id="<ime>"`) s SUROVO vrednostjo, nato vidna
// s zaokroženo. Beremo prvo (`6.876 km/h` namesto `7`), ker je graf iz zaokroženih vrednosti
// stopničast. Celice iščemo po imenu razreda in NE po zaporedju: stolpci se med postajami
// razlikujejo (Bežigrad ima tlak in sončno obsevanje, Vrhnika ne) in zaporedje je stvar
// ARSO-jeve predloge, ne pogodbe.
//
// Ločljivost je odvisna od postaje: 10 minut (Vrhnika) ali 30 minut (Bežigrad). Nikjer se ne
// domneva ena ali druga — urne vsote in povprečja jih preneseta obe (glej hourly.ts).
//
// Člen IX: čista funkcija nad nizom, testirana brez omrežja (tests/unit/arso-history-parse.spec.ts).

/** Vse ARSO samodejne postaje so v Sloveniji, zato je cona konstanta in ne podatek vira. */
const ARSO_STATION_ZONE = 'Europe/Ljubljana';

/**
 * Struktura ARSO strani se je spremenila do neuporabnosti.
 *
 * Podrazred skupne napake in ne svoja vrsta: router obravnava vse ponudnike enako (503 z
 * razlago), ime razreda pa pove, KATERI vir se je spremenil, ko se to znajde v dnevniku.
 */
export class ArsoHistoryFormatError extends StationHistoryFormatError {
  constructor(message: string) {
    super(message);
    this.name = 'ArsoHistoryFormatError';
  }
}

/** Imena stolpcev, kakor jih ARSO zapiše v `class`/`id` celice. Levo je naše ime polja. */
const NUMERIC_COLUMNS = {
  temperatureC: 't',
  humidityPct: 'rh',
  windAvgKmh: 'ffavg_val',
  windMaxKmh: 'ffmax_val',
  windDirectionDeg: 'dd_val',
  precipitationMm: 'rr_val',
  precipitation12hMm: 'tp_12h_acc',
  pressureMslHpa: 'msl',
  pressureHpa: 'p',
  globalRadiationWm2: 'gSunRadavg',
  diffuseRadiationWm2: 'diffSunRadavg',
  snowCm: 'snow',
  waterTemperatureC: 'tw',
} as const;

export function parseStationHistory(html: string): ParsedStationHistory {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  if (rows.length === 0) {
    throw new ArsoHistoryFormatError('V odgovoru ARSO ni nobene vrstice tabele.');
  }

  const measurements: StationMeasurement[] = [];
  let station: StationMeta | null = null;

  for (const row of rows) {
    const cells = cellsByName(row);
    const validUtc = parseValidUtc(cells.get('valid_UTC'));
    // Glava tabele in morebitne vmesne vrstice brez časa niso meritev — preskočimo jih
    // namesto da bi jih šteli za pokvarjen vir.
    if (!validUtc) continue;

    station ??= {
      title: textOf(cells.get('domain_longTitle')) ?? stationTitleFromHeader(html) ?? 'Neznana postaja',
      altitudeM: numberOf(cells.get('domain_altitude')),
      latitude: numberOf(cells.get('domain_lat')),
      longitude: numberOf(cells.get('domain_lon')),
      // ARSO postaje so vse v Sloveniji; vir cone ne izpiše, ker je zanj samoumevna.
      timezone: ARSO_STATION_ZONE,
      // ARSO svoje postaje upravlja sam — ločenega upravljavca ni (za razliko od Neverina,
      // ki je omrežje tujih postaj).
      operator: null,
    };

    const measurement: StationMeasurement = {
      validUtc,
      cloudsIcon: iconNameOf(cells.get('clouds_icon_wwsyn_icon')),
      // Te tabele ARSO ne izpolni z indeksom UV — stolpca ni, ne le vrednosti.
      uvIndex: null,
      ...(Object.fromEntries(
        Object.entries(NUMERIC_COLUMNS).map(([field, column]) => [field, numberOf(cells.get(column))]),
      ) as Record<keyof typeof NUMERIC_COLUMNS, number | null>),
    };
    measurements.push(measurement);
  }

  if (!station || measurements.length === 0) {
    throw new ArsoHistoryFormatError('V odgovoru ARSO ni nobene meritve s časom (stolpec valid_UTC).');
  }

  measurements.sort((a, b) => a.validUtc.localeCompare(b.validUtc));
  return { station, measurements };
}

/**
 * Vsebina celic vrstice, ključena po imenu stolpca. Ohrani se PRVA pojavitev imena, ker je
 * to skrita celica s surovo vrednostjo (vidna, zaokrožena, pride za njo).
 */
function cellsByName(row: string): Map<string, string> {
  const out = new Map<string, string>();
  const cellPattern = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
  for (const match of row.matchAll(cellPattern)) {
    const [, attributes, content] = match;
    const name = /class="([^"]*)"/i.exec(attributes ?? '')?.[1]?.trim().split(/\s+/)[0];
    if (!name || out.has(name)) continue;
    out.set(name, content ?? '');
  }
  return out;
}

/** Ime kraja iz glave tabele (`<th class="meteoSI-header" id="title">Vrhnika</th>`) —
 * nadomestek, kadar postaja stolpca `domain_longTitle` ne izpolni. */
function stationTitleFromHeader(html: string): string | null {
  const header = /<th[^>]*id="title"[^>]*>([\s\S]*?)<\/th>/i.exec(html);
  return header ? textOf(header[1]) : null;
}

/** `2026-09-09 08:30` (vedno UTC, brez oznake cone) → ISO instant. */
function parseValidUtc(cell: string | undefined): string | null {
  const text = textOf(cell);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(text);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const instant = new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** Besedilo celice brez oznak in znakovnih entitet. */
function textOf(cell: string | undefined): string | null {
  if (cell === undefined) return null;
  const text = cell
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&deg;/gi, '°')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * Število iz celice, ali `null`, kadar je celica prazna oziroma vrednosti ni.
 *
 * Prazna celica je pri tem viru običajna in NE napaka: postaja brez barometra ima stolpec
 * `msl` prisoten in prazen v vseh 289 vrsticah.
 */
function numberOf(cell: string | undefined): number | null {
  const text = textOf(cell);
  if (text === null) return null;
  // Vir ponekod zapiše decimalno vejico; presledke v tisočicah (sevanje) odstranimo.
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** `<img src="/uploads/meteo/style/img/weather/mostClear.png">` → `mostClear`. */
function iconNameOf(cell: string | undefined): string | null {
  if (cell === undefined) return null;
  const match = /\/weather\/([A-Za-z0-9_-]+)\.(?:png|svg|gif)/i.exec(cell);
  return match?.[1] ?? null;
}
