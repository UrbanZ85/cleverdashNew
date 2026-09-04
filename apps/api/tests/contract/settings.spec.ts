import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

// 004: nadomesti prejšnjo prijavo z e-pošto/geslom — glej tests/setup/login-as-test-user.ts.
// `cleverdash-admin` ohrani vedenje starega bootstrap uporabnika (edini, vedno admin).
async function loginAndUnlock(app: import('express').Express) {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloak, { roles: ['cleverdash-admin'] });
  return accessToken;
}

describe('GET /settings', () => {
  it('vrne privzete nastavitve, ustvarjene ob prvem branju', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.weather.locationName).toBe('Ljubljana');
    expect(res.body.theme).toBe('system');
    expect(res.body.tiles).toEqual([]);
    // 003, data-model.md "Nastavitve porabe podatkov": privzeto vklopljeno.
    expect(res.body.cameraDataSaverEnabled).toBe(true);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/settings');
    expect(res.status).toBe(401);
  });
});

describe('PUT /settings', () => {
  it('delna posodobitev teme ne spremeni lokacije (FR-028)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app).put('/api/v1/settings').set('Authorization', `Bearer ${token}`).send({ theme: 'dark' });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.theme).toBe('dark');
    expect(res.body.weather.locationName).toBe('Ljubljana'); // nedotaknjeno
  });

  it('izklop cameraDataSaverEnabled ne spremeni teme (003, Story 7)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ cameraDataSaverEnabled: false });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.cameraDataSaverEnabled).toBe(false);
    expect(res.body.theme).toBe('system');
  });

  it('posodobitev samo latitude ne pobriše že nastavljenega locationName', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ weather: { locationName: 'Maribor' } });
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ weather: { latitude: 46.55 } });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.weather.locationName).toBe('Maribor');
    expect(res.body.weather.latitude).toBe(46.55);
  });

  it('razporeditev ploščic in vidnost se ohranita med "sejami" (novimi zahtevami)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tiles: [{ type: 'radar', position: 0, visible: true }, { type: 'weather', position: 1, visible: false }] });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.tiles).toEqual([
      { type: 'radar', position: 0, visible: true },
      { type: 'weather', position: 1, visible: false },
    ]);
  });

  it('prekritje samo enabled za en zavihek ohrani že nastavljen order drugega prekritja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabs: { dashboard: { order: 5 } } });
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabs: { dashboard: { enabled: false } } });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.tabs.dashboard).toEqual({ order: 5, enabled: false });
  });

  // Regresija (najdena ob načrtovanju 010): ploščica "Pot" (005) je bila registrirana samo
  // na odjemalcu, v KNOWN_TILE_TYPES pa ne — zato je vsak PUT /settings, ki jo je vseboval,
  // tiho vrnil razporeditev BREZ nje in uporabnikova nastavitev je izginila. Test hodi skozi
  // cel endpoint in ne samo skozi validator, ker se je napaka pokazala prav na tej poti.
  it('vgrajene vrste ploščic (vključno s "commute") preživijo PUT /settings', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const tiles = [
      { type: 'weather', position: 0, visible: true },
      { type: 'forecast', position: 1, visible: true },
      { type: 'radar', position: 2, visible: true },
      { type: 'commute', position: 3, visible: true },
    ];

    const put = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tiles });
    expect(put.status).toBe(200);
    expect(put.body.tiles.map((t: { type: string }) => t.type)).toEqual([
      'weather',
      'forecast',
      'radar',
      'commute',
    ]);

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.tiles).toEqual(tiles);
  });

  it('podvojen position v razporeditvi vrne 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tiles: [{ type: 'weather', position: 0 }, { type: 'radar', position: 0 }] });
    expect(res.status).toBe(400);
  });
});

// US2, SC-002: "popolnoma ločeni podatki na uporabnika" — dva prijavljena uporabnika dobita
// neodvisna dokumenta Settings, sprememba enega ni vidna drugemu.
describe('Izolacija nastavitev med uporabniki (SC-002)', () => {
  it('sprememba nastavitev enega uporabnika ni vidna drugemu', async () => {
    const { app } = await createApp();
    const { accessToken: tokenA } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-settings-user-a',
      email: 'settings-a@example.com',
      roles: ['cleverdash-user'],
    });
    const { accessToken: tokenB } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-settings-user-b',
      email: 'settings-b@example.com',
      roles: ['cleverdash-user'],
    });

    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ theme: 'dark', weather: { locationName: 'Maribor' } });

    const resA = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.theme).toBe('dark');
    expect(resA.body.weather.locationName).toBe('Maribor');

    const resB = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.theme).toBe('system'); // privzeto, NEDOTAKNJENO spremembo uporabnika A
    expect(resB.body.weather.locationName).toBe('Ljubljana');
  });
});

// ─── 005: osebni viri podatkov in varovalo nad izklopom zavihkov ───

