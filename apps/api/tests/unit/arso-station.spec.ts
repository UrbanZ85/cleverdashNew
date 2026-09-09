import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATION_ID,
  isValidStationId,
  stationHistoryUrl,
  stationIdFromMeteosiId,
  stationListUrl,
} from '../../src/domain/arso-station.js';
import { parseStationList } from '../../src/modules/meteo/domain/station-list-parse.js';
import { STATION_CATALOG, mergeStationCatalog } from '../../src/modules/meteo/domain/station-catalog.js';
import { normalizeMeteoSettings } from '../../src/modules/settings/services/meteo-settings.service.js';

// 011: oznaka ARSO postaje, naslovi, ki iz nje sledijo, in seznam postaj.
//
// Vrednosti v vzorcih so PRAVE (preneseno 9. 9. 2026): `NOVA-GOR_BILJE_` je oznaka postaje
// "Bilje Nova Gorica", katere ime v naslovu ne deluje — `observationAms_BILJE_history.html`
// in `observationAms_NOVA-GORICA-BILJE_history.html` vrneta 404, oznaka iz `domain_meteosiId`
// pa 200. Ta test je zapis tega odkritja.

describe('stationIdFromMeteosiId', () => {
  it('odreže zaključni podčrtaj', () => {
    expect(stationIdFromMeteosiId('VRHNIKA_')).toBe('VRHNIKA');
    expect(stationIdFromMeteosiId('NOVA-GOR_BILJE_')).toBe('NOVA-GOR_BILJE');
    expect(stationIdFromMeteosiId('LJUBL-ANA_BEZIGRAD_')).toBe('LJUBL-ANA_BEZIGRAD');
  });

  it('zavrne vrednost, iz katere ne nastane veljavna oznaka', () => {
    expect(stationIdFromMeteosiId('')).toBeNull();
    expect(stationIdFromMeteosiId('_')).toBeNull();
    expect(stationIdFromMeteosiId('NOVA GORICA')).toBeNull();
    expect(stationIdFromMeteosiId('BOHINJSKA ČEŠNJICA')).toBeNull();
  });
});

describe('isValidStationId', () => {
  it('sprejme prave oznake', () => {
    expect(isValidStationId('VRHNIKA')).toBe(true);
    expect(isValidStationId('NOVA-GOR_BILJE')).toBe(true);
    expect(isValidStationId(DEFAULT_STATION_ID)).toBe(true);
  });

  it('zavrne, kar bi lahko premaknilo naslov ali zamenjalo gostitelja', () => {
    // Iz oznake se sestavi naslov, ki ga strežnik SAM prenese (člen VIII) — pot navzgor,
    // poševnica in podpičje v njej ne smejo obstati.
    expect(isValidStationId('../../etc/passwd')).toBe(false);
    expect(isValidStationId('VRHNIKA/..')).toBe(false);
    expect(isValidStationId('https://zlonamerno.example')).toBe(false);
    expect(isValidStationId('vrhnika')).toBe(false);
    expect(isValidStationId('V')).toBe(false);
    expect(isValidStationId('A'.repeat(41))).toBe(false);
  });
});

describe('stationHistoryUrl / stationListUrl', () => {
  const base = 'https://meteo.arso.gov.si/uploads/probase/www/observ/surface/text/sl/';

  it('sestavi naslov strani z zgodovino postaje', () => {
    expect(stationHistoryUrl(base, 'VRHNIKA')).toBe(`${base}observationAms_VRHNIKA_history.html`);
    expect(stationHistoryUrl(base, 'NOVA-GOR_BILJE')).toBe(`${base}observationAms_NOVA-GOR_BILJE_history.html`);
  });

  it('deluje tudi, kadar je osnovni naslov brez zaključne poševnice', () => {
    expect(stationHistoryUrl(base.slice(0, -1), 'VRHNIKA')).toBe(`${base}observationAms_VRHNIKA_history.html`);
  });

  it('neveljavne oznake ne sestavi v naslov', () => {
    expect(() => stationHistoryUrl(base, '../secret')).toThrow();
  });

  it('sestavi naslov seznama postaj', () => {
    expect(stationListUrl(base)).toBe(`${base}observationAms_si_latest.xml`);
  });
});

