import { describe, expect, it } from 'vitest';
import { parseNeverinHistory, parseNeverinStationList } from '../../src/modules/meteo/domain/neverin-parse.js';
import { StationHistoryFormatError } from '../../src/modules/meteo/domain/measurement.js';
import {
  isValidNeverinSlug,
  neverinArchiveUrl,
  neverinStationListUrl,
} from '../../src/domain/neverin-station.js';

// 011 razširitev: drugi ponudnik meritev (neverin.hr). Člen IX — čista logika, brez omrežja.
//
// Vrednosti v vzorcih so PRAVE (preneseno s `core.neverin.hr` 9. 9. 2026). Ta test je zapis
// treh stvari, ki jih je bilo treba pri tem viru izmeriti, ker jih ne dokumentira nikjer:
// veter je v m/s, `precip` je vsota v intervalu, `pressure` ni reduciran na morsko gladino.

/** Izsek pravega odgovora `GET /stations/sveta-marina/archive?hours=48`. */
const ARCHIVE = JSON.stringify({
  data: {
    station: {
      slug: 'sveta-marina',
      title: 'Sveta Marina',
      subtitle: null,
      lat: 45.03237,
      lon: 14.15992,
      elevation: 10,
      timezone: 'Europe/Zagreb',
      source: { name: 'IstraStream', url: 'https://www.istrastream.com' },
    },
    resolution: 'raw',
    counts: { weather: 3 },
    items: {
      weather: [
        // Namenoma NE po vrsti: vir jih pošilja naraščajoče, a se na to ne zanašamo.
        { temp: 28.4, rh: 69, pressure: 1015.6, wgust: 7.2, wavg: 7.2, wdir: 156, precip: 0.2, uv: null, solar: null, ts: 1788867000 },
        { temp: 28.3, rh: 76, pressure: 1015.7, wgust: 4, wavg: 2.7, wdir: 186, precip: 0, uv: 3.4, solar: 512, ts: 1788866700 },
        { temp: 28.1, rh: 72, pressure: null, wgust: null, wavg: null, wdir: null, precip: 0.1, uv: null, solar: null, ts: 1788867300 },
        // Vrstica brez časa ni meritev — vir jo sme poslati, mi je ne štejemo.
        { temp: 27.9, ts: null },
      ],
    },
  },
});

describe('parseNeverinHistory', () => {
  it('prebere ovojnico postaje, vključno s cono in upravljavcem', () => {
    const parsed = parseNeverinHistory(ARCHIVE);

    expect(parsed.station).toEqual({
      title: 'Sveta Marina',
      altitudeM: 10,
      latitude: 45.03237,
      longitude: 14.15992,
      // Cona je podatek POSTAJE in ne konstanta: ura v grafu je koledarska ura postaje
      // (člen V.4), in `Europe/Zagreb` je danes isti odmik kot Ljubljana, a to je lastnost
      // trenutka, ne pogodbe.
      timezone: 'Europe/Zagreb',
      // Neverin je omrežje: meritve Svete Marine so IstraStreamove in člen VIII zahteva, da
      // se to vidi.
      operator: { name: 'IstraStream', url: 'https://www.istrastream.com' },
    });
  });

  it('veter pretvori iz m/s v km/h', () => {
    // NAJPOMEMBNEJŠI TEST V TEJ DATOTEKI. Vir hrani m/s (njihova stran množi s 3,6 šele ob
    // izrisu); brez pretvorbe bi bile vrednosti 3,6-krat premajhne — napaka, ki je na grafu
    // NI videti, ker bi bil veter samo videti šibek.
    const parsed = parseNeverinHistory(ARCHIVE);
    const first = parsed.measurements[0]!;

    expect(first.windAvgKmh).toBe(9.7); // 2,7 m/s
    expect(first.windMaxKmh).toBe(14.4); // 4,0 m/s
  });

  it('padavine prenese kot vsoto v intervalu, brez preračunavanja', () => {
    // Preverjeno proti viru: vsota serije se ujema z njihovim `precip_acc_24h`, torej je
    // `precip` vsota v intervalu (kot ARSO `rr_val`) in ne števec od začetka dneva.
    const parsed = parseNeverinHistory(ARCHIVE);
    expect(parsed.measurements.map((m) => m.precipitationMm)).toEqual([0, 0.2, 0.1]);
  });

  it('tlak preslika v `pressureHpa` in NIKOLI v `pressureMslHpa`', () => {
    // Referenčna višina je pri tem viru lastnost postaje, ki je vir ne pove: Cvrsnica
    // (2228 m) pošilja 782 hPa, Begovo Razdolje (1078 m) pa 1017 hPa. Trditi "reducirano na
    // morsko gladino" za vrednost, za katero to ne velja, je slabše od tega, da trditve ni.
    const first = parseNeverinHistory(ARCHIVE).measurements[0]!;
    expect(first.pressureHpa).toBe(1015.7);
    expect(first.pressureMslHpa).toBeNull();
  });

  it('uredi po času in preskoči vrstico brez časa', () => {
    const parsed = parseNeverinHistory(ARCHIVE);
    expect(parsed.measurements.map((m) => m.validUtc)).toEqual([
      '2026-09-08T11:25:00.000Z',
      '2026-09-08T11:30:00.000Z',
      '2026-09-08T11:35:00.000Z',
    ]);
  });

  it('manjkajoča vrednost je `null` in ne 0', () => {
    // "Postaja tega ne meri" ni isto kot "izmerila je nič" — na tem stoji ves prikaz.
    const last = parseNeverinHistory(ARCHIVE).measurements[2]!;
    expect(last.pressureHpa).toBeNull();
    expect(last.windAvgKmh).toBeNull();
    expect(last.precipitationMm).toBe(0.1);
  });

  it('polja, ki jih ta vir nima, so `null`', () => {
    const first = parseNeverinHistory(ARCHIVE).measurements[0]!;
    expect(first.snowCm).toBeNull();
    expect(first.waterTemperatureC).toBeNull();
    expect(first.precipitation12hMm).toBeNull();
    expect(first.cloudsIcon).toBeNull();
    // UV in sevanje pa vir POŠILJA, kadar ju postaja meri.
    expect(first.uvIndex).toBe(3.4);
    expect(first.globalRadiationWm2).toBe(512);
  });

  it('pokvarjen odgovor vrže napako in ne prazne serije', () => {
    // Člen VII: tiha napaka je hrošč najvišje resnosti. Klicatelj to prevede v 503 z razlago.
    expect(() => parseNeverinHistory('ni json')).toThrow(StationHistoryFormatError);
    expect(() => parseNeverinHistory('{}')).toThrow(StationHistoryFormatError);
    expect(() => parseNeverinHistory(JSON.stringify({ data: { station: {} } }))).toThrow(
      StationHistoryFormatError,
    );
    // Postaja brez ene same meritve s časom je za nas neuporaben odgovor, ne prazen graf.
    const empty = JSON.stringify({ data: { station: { slug: 'x', title: 'X' }, items: { weather: [] } } });
    expect(() => parseNeverinHistory(empty)).toThrow(StationHistoryFormatError);
  });
});