describe('PUT /settings — zavihki, ki se ne smejo izklopiti', () => {
  it('izklop zavihka "settings" vrne 400 — brez njega ni poti nazaj', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabs: { settings: { enabled: false } } });
    expect(res.status).toBe(400);
  });

  it('spreminjanje vrstnega reda zavihka "settings" je dovoljeno', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabs: { settings: { order: 1 } } });
    expect(res.status).toBe(200);
    expect(res.body.tabs.settings).toEqual({ order: 1 });
  });

  it('izklop zavihka "cameras" je dovoljen', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabs: { cameras: { enabled: false } } });
    expect(res.status).toBe(200);

    const tabs = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`);
    expect(tabs.body.map((t: { id: string }) => t.id)).not.toContain('cameras');
  });
});

describe('PUT /settings — osebni naslovi virov', () => {
  it('privzeto so vsi prazni (velja sistemski privzetek iz .env)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.sources).toEqual({ weatherUrl: null, radarUrl: null, webcamBaseUrl: null });
  });

  it('shrani osebni naslov in ga vrne', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ sources: { weatherUrl: 'https://vreme.example.com/api/' } });
    expect(res.status).toBe(200);
    expect(res.body.sources.weatherUrl).toBe('https://vreme.example.com/api/');
    // Drugi viri ostanejo na privzetku.
    expect(res.body.sources.radarUrl).toBeNull();
  });

  it('prazen niz pomeni "povrni na sistemski privzetek"', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ sources: { radarUrl: 'https://radar.example.com/si.gif' } });

    const cleared = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ sources: { radarUrl: '' } });
    expect(cleared.body.sources.radarUrl).toBeNull();
  });

  it.each([
    'http://vreme.example.com/api/',
    'https://127.0.0.1/api/',
    'https://192.168.0.9/api/',
    'ne-url',
  ])('zavrne nevaren ali neveljaven naslov %s', async (url) => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ sources: { weatherUrl: url } });
    expect(res.status).toBe(400);
  });
});

describe('PUT /settings — razporeditev z vtičnikom', () => {
  it('vnos vrste "plugin" z veljavnim pluginId se ohrani', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const plugin = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Moj vir', kind: 'link', url: 'https://example.com/a' });

    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tiles: [
          { type: 'weather', position: 0, visible: true },
          { type: 'plugin', position: 1, visible: true, config: { pluginId: plugin.body.id } },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.tiles).toHaveLength(2);
    expect(res.body.tiles[1].config.pluginId).toBe(plugin.body.id);
  });

  it('vnos vrste "plugin" brez veljavnega pluginId vrne 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tiles: [{ type: 'plugin', position: 0, visible: true }] });
    expect(res.status).toBe(400);
  });
});


// ─── Ploščica "Pot": dva kraja (doma, služba) v Settings.commute ───

describe('PUT /settings — kraja ploščice "Pot"', () => {
  it('privzeto sta oba brez naslova in koordinat, z privzetimi imeni', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.commute).toEqual({
      home: { label: 'Doma', address: null, latitude: null, longitude: null },
      work: { label: 'Služba', address: null, latitude: null, longitude: null },
      mapHeightPx: 170,
      layout: 'vertical',
    });
  });

  it('shrani koordinati obeh krajev in ne spremeni teme', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        commute: {
          home: { label: 'Doma', latitude: 46.062382, longitude: 14.560178 },
          work: { label: 'Agenda', latitude: 45.9610473, longitude: 14.2979519 },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.commute.home).toEqual({
      label: 'Doma',
      address: null,
      latitude: 46.062382,
      longitude: 14.560178,
    });
    expect(res.body.commute.work.label).toBe('Agenda');
    expect(res.body.theme).toBe('system');
  });

  it('shranitev enega kraja ne pobriše drugega', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { home: { address: 'Kranj 1' } } });

    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { work: { address: 'Vrhnika 2' } } });

    expect(res.body.commute.home.address).toBe('Kranj 1');
    expect(res.body.commute.work.address).toBe('Vrhnika 2');
  });

  it('sprememba samo imena ohrani shranjeni naslov', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { work: { address: 'Vrhnika 2', label: 'Služba' } } });

    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { work: { label: 'Pisarna' } } });

    expect(res.body.commute.work).toEqual({
      label: 'Pisarna',
      address: 'Vrhnika 2',
      latitude: null,
      longitude: null,
    });
  });

  it('prazen naslov pomeni "ni naslova"', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { home: { address: 'Kranj 1' } } });

    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { home: { address: '' } } });
    expect(res.body.commute.home.address).toBeNull();
  });

  it.each([
    [{ home: { latitude: 46.1 } }, 'samo širina'],
    [{ home: { latitude: 91, longitude: 14 } }, 'širina izven mej'],
    [{ work: { latitude: 46, longitude: 181 } }, 'dolžina izven mej'],
    [{ work: { label: 'x'.repeat(41) } }, 'predolgo ime'],
  ])('zavrne neveljaven kraj (%#: %s)', async (commute, _opis) => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute });
    expect(res.status).toBe(400);
  });
});

describe('PUT /settings — videz ploščice "Pot"', () => {
  it('shrani višino zemljevida in postavitev, krajev pa ne spremeni', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { home: { address: 'Vrhnika' } } });

    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { mapHeightPx: 300, layout: 'horizontal' } });

    expect(res.status).toBe(200);
    expect(res.body.commute.mapHeightPx).toBe(300);
    expect(res.body.commute.layout).toBe('horizontal');
    expect(res.body.commute.home.address).toBe('Vrhnika');
  });

  it.each([99, 601, 0])('zavrne višino izven mej (%s)', async (mapHeightPx) => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { mapHeightPx } });
    expect(res.status).toBe(400);
  });

  it('zavrne neznano postavitev', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ commute: { layout: 'diagonalno' } });
    expect(res.status).toBe(400);
  });
});
