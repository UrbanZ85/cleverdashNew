import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

// 011: pogodbeni testi za `/meteo/*`. `fetch` je zamenjan, da testi ne obremenjujejo pravega
// ARSO ob vsakem zagonu — člen VIII velja tudi za CI, ne samo za odjemalca v brskalniku.

/** Skrajšan odsek prave strani (Vrhnika, 9. 9. 2026): podvojeni stolpci (skrita celica s
 * surovo vrednostjo + vidna z zaokroženo) in prazne celice postaje brez barometra. */
function historyPage(stationTitle: string): string {
  const rows = [
    { valid: '2026-09-09 07:20', t: '20.4', rr: '0' },
    { valid: '2026-09-09 07:30', t: '22.6', rr: '0.4' },
    { valid: '2026-09-09 07:40', t: '22.8', rr: '0.2' },
  ]
    .map(
      (r) => `<tr>
        <td class="meteoSI-th">Sreda, ${r.valid} CEST</td>
        <td class="valid_UTC" style="display:none;" id="valid_UTC">${r.valid}</td>
        <td class="domain_longTitle" style="display:none;" id="domain_longTitle">${stationTitle}</td>
        <td class="domain_altitude" style="display:none;" id="domain_altitude">310</td>
        <td class="domain_lat" style="display:none;" id="domain_lat">45.966</td>
        <td class="domain_lon" style="display:none;" id="domain_lon">14.2717</td>
        <td class="t" style="display:none;" id="t">${r.t}</td><td class="t">${r.t}</td>
        <td class="rh" style="display:none;" id="rh">63</td><td class="rh">63</td>
        <td class="ffavg_val" style="display:none;" id="ffavg_val">6.156</td><td class="ffavg_val">6</td>
        <td class="ffmax_val" style="display:none;" id="ffmax_val">13.824</td><td class="ffmax_val">14</td>
        <td class="dd_val" style="display:none;" id="dd_val">255</td>
        <td class="msl" style="display:none;" id="msl"></td><td class="msl"></td>
        <td class="rr_val" style="display:none;" id="rr_val">${r.rr}</td><td class="rr_val">${r.rr}</td>
      </tr>`,
    )
    .join('\n');
  return `<html><body><table class="meteoSI-table">
    <tr><th class="meteoSI-header" id="title">${stationTitle}</th></tr>
    ${rows}
  </table></body></html>`;
}

const STATION_LIST_XML = `<?xml version="1.0" encoding="UTF-8"?><data>
  <metData><domain_title>VRHNIKA</domain_title><domain_longTitle>Vrhnika</domain_longTitle>
    <domain_meteosiId>VRHNIKA_</domain_meteosiId><domain_lat>45.966</domain_lat>
    <domain_lon>14.2717</domain_lon><domain_altitude>310</domain_altitude></metData>
  <metData><domain_title>LJUBLJANA BEZIGRAD</domain_title><domain_longTitle>Ljubljana</domain_longTitle>
    <domain_meteosiId>LJUBL-ANA_BEZIGRAD_</domain_meteosiId><domain_lat>46.0655</domain_lat>
    <domain_lon>14.5124</domain_lon><domain_altitude>299</domain_altitude></metData>
</data>`;

/** Izsek pravega odgovora `core.neverin.hr/stations/<slug>/archive`. Veter je pri tem viru v
 * m/s in ga modul pretvori v km/h (glej domain/neverin-parse.ts). */
function neverinArchive(slug: string): string {
  return JSON.stringify({
    data: {
      station: {
        slug,
        title: 'Sveta Marina',
        subtitle: null,
        lat: 45.03237,
        lon: 14.15992,
        elevation: 10,
        timezone: 'Europe/Zagreb',
        source: { name: 'IstraStream', url: 'https://www.istrastream.com' },
      },
      items: {
        weather: [
          { temp: 20.4, rh: 63, pressure: 1015.7, wavg: 1.71, wgust: 3.84, wdir: 255, precip: 0, ts: 1789024800 },
          { temp: 22.6, rh: 63, pressure: 1015.6, wavg: 1.71, wgust: 3.84, wdir: 255, precip: 0.4, ts: 1789025400 },
          { temp: 22.8, rh: 63, pressure: 1015.5, wavg: 1.71, wgust: 3.84, wdir: 255, precip: 0.2, ts: 1789026000 },
        ],
      },
    },
  });
}