describe('parseNeverinStationList', () => {
  const LIST = JSON.stringify({
    data: {
      query: { type: 'weather', count: 4 },
      stations: [
        { slug: 'sveta-marina', title: 'Sveta Marina', subtitle: null, lat: 45.03237, lon: 14.15992, elevation: 10, country_code: 'HR' },
        { slug: 'betina', title: 'Betina', subtitle: 'Brodogradilište i marina', lat: 43.826913, lon: 15.603021, elevation: 6, country_code: 'hr' },
        { slug: 'ljubljana-bezigrad', title: 'Ljubljana-Bežigrad', subtitle: null, lat: 46.0655, lon: 14.5124, elevation: 299, country_code: 'SI' },
        // Postaja brez oznake se preskoči (člen VII: raje ena manj kot pokvarjen seznam).
        { slug: '', title: 'Brez oznake' },
      ],
    },
  });

  it('vrne postaje z oznako, imenom in državo', () => {
    const stations = parseNeverinStationList(LIST);

    expect(stations).toHaveLength(3);
    expect(stations.find((s) => s.id === 'sveta-marina')).toEqual({
      id: 'sveta-marina',
      title: 'Sveta Marina',
      altitudeM: 10,
      latitude: 45.03237,
      longitude: 14.15992,
      countryCode: 'HR',
    });
  });

  it('podnaslov pripne k imenu — brez njega dveh postaj istega kraja ni mogoče ločiti', () => {
    const betina = parseNeverinStationList(LIST).find((s) => s.id === 'betina');
    expect(betina?.title).toBe('Betina — Brodogradilište i marina');
    // Oznaka države se poenoti v velike črke, da je filtriranje po njej zanesljivo.
    expect(betina?.countryCode).toBe('HR');
  });

  it('uredi po imenu po slovensko', () => {
    expect(parseNeverinStationList(LIST).map((s) => s.id)).toEqual([
      'betina',
      'ljubljana-bezigrad',
      'sveta-marina',
    ]);
  });

  it('pokvarjen odgovor vrže napako', () => {
    expect(() => parseNeverinStationList('{}')).toThrow(StationHistoryFormatError);
  });
});

describe('oznaka in naslovi Neverin', () => {
  it('sprejme prave oznake', () => {
    expect(isValidNeverinSlug('sveta-marina')).toBe(true);
    expect(isValidNeverinSlug('parg-cabar')).toBe(true);
    expect(isValidNeverinSlug('ljubljana-bezigrad')).toBe(true);
  });

  it('zavrne, kar bi lahko premaknilo naslov ali zamenjalo gostitelja', () => {
    // Iz oznake se sestavi naslov, ki ga strežnik SAM prenese (člen VIII, SSRF).
    expect(isValidNeverinSlug('../../etc/passwd')).toBe(false);
    expect(isValidNeverinSlug('sveta-marina/..')).toBe(false);
    expect(isValidNeverinSlug('https://zlonamerno.example')).toBe(false);
    expect(isValidNeverinSlug('Sveta-Marina')).toBe(false);
    expect(isValidNeverinSlug('x')).toBe(false);
  });

  it('sestavi naslov arhiva in seznama', () => {
    expect(neverinArchiveUrl('https://core.neverin.hr', 'sveta-marina', 48)).toBe(
      'https://core.neverin.hr/stations/sveta-marina/archive?hours=48',
    );
    expect(neverinStationListUrl('https://core.neverin.hr', 2000)).toBe(
      'https://core.neverin.hr/stations/readings?type=weather&fields=temp&limit=2000',
    );
  });

  it('neveljavne oznake ne sestavi v naslov', () => {
    expect(() => neverinArchiveUrl('https://core.neverin.hr', '../secret', 48)).toThrow();
  });
});
