import {
  StationHistoryFormatError,
  type ParsedStationHistory,
  type ProviderStation,
  type StationMeasurement,
  type StationMeta,
} from './measurement.js';

// Razčlenjevanje odgovorov omrežja Neverin (`core.neverin.hr`) v skupno obliko meritve.
//
// Za razliko od ARSO je vir JSON in ne HTML, zato je tu manj razčlenjevanja in več
// PREVAJANJA: enote in pomeni polj se od ARSO razlikujejo, razlike pa so tihe — vrednost
// pride kot število v obeh primerih, samo pomeni nekaj drugega.
//
// UGOTOVLJENO NEPOSREDNO PROTI VIRU 9. 9. 2026 (vse troje je bilo treba izmeriti, ker vir
// dokumentacije nima):
//
//  1. VETER JE V m/s, ne v km/h. Njihova stran pretvarja šele ob izrisu — v svežnju je
//     tabela faktorjev `{"m/s":1,"km/h":3.6,"kt":1.94384}`, torej je shranjena enota m/s.
//     Potrjeno še s podatki: najmočnejši sunek med 873 postajami je bil 17,1 (= 62 km/h),
//     kar je kot km/h nesmiselno nizko. Brez pretvorbe bi bile vrednosti 3,6-krat
//     premajhne — in to je napaka, ki je na grafu NI videti, veter bi bil samo videti šibek.
//
//  2. `precip` je vsota V INTERVALU in ne števec od začetka dneva. Preverjeno na postaji
//     `meja-gaj` med nalivom: vsota celotne 24-urne serije (49,5 mm) se natanko ujema z
//     njihovim `precip_acc_24h` (49,5 mm). Pomen je torej isti kot pri ARSO `rr_val` in
//     `hourly.ts` ga sme seštevati brez izjeme.
//
//  3. `pressure` NI enotno reduciran na morsko gladino. Postaja Cvrsnica (2228 m) pošilja
//     782 hPa (očitno tlak na lokaciji), Begovo Razdolje (1078 m) pa 1017 hPa (očitno
//     reduciran). Referenčna višina je torej lastnost postaje, ki je vir ne pove. Zato se
//     preslika v `pressureHpa` (tlak na lokaciji) in NIKOLI v `pressureMslHpa`: trditi
//     "reducirano na morsko gladino" za vrednost, za katero to ne velja, je slabše od tega,
//     da trditve sploh ni.
//
// Člen IX: čisti funkciji nad nizom, testirani brez omrežja
// (tests/unit/neverin-parse.spec.ts).

/** Iz m/s v km/h. Vir hrani m/s (glej opombo 1 zgoraj), naša pogodba pa km/h — enako kot
 * ARSO, da sta postaji obeh omrežij na istem grafu primerljivi brez preračunavanja. */
const MS_TO_KMH = 3.6;

interface NeverinStationEnvelope {
  slug?: unknown;
  title?: unknown;
  subtitle?: unknown;
  lat?: unknown;
  lon?: unknown;
  elevation?: unknown;
  timezone?: unknown;
  country_code?: unknown;
  source?: unknown;
}

/**
 * Upravljavec postaje iz `station.source` (`{"name":"IstraStream","url":"https://…"}`).
 *
 * Neverin je omrežje tujih postaj, zato je to podatek in ne okrasek: meritve Svete Marine so
 * IstraStreamove. Naslov se sprejme samo, če je `https` — v odgovoru je in gre naravnost v
 * povezavo v vmesniku.
 */
function parseOperator(value: unknown): { name: string; url: string | null } | null {
  const source = record(value);
  if (!source) return null;
  const name = typeof source['name'] === 'string' ? source['name'].trim() : '';
  if (name.length === 0) return null;
  const rawUrl = typeof source['url'] === 'string' ? source['url'].trim() : '';
  return { name, url: rawUrl.startsWith('https://') ? rawUrl : null };
}