describe('parseStationList', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><data>
    <metData><domain_title>VRHNIKA</domain_title><domain_shortTitle>VRHNIKA</domain_shortTitle>
      <domain_longTitle>Vrhnika</domain_longTitle><domain_meteosiId>VRHNIKA_</domain_meteosiId>
      <domain_lat>45.966</domain_lat><domain_lon>14.2717</domain_lon><domain_altitude>310</domain_altitude>
      <t>22.4</t></metData>
    <metData><domain_title>NOVA GORICA BILJE</domain_title><domain_shortTitle>BILJE</domain_shortTitle>
      <domain_longTitle>Bilje Nova Gorica</domain_longTitle><domain_meteosiId>NOVA-GOR_BILJE_</domain_meteosiId>
      <domain_lat>45.8956</domain_lat><domain_lon>13.624</domain_lon><domain_altitude>55</domain_altitude></metData>
    <metData><domain_title>BOHINJSKA CESNJICA</domain_title>
      <domain_longTitle>Bohinjska Češnjica</domain_longTitle><domain_meteosiId>BOHIN-CES_</domain_meteosiId>
      <domain_lat>46.2942</domain_lat><domain_lon>13.9422</domain_lon><domain_altitude>596</domain_altitude></metData>
    <metData><domain_longTitle>Brez oznake</domain_longTitle><domain_meteosiId></domain_meteosiId></metData>
  </data>`;

  it('vrne postaje z oznako za naslov in imenom za človeka', () => {
    const stations = parseStationList(xml);

    expect(stations).toHaveLength(3);
    expect(stations.find((s) => s.id === 'NOVA-GOR_BILJE')).toEqual({
      id: 'NOVA-GOR_BILJE',
      title: 'Bilje Nova Gorica',
      altitudeM: 55,
      latitude: 45.8956,
      longitude: 13.624,
    });
  });

  it('uredi po imenu po slovensko in preskoči postajo brez oznake', () => {
    const stations = parseStationList(xml);
    expect(stations.map((s) => s.title)).toEqual(['Bilje Nova Gorica', 'Bohinjska Češnjica', 'Vrhnika']);
  });

  it('dokument brez postaj vrne prazen seznam (klicatelj to prevede v 503)', () => {
    expect(parseStationList('<data></data>')).toEqual([]);
  });
});

describe('mergeStationCatalog', () => {
  const catalog = [
    { id: 'VRHNIKA', title: 'Vrhnika', altitudeM: 310, latitude: 45.966, longitude: 14.2717 },
    { id: 'BLEGOS', title: 'Blegoš', altitudeM: 1188, latitude: 46.1675, longitude: 14.0816 },
  ];

  it('postaja, ki je v tem ciklu ni objavila, ostane v ponudbi', () => {
    // Zakaj to sploh potrebujemo: `observationAms_si_latest.xml` je posnetek zadnjega
    // objavnega cikla, ne imenik. Ob 08:00 UTC je vseboval 106 postaj, ob 09:25 samo 19 — brez
    // zlitja uporabnik svoje postaje ob napačnem trenutku na seznamu ne bi našel.
    const merged = mergeStationCatalog(catalog, [
      { id: 'RATECE', title: 'Rateče', altitudeM: 864, latitude: 46.4972, longitude: 13.7128 },
    ]);

    expect(merged.map((s) => s.id).sort()).toEqual(['BLEGOS', 'RATECE', 'VRHNIKA']);
  });

  it('živi vir ima prednost pri vsebini (ime, višina, koordinati se lahko popravijo)', () => {
    const merged = mergeStationCatalog(catalog, [
      { id: 'VRHNIKA', title: 'Vrhnika (nova lokacija)', altitudeM: 312, latitude: 45.97, longitude: 14.27 },
    ]);

    expect(merged.find((s) => s.id === 'VRHNIKA')).toEqual({
      id: 'VRHNIKA',
      title: 'Vrhnika (nova lokacija)',
      altitudeM: 312,
      latitude: 45.97,
      longitude: 14.27,
    });
  });

  it('uredi po imenu po slovensko', () => {
    const merged = mergeStationCatalog(catalog, []);
    expect(merged.map((s) => s.title)).toEqual(['Blegoš', 'Vrhnika']);
  });

  it('zapisani imenik pokriva postaje, ki jih ta funkcionalnost predpostavlja', () => {
    const ids = new Set(STATION_CATALOG.map((s) => s.id));
    // Privzetek namestitve MORA biti v ponudbi, sicer bi uporabnik v nastavitvah videl
    // izbrano postajo, ki je na seznamu ni.
    expect(ids.has(DEFAULT_STATION_ID)).toBe(true);
    expect(ids.has('VRHNIKA')).toBe(true);
    // Vsaka oznaka v imeniku mora prestati isti vzorec kot vpisana vrednost.
    expect(STATION_CATALOG.every((s) => isValidStationId(s.id))).toBe(true);
    expect(STATION_CATALOG.every((s) => s.title.trim().length > 0)).toBe(true);
  });
});

describe('normalizeMeteoSettings', () => {
  it('izpuščeno polje pomeni "ne spreminjaj"', () => {
    expect(normalizeMeteoSettings({})).toBeNull();
  });

  it('null in prazen seznam pomenita "naj velja privzetek namestitve"', () => {
    expect(normalizeMeteoSettings({ stations: null })).toEqual({ station: null, stations: [] });
    expect(normalizeMeteoSettings({ stations: [] })).toEqual({ station: null, stations: [] });
    expect(normalizeMeteoSettings({ station: null })).toEqual({ station: null, stations: [] });
    expect(normalizeMeteoSettings({ station: '   ' })).toEqual({ station: null, stations: [] });
  });

  it('golo ARSO oznako sprejme in ji doda ponudnika (združljivost nazaj)', () => {
    // Dokler je bil ponudnik en sam, so klicatelji pošiljali `{"station":"VRHNIKA"}` in
    // avtomatizacija, napisana takrat, to počne še danes (člen III).
    expect(normalizeMeteoSettings({ station: ' vrhnika ' })).toEqual({
      station: 'arso:VRHNIKA',
      stations: ['arso:VRHNIKA'],
    });
  });

  it('sprejme več postaj različnih ponudnikov in ohrani vrstni red', () => {
    expect(normalizeMeteoSettings({ stations: ['arso:VRHNIKA', 'neverin:sveta-marina'] })).toEqual({
      station: 'arso:VRHNIKA',
      stations: ['arso:VRHNIKA', 'neverin:sveta-marina'],
    });
  });

  it('`station` je vedno PRVA postaja seznama — polji se ne smeta razhajati', () => {
    // Odjemalec, ki bere še staro polje, mora videti isto postajo kot preklopnik na zavihku.
    const written = normalizeMeteoSettings({ stations: ['neverin:sveta-marina', 'arso:VRHNIKA'] });
    expect(written?.station).toBe('neverin:sveta-marina');
  });

  it('kadar prideta obe obliki, obvelja seznam', () => {
    expect(normalizeMeteoSettings({ station: 'VRHNIKA', stations: ['neverin:sveta-marina'] })).toEqual({
      station: 'neverin:sveta-marina',
      stations: ['neverin:sveta-marina'],
    });
  });

  it('podvojeno postajo tiho izpusti', () => {
    expect(normalizeMeteoSettings({ stations: ['arso:VRHNIKA', 'arso:vrhnika'] })).toEqual({
      station: 'arso:VRHNIKA',
      stations: ['arso:VRHNIKA'],
    });
  });

  it('neveljavno oznako zavrne z razumljivim sporočilom', () => {
    expect(() => normalizeMeteoSettings({ stations: ['../../etc'] })).toThrowError(/postaje/i);
    expect(() => normalizeMeteoSettings({ stations: ['ni-tak-ponudnik:x'] })).toThrowError(/postaje/i);
  });

  it('zavrne več postaj, kot jih preklopnik lahko pokaže', () => {
    const many = Array.from({ length: 9 }, (_, i) => `neverin:postaja-${i}`);
    expect(() => normalizeMeteoSettings({ stations: many })).toThrowError(/največ/i);
  });
});