const NEVERIN_LIST = JSON.stringify({
  data: {
    stations: [
      { slug: 'sveta-marina', title: 'Sveta Marina', lat: 45.03237, lon: 14.15992, elevation: 10, country_code: 'HR' },
      { slug: 'ljubljana-bezigrad', title: 'Ljubljana-Bežigrad', lat: 46.0655, lon: 14.5124, elevation: 299, country_code: 'SI' },
    ],
  },
});

/** Glave, s katerimi je bil poklican Neverin — vir brez `Origin` odgovori 403, zato je to
 * del pogodbe z njim in ne podrobnost prenosa. */
function neverinRequestHeaders(): Record<string, string> | undefined {
  const spy = fetch as unknown as ReturnType<typeof vi.fn>;
  const call = spy.mock.calls.find(([input]) => String(input).includes('core.neverin.hr'));
  return call?.[1]?.headers as Record<string, string> | undefined;
}

// 004: `openid-client` (Keycloak) in `loginAsTestUser()` uporabljata isti globalni `fetch` —
// klici proti ponarejenemu Keycloaku (127.0.0.1) MORAJO iti do resničnega omrežja.
const realFetch = globalThis.fetch;

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('127.0.0.1')) return realFetch(input, init);

      if (url.includes('observationAms_si_latest.xml')) {
        return new Response(STATION_LIST_XML, {
          status: 200,
          headers: { 'content-type': 'application/xml', etag: '"stations-1"' },
        });
      }
      const history = /observationAms_(.+)_history\.html$/.exec(url);
      if (history) {
        // Neznana postaja se pri ARSO pokaže kot 404 — modul mora to prevesti v razumljivo
        // napako in ne v prazen graf.
        if (history[1] === 'NI-TAKE-POSTAJE') return new Response('Not found', { status: 404 });
        return new Response(historyPage(history[1] === 'VRHNIKA' ? 'Vrhnika' : 'Ljubljana'), {
          status: 200,
          headers: { 'content-type': 'text/html', etag: `"${history[1]}-1"` },
        });
      }
      if (url.includes('core.neverin.hr/stations/readings')) {
        return new Response(NEVERIN_LIST, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const neverin = /core\.neverin\.hr\/stations\/([a-z0-9-]+)\/archive/.exec(url);
      if (neverin) {
        if (neverin[1] === 'ni-take-postaje') return new Response('Not found', { status: 404 });
        return new Response(neverinArchive(neverin[1]!), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Nepričakovan fetch na ${url}`);
    }),
  );
}

async function login(app: import('express').Express) {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloak, { roles: ['cleverdash-user'] });
  return accessToken;
}

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});
beforeEach(stubFetch);

describe('GET /meteo/history', () => {
  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/meteo/history')).status).toBe(401);
  });

  it('vrne urne vrednosti, povzetek in navedbo vira', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app)
      .get('/api/v1/meteo/history?station=VRHNIKA')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.station).toMatchObject({ id: 'VRHNIKA', title: 'Vrhnika', altitudeM: 310 });
    // Vse tri meritve (07:20–07:40 UTC) so po lokalnem času v uri 09 → eno vedro, vsota 0.6 mm.
    expect(res.body.buckets).toHaveLength(1);
    expect(res.body.buckets[0]).toMatchObject({ label: '09', precipitationMm: 0.6, samples: 3 });
    expect(res.body.summary).toMatchObject({ temperatureMinC: 20.4, temperatureMaxC: 22.8 });
    // Člen VIII: ARSO podatki so vedno prikazani z navedbo vira, zato je navedba del podatka.
    expect(res.body.source.attribution).toEqual({ text: 'Vir: ARSO', url: 'https://meteo.arso.gov.si' });
    expect(res.body.source.url).toContain('observationAms_VRHNIKA_history.html');
    expect(res.body.available).toMatchObject({ temperature: true, precipitation: true, pressure: false });
    // Vsote po oknih so del odgovora tudi pri krajšem oknu prikaza — "koliko je padlo v 48
    // urah" je smiselno vprašanje tudi ob 6-urnem grafu.
    expect(res.body.precipitationWindows.map((w: { hours: number }) => w.hours)).toEqual([4, 8, 12, 24, 48]);
    expect(res.body.precipitationWindows.find((w: { hours: number }) => w.hours === 4)).toMatchObject({
      millimeters: 0.6,
      samples: 3,
    });
  });

  it('posameznih meritev privzeto ne vrne, z ?raw=true pa jih', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const lean = await request(app).get('/api/v1/meteo/history').set('Authorization', `Bearer ${token}`);
    expect(lean.body.measurements).toBeUndefined();

    const raw = await request(app).get('/api/v1/meteo/history?raw=true').set('Authorization', `Bearer ${token}`);
    expect(raw.body.measurements).toHaveLength(3);
    expect(raw.body.measurements[0]).toMatchObject({ validUtc: '2026-09-09T07:20:00.000Z', temperatureC: 20.4 });
  });

  it('krajše okno prikaza ne skrajša vsot po oknih', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app)
      .get('/api/v1/meteo/history?station=VRHNIKA&hours=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.hours).toBe(1);
    // Prikaz je ena ura, vsote pa so iz celotne prebrane serije.
    expect(res.body.precipitationWindows.find((w: { hours: number }) => w.hours === 48)).toMatchObject({
      millimeters: 0.6,
    });
  });

  it('brez izbrane postaje vrne privzetek namestitve in to pove', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app).get('/api/v1/meteo/history').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.station.id).toBe('LJUBL-ANA_BEZIGRAD');
    expect(res.body.station.chosen).toBe(false);
  });

  it('postajo iz nastavitev upošteva brez parametra v naslovu', async () => {
    const { app } = await createApp();
    const token = await login(app);

    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ meteo: { station: 'vrhnika' } })
      .expect(200);

    const res = await request(app).get('/api/v1/meteo/history').set('Authorization', `Bearer ${token}`);
    expect(res.body.station).toMatchObject({ id: 'VRHNIKA', chosen: true });
  });

  it('drugi klic znotraj TTL vira ne prenese znova (člen VIII)', async () => {
    const { app } = await createApp();
    const token = await login(app);

    await request(app).get('/api/v1/meteo/history?station=VRHNIKA').set('Authorization', `Bearer ${token}`);
    const spy = fetch as unknown as ReturnType<typeof vi.fn>;
    const callsAfterFirst = spy.mock.calls.length;

    await request(app).get('/api/v1/meteo/history?station=VRHNIKA').set('Authorization', `Bearer ${token}`);
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('neveljavna oznaka postaje vrne 400', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app)
      .get('/api/v1/meteo/history?station=..%2F..%2Fetc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('postaja, ki je pri ARSO ni, vrne 503 z razlago in ne prazne ploščice', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app)
      .get('/api/v1/meteo/history?station=NI-TAKE-POSTAJE')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(503);
    expect(String(res.body.detail ?? res.body.title)).toMatch(/postaj/i);
  });
});

describe('GET /meteo/stations', () => {
  it('vrne postaje OBEH ponudnikov in trenutno izbrane', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app).get('/api/v1/meteo/stations').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // ARSO seznam je zlitje zapisanega imenika (domain/station-catalog.ts) in živega posnetka
    // cikla, zato je daljši od vzorca — pomembno je, da so v njem postaje iz OBEH virov.
    const refs = res.body.stations.map((s: { ref: string }) => s.ref);
    expect(refs).toContain('arso:VRHNIKA');
    expect(refs).toContain('arso:LJUBL-ANA_BEZIGRAD');
    expect(refs).toContain('arso:KREDA-ICA');
    expect(refs).toContain('neverin:sveta-marina');
    expect(res.body.stations.length).toBeGreaterThan(100);
    // Enolična je REFERENCA in ne oznaka: `ljubljana-bezigrad` obstaja pri obeh ponudnikih in
    // to sta dve različni postaji, ne podvojitev.
    expect(new Set(refs).size).toBe(refs.length);
    expect(res.body.selected).toEqual(['arso:LJUBL-ANA_BEZIGRAD']);
    expect(res.body.chosen).toBe(false);
  });

  it('navedbo vira pove vsak ponudnik zase', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app).get('/api/v1/meteo/stations').set('Authorization', `Bearer ${token}`);

    // Člen VIII: "Vir: ARSO" nad hrvaško postajo bi bila napačna navedba, kar je slabše od
    // nobene — zato navedba pripada ponudniku in ne odgovoru.
    const arso = res.body.providers.find((p: { id: string }) => p.id === 'arso');
    const neverin = res.body.providers.find((p: { id: string }) => p.id === 'neverin');
    expect(arso.attribution).toEqual({ text: 'Vir: ARSO', url: 'https://meteo.arso.gov.si' });
    expect(neverin.attribution).toEqual({ text: 'Vir: Neverin.hr', url: 'https://www.neverin.hr' });
    expect(arso.unavailable).toBe(false);
    expect(neverin.unavailable).toBe(false);
  });

  it('filtrira po ponudniku in po iskanem nizu', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const only = await request(app)
      .get('/api/v1/meteo/stations?provider=neverin')
      .set('Authorization', `Bearer ${token}`);
    expect(only.body.stations.every((s: { provider: string }) => s.provider === 'neverin')).toBe(true);

    // Iskanje brez šumnikov mora najti postajo s šumniki (isto pravilo kot v vmesniku).
    const found = await request(app)
      .get('/api/v1/meteo/stations?q=bezigrad')
      .set('Authorization', `Bearer ${token}`);
    expect(found.body.stations.map((s: { ref: string }) => s.ref)).toContain('neverin:ljubljana-bezigrad');
    expect(found.body.total).toBe(found.body.stations.length);
  });

  it('izpad enega ponudnika ne izprazni seznama drugega', async () => {
    // Člen VII: napaka mora biti vidna (`unavailable`), ne pa tiho prazen seznam — in
    // uporabnik, ki išče Vrhniko, je ne sme izgubiti zato, ker je nedosegljiv hrvaški vir.
    const { app } = await createApp();
    const token = await login(app);
    const spy = fetch as unknown as ReturnType<typeof vi.fn>;
    const passthrough = spy.getMockImplementation()!;
    spy.mockImplementation(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes('core.neverin.hr')) throw new Error('vir ni dosegljiv');
      return passthrough(input, init);
    });

    const res = await request(app).get('/api/v1/meteo/stations').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stations.map((s: { ref: string }) => s.ref)).toContain('arso:VRHNIKA');
    expect(res.body.providers.find((p: { id: string }) => p.id === 'neverin').unavailable).toBe(true);
    expect(res.body.providers.find((p: { id: string }) => p.id === 'arso').unavailable).toBe(false);
  });

  it('neznanega ponudnika zavrne s 400', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .get('/api/v1/meteo/stations?provider=meteoblue')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/meteo/stations')).status).toBe(401);
  });
});

describe('postaje Neverin', () => {
  it('vrne meritve, pretvorjene v iste enote kot ARSO', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app)
      .get('/api/v1/meteo/history?station=neverin:sveta-marina&raw=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.station).toMatchObject({
      ref: 'neverin:sveta-marina',
      provider: 'neverin',
      providerLabel: 'Neverin',
      title: 'Sveta Marina',
      timezone: 'Europe/Zagreb',
    });
    // Veter je pri viru v m/s: 1,71 m/s = 6,2 km/h, 3,84 m/s = 13,8 km/h. Brez pretvorbe bi
    // bila postaja na istem grafu kot ARSO 3,6-krat bolj mirna, ne da bi bilo to vidno.
    expect(res.body.measurements[0]).toMatchObject({ windAvgKmh: 6.2, windMaxKmh: 13.8 });
    // Tlak tega vira ni enotno reduciran na morsko gladino, zato se ne pretvarja, da je.
    expect(res.body.measurements[0]).toMatchObject({ pressureHpa: 1015.7, pressureMslHpa: null });
    expect(res.body.summary).toMatchObject({ temperatureMinC: 20.4, temperatureMaxC: 22.8 });
  });

  it('navede ponudnika IN upravljavca postaje', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app)
      .get('/api/v1/meteo/history?station=neverin:sveta-marina')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.source.attribution).toEqual({ text: 'Vir: Neverin.hr', url: 'https://www.neverin.hr' });
    // Neverin je omrežje tujih postaj — člen VIII zahteva, da se vidi, čigava je meritev.
    expect(res.body.station.operator).toEqual({ name: 'IstraStream', url: 'https://www.istrastream.com' });
    // Povezava za človeka je njihova STRAN postaje in ne JSON, s katerega bere strežnik.
    expect(res.body.source.url).toBe('https://www.neverin.hr/postaja/sveta-marina/');
  });

  it('pošlje glavo Origin, brez katere vir odgovori 403', async () => {
    const { app } = await createApp();
    const token = await login(app);

    await request(app)
      .get('/api/v1/meteo/history?station=neverin:sveta-marina')
      .set('Authorization', `Bearer ${token}`);

    expect(neverinRequestHeaders()).toMatchObject({
      origin: 'https://www.neverin.hr',
      referer: 'https://www.neverin.hr/',
    });
  });

  it('postaja, ki je pri viru ni, vrne 503 z razlago in ne prazne ploščice', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app)
      .get('/api/v1/meteo/history?station=neverin:ni-take-postaje')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(503);
  });
});

describe('GET /meteo/selection', () => {
  it('vrne izbrane postaje z imeni — preklopnik jih potrebuje za čipe', async () => {
    const { app } = await createApp();
    const token = await login(app);

    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ meteo: { stations: ['neverin:sveta-marina', 'arso:VRHNIKA'] } })
      .expect(200);

    const res = await request(app).get('/api/v1/meteo/selection').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.chosen).toBe(true);
    expect(res.body.stations).toEqual([
      expect.objectContaining({
        ref: 'neverin:sveta-marina',
        provider: 'neverin',
        title: 'Sveta Marina',
        countryCode: 'HR',
        // Prva izbrana je tista, ki jo dobi klic brez `?station=` (in ploščica).
        primary: true,
      }),
      expect.objectContaining({ ref: 'arso:VRHNIKA', provider: 'arso', title: 'Vrhnika', primary: false }),
    ]);
  });

  it('brez izbire vrne privzetek namestitve in to pove', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app).get('/api/v1/meteo/selection').set('Authorization', `Bearer ${token}`);

    expect(res.body.chosen).toBe(false);
    expect(res.body.stations).toHaveLength(1);
    expect(res.body.stations[0]).toMatchObject({ ref: 'arso:LJUBL-ANA_BEZIGRAD', primary: true });
  });

  it('bere samo sezname ponudnikov, ki v izbiri nastopajo', async () => {
    // Kdor ima izbrane le ARSO postaje, zaradi preklopnika ne sme sprožiti prenosa pri
    // Neverinu (člen VIII).
    const { app } = await createApp();
    const token = await login(app);

    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ meteo: { stations: ['arso:VRHNIKA'] } })
      .expect(200);

    const spy = fetch as unknown as ReturnType<typeof vi.fn>;
    const before = spy.mock.calls.filter(([i]) => String(i).includes('neverin')).length;
    await request(app).get('/api/v1/meteo/selection').set('Authorization', `Bearer ${token}`);
    const after = spy.mock.calls.filter(([i]) => String(i).includes('neverin')).length;

    expect(after).toBe(before);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/meteo/selection')).status).toBe(401);
  });
});

describe('več izbranih postaj', () => {
  it('brez `?station=` velja PRVA izbrana', async () => {
    const { app } = await createApp();
    const token = await login(app);

    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ meteo: { stations: ['arso:VRHNIKA', 'neverin:sveta-marina'] } })
      .expect(200);

    const res = await request(app).get('/api/v1/meteo/history').set('Authorization', `Bearer ${token}`);
    expect(res.body.station).toMatchObject({ ref: 'arso:VRHNIKA', chosen: true });
  });

  it('shranjena gola oznaka še vedno velja (združljivost nazaj)', async () => {
    // Dokumenti, shranjeni pred razširitvijo na več ponudnikov, imajo `meteo.station` kot
    // golo ARSO oznako. Nadgradnja uporabniku ne sme tiho pobrisati postaje.
    const { app } = await createApp();
    const token = await login(app);

    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ meteo: { station: 'vrhnika' } })
      .expect(200);

    const settings = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(settings.body.meteo).toEqual({ station: 'arso:VRHNIKA', stations: ['arso:VRHNIKA'] });

    const res = await request(app).get('/api/v1/meteo/history').set('Authorization', `Bearer ${token}`);
    expect(res.body.station).toMatchObject({ ref: 'arso:VRHNIKA', chosen: true });
  });
});