export function parseNeverinHistory(json: string): ParsedStationHistory {
  const root = parseJson(json);
  const data = record(root['data']);
  if (!data) throw new StationHistoryFormatError('Odgovor Neverin nima polja `data`.');

  const envelope = record(data['station']) as NeverinStationEnvelope | null;
  if (!envelope) throw new StationHistoryFormatError('Odgovor Neverin nima ovojnice postaje.');

  const items = record(data['items']);
  const weather = Array.isArray(items?.['weather']) ? (items['weather'] as unknown[]) : null;
  if (!weather) {
    throw new StationHistoryFormatError('Odgovor Neverin nima serije `items.weather`.');
  }

  const station: StationMeta = {
    title: stationTitle(envelope),
    altitudeM: numberOrNull(envelope.elevation),
    latitude: numberOrNull(envelope.lat),
    longitude: numberOrNull(envelope.lon),
    timezone:
      typeof envelope.timezone === 'string' && envelope.timezone.length > 0 ? envelope.timezone : null,
    operator: parseOperator(envelope.source),
  };

  const measurements: StationMeasurement[] = [];
  for (const raw of weather) {
    const row = record(raw);
    if (!row) continue;
    const validUtc = instantFromUnixSeconds(row['ts']);
    // Vrstica brez časa ni meritev — preskočimo jo, namesto da bi jo šteli za pokvarjen vir
    // (enak dogovor kot pri ARSO vrsticah brez `valid_UTC`).
    if (!validUtc) continue;

    measurements.push({
      validUtc,
      temperatureC: numberOrNull(row['temp']),
      humidityPct: numberOrNull(row['rh']),
      windAvgKmh: scaled(row['wavg'], MS_TO_KMH),
      windMaxKmh: scaled(row['wgust'], MS_TO_KMH),
      windDirectionDeg: numberOrNull(row['wdir']),
      precipitationMm: numberOrNull(row['precip']),
      // Vir 12-urne ARSO vsote nima; `null` pomeni "tega podatka ni", ne "nič ni padlo".
      precipitation12hMm: null,
      pressureMslHpa: null,
      pressureHpa: numberOrNull(row['pressure']),
      globalRadiationWm2: numberOrNull(row['solar']),
      diffuseRadiationWm2: null,
      // Vremenske postaje Neverin snega in temperature morja v tej seriji ne pošiljajo
      // (morje je pri njih ločen `type=sea`, ki ni predmet tega zavihka).
      snowCm: null,
      waterTemperatureC: null,
      uvIndex: numberOrNull(row['uv']),
      cloudsIcon: null,
    });
  }

  if (measurements.length === 0) {
    throw new StationHistoryFormatError('Postaja Neverin v odgovoru nima nobene meritve s časom.');
  }

  measurements.sort((a, b) => a.validUtc.localeCompare(b.validUtc));
  return { station, measurements };
}

/**
 * Seznam postaj iz `stations/readings`.
 *
 * Vir vrne tudi zadnjo meritev vsake postaje; ta se NE bere — seznam je namenjen izbiri
 * postaje, meritve pa pridejo iz arhiva izbrane postaje. Postaja brez oznake ali imena se
 * preskoči (člen VII: raje ena postaja manj kot pokvarjen seznam).
 */
export function parseNeverinStationList(json: string): ProviderStation[] {
  const root = parseJson(json);
  const data = record(root['data']);
  const raw = Array.isArray(data?.['stations']) ? (data['stations'] as unknown[]) : null;
  if (!raw) throw new StationHistoryFormatError('Odgovor Neverin nima seznama `data.stations`.');

  const stations: ProviderStation[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const envelope = record(item) as NeverinStationEnvelope | null;
    if (!envelope) continue;
    const slug = typeof envelope.slug === 'string' ? envelope.slug.trim().toLowerCase() : '';
    if (slug.length === 0 || seen.has(slug)) continue;
    const title = stationTitle(envelope);
    if (title.length === 0) continue;

    seen.add(slug);
    stations.push({
      id: slug,
      title,
      altitudeM: numberOrNull(envelope.elevation),
      latitude: numberOrNull(envelope.lat),
      longitude: numberOrNull(envelope.lon),
      countryCode:
        typeof envelope.country_code === 'string' && envelope.country_code.length > 0
          ? envelope.country_code.toUpperCase()
          : null,
    });
  }

  // Po imenu in po slovensko: seznam je namenjen iskanju s pogledom (Č za C, ne za Z).
  stations.sort((a, b) => a.title.localeCompare(b.title, 'sl'));
  return stations;
}

/**
 * Ime postaje.
 *
 * `subtitle` je pri Neverinu pogosto natančnejša lokacija ("Brodogradilište i marina") in se
 * pripne, ker je samo "Betina" premalo, da bi človek ločil dve postaji istega kraja.
 */
function stationTitle(envelope: NeverinStationEnvelope): string {
  const title = typeof envelope.title === 'string' ? envelope.title.trim() : '';
  const subtitle = typeof envelope.subtitle === 'string' ? envelope.subtitle.trim() : '';
  if (title.length === 0) return subtitle;
  return subtitle.length > 0 && !title.includes(subtitle) ? `${title} — ${subtitle}` : title;
}

function parseJson(json: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new StationHistoryFormatError('Odgovor Neverin ni veljaven JSON.');
  }
  const root = record(parsed);
  if (!root) throw new StationHistoryFormatError('Odgovor Neverin ni predmet JSON.');
  return root;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/** Pretvorjena vrednost, zaokrožena na desetinko. Zaokrožitev je tu in ne šele ob izrisu,
 * ker bi sicer `6.3 m/s` v vsakem odgovoru API-ja postal `22.679999999999996 km/h`. */
function scaled(value: unknown, factor: number): number | null {
  const raw = numberOrNull(value);
  if (raw === null) return null;
  return Math.round(raw * factor * 10) / 10;
}

/** Unix sekunde → ISO instant. Vir čas pove kot število sekund v UTC. */
function instantFromUnixSeconds(value: unknown): string | null {
  const seconds = numberOrNull(value);
  if (seconds === null) return null;
  const instant = new Date(seconds * 1000);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
