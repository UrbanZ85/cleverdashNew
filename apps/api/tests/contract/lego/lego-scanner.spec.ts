import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { AUTH, loginAs, seedApiKey } from '../scanner/_helpers.js';

// 018: pogodba specs/018-lego-scanner/contracts/openapi.yaml (`GET /lego-scanner/sources`) in ustvarjanje
// iskanj tipa `lego` prek obstoječih poti 016 (`/scanners`): validacija konfiguracije, lastništvo.

beforeAll(async () => {
  setTestEnv({ EBAY_MARKETPLACES: 'EBAY_DE' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv({ EBAY_MARKETPLACES: 'EBAY_DE', LEGO_FAKE_SOURCE_ENABLED: 'false', REBRICKABLE_API_KEY: '', BRICKLINK_CONSUMER_KEY: '', BRICKLINK_CONSUMER_SECRET: '', BRICKLINK_TOKEN: '', BRICKLINK_TOKEN_SECRET: '', EBAY_CLIENT_ID: '', EBAY_CLIENT_SECRET: '' });
  await clearTestDb();
});

let app: Express;
async function boot() {
  app = (await createApp()).app;
}

describe('GET /lego-scanner/sources', () => {
  it('brez ključev: vsi trije viri izklopljeni s slovenskim razlogom; tržnice po namestitvi', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/lego-scanner/sources').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body.fake).toBe(false);
    expect(res.body.marketplaces).toEqual(['EBAY_DE']);
    expect(res.body.catalog).toMatchObject({ enabled: false, label: 'Rebrickable (katalog)' });
    expect(res.body.catalog.reason).toContain('REBRICKABLE_API_KEY');
    expect(res.body.prices.reason).toContain('BRICKLINK_CONSUMER_KEY');
    expect(res.body.listings.reason).toContain('EBAY_CLIENT_ID');
  });

  it('s ključi: vklopljeno; odgovor NIKOLI ne vsebuje ključev; BrickLink zahteva vse štiri', async () => {
    setTestEnv({ REBRICKABLE_API_KEY: 'RB-SECRET-1', BRICKLINK_CONSUMER_KEY: 'a', BRICKLINK_CONSUMER_SECRET: 'BL-SECRET-2', BRICKLINK_TOKEN: 'c', EBAY_CLIENT_ID: 'EB-ID', EBAY_CLIENT_SECRET: 'EB-SECRET-3', EBAY_MARKETPLACES: 'EBAY_DE' });
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/lego-scanner/sources').set(AUTH(ana.token));
    expect(res.body.catalog.enabled).toBe(true);
    expect(res.body.listings.enabled).toBe(true);
    expect(res.body.prices).toMatchObject({ enabled: false });
    expect(res.body.prices.reason).toBe('Manjkajo ključi: BRICKLINK_TOKEN_SECRET.');
    const text = JSON.stringify(res.body);
    for (const secret of ['RB-SECRET-1', 'BL-SECRET-2', 'EB-SECRET-3', 'EB-ID']) expect(text).not.toContain(secret);
  });

  it('testni vir nadomesti vse tri vloge; brez prijave 401; API ključ z obsegom scanners:read sme', async () => {
    setTestEnv({ LEGO_FAKE_SOURCE_ENABLED: 'true', EBAY_MARKETPLACES: 'EBAY_DE' });
    await boot();
    const res = await request(app).get('/api/v1/lego-scanner/sources').set(AUTH((await loginAs(app, 'ana')).token));
    expect(res.body).toMatchObject({ fake: true, catalog: { enabled: true }, prices: { enabled: true }, listings: { enabled: true } });
    expect((await request(app).get('/api/v1/lego-scanner/sources')).status).toBe(401);
    const key = await seedApiKey(['scanners:read']);
    expect((await request(app).get('/api/v1/lego-scanner/sources').set('X-API-Key', key)).status).toBe(200);
    const none = await seedApiKey(['notes:read'], null, 'seed-lego-none');
    expect((await request(app).get('/api/v1/lego-scanner/sources').set('X-API-Key', none)).status).toBe(403);
  });
});

describe('POST /scanners z type: lego', () => {
  const VALID = { name: 'Falcon pod 500', type: 'lego', schedule: { preset: 'every-6h' }, config: { setNumber: '75192', maxPrice: 500, sellerCountries: ['de'] } };

  it('tip je na voljo brez ključev; ustvari z normalizirano konfiguracijo in privzetki; aiEnabled privzeto false', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const types = await request(app).get('/api/v1/scanners/types').set(AUTH(ana.token));
    expect(types.body.types.find((t: { type: string }) => t.type === 'lego')).toMatchObject({ label: 'LEGO skener', icon: 'cube-outline', execution: 'single', enabled: true, available: true, ownsDefinitions: false, customResults: false });
    const res = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(VALID);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'lego', typeLabel: 'LEGO skener', aiEnabled: false, schedule: { preset: 'every-6h' } });
    expect(res.body.config).toMatchObject({ setNumber: '75192-1', maxPrice: 500, currency: 'EUR', sellerCountries: ['DE'], marketplaces: ['EBAY_DE'], conditions: [], listingTypes: ['FIXED_PRICE', 'AUCTION'], auctionEndingHours: 6 });
    expect(await ScannerDefinitionModel.countDocuments({ type: 'lego' })).toBe(1);
  });

  it('več neodvisnih iskanj istega uporabnika; aiEnabled se shrani na iskanju', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const a = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(VALID);
    const b = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send({ ...VALID, name: 'Technic pod 100', aiEnabled: true, config: { theme: 'Technic', maxPrice: 100 } });
    expect(a.body.id).not.toBe(b.body.id);
    expect(b.body.aiEnabled).toBe(true);
    expect((await request(app).get('/api/v1/scanners').set(AUTH(ana.token))).body.scanners.filter((s: { type: string }) => s.type === 'lego')).toHaveLength(2);
  });

  it('400 s slovenskim razlogom: brez kriterija, številka seta, meje, tržnica, podtema brez teme, nepoznano stanje', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const post = (config: Record<string, unknown>) => request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send({ ...VALID, config });
    expect((await post({})).body.detail).toContain('vsaj eno');
    expect((await post({ setNumber: '12' })).body.detail).toContain('4 do 6 števk');
    expect((await post({ keywords: 'x', minPrice: 100, maxPrice: 50 })).body.detail).toContain('cena');
    expect((await post({ keywords: 'x', marketplaces: ['EBAY_IT'] })).body.detail).toContain('EBAY_IT');
    expect((await post({ keywords: 'x', subtheme: 'UCS' })).body.detail).toContain('Podtema');
    expect((await post({ keywords: 'x', conditions: ['MINT'] })).status).toBe(400);
    expect((await post({ keywords: 'x', minDiscountPct: 150 })).status).toBe(400);
  });

  it('tuje iskanje: 404 za branje, spremembo in brisanje; PATCH je delen in se preveri kot celota', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const created = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(VALID);
    const id = created.body.id as string;
    expect((await request(app).get(`/api/v1/scanners/${id}`).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/scanners/${id}`).set(AUTH(bor.token)).send({ aiEnabled: true })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/scanners/${id}`).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/scanners/${id}/results`).set(AUTH(bor.token))).status).toBe(404);

    const patched = await request(app).patch(`/api/v1/scanners/${id}`).set(AUTH(ana.token)).send({ config: { maxPrice: 450 }, aiEnabled: true });
    expect(patched.status).toBe(200);
    expect(patched.body.config).toMatchObject({ setNumber: '75192-1', maxPrice: 450 });
    expect(patched.body.aiEnabled).toBe(true);
    const bad = await request(app).patch(`/api/v1/scanners/${id}`).set(AUTH(ana.token)).send({ config: { minPrice: 900 } });
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toContain('cena');
  });

  it('rezultati praznega skenerja: seznam brez rezultatov', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const created = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(VALID);
    const res = await request(app).get(`/api/v1/scanners/${created.body.id}/results`).set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [], total: 0 });
  });
});
