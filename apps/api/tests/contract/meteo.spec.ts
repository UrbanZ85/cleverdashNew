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
  it('vrne seznam postaj in trenutno izbrano', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const res = await request(app).get('/api/v1/meteo/stations').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Seznam je zlitje zapisanega imenika (domain/station-catalog.ts) in živega posnetka cikla,
    // zato je daljši od vzorca — pomembno je, da so v njem postaje iz OBEH virov.
    const ids = res.body.stations.map((s: { id: string }) => s.id);
    expect(ids).toContain('VRHNIKA');
    expect(ids).toContain('LJUBL-ANA_BEZIGRAD');
    expect(ids).toContain('KREDA-ICA');
    expect(res.body.stations.length).toBeGreaterThan(100);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.body.selected).toEqual({ id: 'LJUBL-ANA_BEZIGRAD', chosen: false });
    expect(res.body.source.attribution.text).toBe('Vir: ARSO');
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/meteo/stations')).status).toBe(401);
  });
});
