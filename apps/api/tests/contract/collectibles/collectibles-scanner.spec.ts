import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { AUTH, loginAs, seedApiKey } from '../scanner/_helpers.js';

// 019: pogodba specs/019-collectibles-scanner/contracts/openapi.yaml (`GET /collectibles-scanner/sources` in
// `/categories`) in ustvarjanje iskanj tipa `collectibles` prek obstoječih poti 016 (`/scanners`):
// registracija, validacija konfiguracije po kategorijah, lastništvo, obsegi.

const OFF = { COLLECTIBLES_FAKE_SOURCE_ENABLED: 'false', PRICECHARTING_API_KEY: '', EBAY_CLIENT_ID: '', EBAY_CLIENT_SECRET: '', EBAY_MARKETPLACES: 'EBAY_DE,EBAY_IT' };

beforeAll(async () => {
  setTestEnv(OFF);
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv(OFF);
  await clearTestDb();
});

let app: Express;
async function boot() {
  app = (await createApp()).app;
}

describe('GET /collectibles-scanner/sources', () => {
  it('brez ključev: eBay in PriceCharting izklopljena s slovenskim razlogom; katalog kartic ne potrebuje ključa', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/collectibles-scanner/sources').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body.fake).toBe(false);
    expect(res.body.marketplaces).toEqual(['EBAY_DE', 'EBAY_IT']);
    expect(res.body.listings).toMatchObject({ enabled: false, label: 'eBay (oglasi)' });
    expect(res.body.listings.reason).toContain('EBAY_CLIENT_ID');
    expect(res.body.catalog).toMatchObject({ enabled: true, reason: null });
    expect(res.body.prices).toMatchObject({ enabled: false });
    expect(res.body.prices.reason).toContain('PRICECHARTING_API_KEY');
  });

  it('s ključi: vklopljeno; odgovor NIKOLI ne vsebuje ključev', async () => {
    setTestEnv({ ...OFF, EBAY_CLIENT_ID: 'EB-ID-9', EBAY_CLIENT_SECRET: 'EB-SECRET-3', PRICECHARTING_API_KEY: 'PC-SECRET-7' });
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/collectibles-scanner/sources').set(AUTH(ana.token));
    expect(res.body.listings.enabled).toBe(true);
    expect(res.body.prices.enabled).toBe(true);
    const text = JSON.stringify(res.body);
    for (const secret of ['EB-ID-9', 'EB-SECRET-3', 'PC-SECRET-7']) expect(text).not.toContain(secret);
  });

  it('testni vir nadomesti vse tri vloge; brez prijave 401; obseg scanners:read sme, brez obsega 403', async () => {
    setTestEnv({ ...OFF, COLLECTIBLES_FAKE_SOURCE_ENABLED: 'true' });
    await boot();
    const res = await request(app).get('/api/v1/collectibles-scanner/sources').set(AUTH((await loginAs(app, 'ana')).token));
    expect(res.body).toMatchObject({ fake: true, listings: { enabled: true }, catalog: { enabled: true }, prices: { enabled: true } });
    expect((await request(app).get('/api/v1/collectibles-scanner/sources')).status).toBe(401);
    const key = await seedApiKey(['scanners:read']);
    expect((await request(app).get('/api/v1/collectibles-scanner/sources').set('X-API-Key', key)).status).toBe(200);
    const none = await seedApiKey(['notes:read'], null, 'seed-coll-none');
    expect((await request(app).get('/api/v1/collectibles-scanner/sources').set('X-API-Key', none)).status).toBe(403);
  });
});

describe('GET /collectibles-scanner/categories', () => {
  it('opis kategorij za dinamični obrazec: kartice in retro igre z oznakami in možnostmi', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/collectibles-scanner/categories').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    const cats = res.body.categories as Array<{ category: string; label: string; fields: Array<{ key: string; kind: string; options?: unknown[] }> }>;
    expect(cats.map((c) => c.category).sort()).toEqual(['retro-gaming', 'trading-cards']);
    const cards = cats.find((c) => c.category === 'trading-cards')!;
    expect(cards.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['cards.setName', 'cards.cardNumber', 'cards.language', 'cards.edition', 'cards.gradingCompany', 'cards.grade', 'cards.gradeStatus']));
    const retro = cats.find((c) => c.category === 'retro-gaming')!;
    expect(retro.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['retro.platform', 'retro.region', 'retro.completeness', 'retro.working']));
    expect(retro.fields.find((f) => f.key === 'retro.region')!.options?.length).toBeGreaterThan(2);
  });

  it('brez prijave 401', async () => {
    await boot();
    expect((await request(app).get('/api/v1/collectibles-scanner/categories')).status).toBe(401);
  });
});

describe('POST /scanners z type: collectibles', () => {
  const CARDS = { name: 'Charizard pod 100', type: 'collectibles', schedule: { preset: 'every-6h' }, config: { category: 'trading-cards', keywords: 'Charizard', maxPrice: 100, sellerCountries: ['de'], cards: { cardNumber: '4/102', gradingCompany: 'PSA', grade: '9' } } };
  const RETRO = { name: 'Game Boy pod 80', type: 'collectibles', schedule: { preset: 'daily-06' }, config: { category: 'retro-gaming', maxPrice: 80, retro: { platform: 'gb', completeness: 'cib' } } };

  it('tip je na voljo brez ključev; ustvari z normalizirano konfiguracijo in privzetki; aiEnabled privzeto false', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const types = await request(app).get('/api/v1/scanners/types').set(AUTH(ana.token));
    expect(types.body.types.find((t: { type: string }) => t.type === 'collectibles')).toMatchObject({ label: 'Zbirateljski predmeti', icon: 'albums-outline', execution: 'single', enabled: true, available: true, ownsDefinitions: false, customResults: false });
    const res = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(CARDS);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'collectibles', typeLabel: 'Zbirateljski predmeti', aiEnabled: false, schedule: { preset: 'every-6h' } });
    expect(res.body.config).toMatchObject({ category: 'trading-cards', keywords: 'Charizard', maxPrice: 100, currency: 'EUR', sellerCountries: ['DE'], marketplaces: ['EBAY_DE'], listingTypes: ['FIXED_PRICE', 'AUCTION'], auctionEndingHours: 6 });
    expect(res.body.config.cards).toMatchObject({ cardNumber: '4', gradingCompany: 'PSA', grade: '9', language: 'any', edition: 'any' });
    expect(await ScannerDefinitionModel.countDocuments({ type: 'collectibles' })).toBe(1);
  });

  it('več neodvisnih iskanj različnih kategorij, vsako s svojim urnikom in stikalom UI', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const a = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(CARDS);
    const b = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send({ ...RETRO, aiEnabled: true });
    expect(a.body.id).not.toBe(b.body.id);
    expect(a.body.aiEnabled).toBe(false);
    expect(b.body.aiEnabled).toBe(true);
    expect(a.body.schedule.preset).toBe('every-6h');
    expect(b.body.schedule.preset).toBe('daily-06');
    expect(b.body.config.retro).toMatchObject({ platform: 'gb', completeness: 'cib', region: 'any' });
    expect(b.body.config).not.toHaveProperty('cards');
    expect((await request(app).get('/api/v1/scanners').set(AUTH(ana.token))).body.scanners.filter((s: { type: string }) => s.type === 'collectibles')).toHaveLength(2);
  });

  it('400 s slovenskim razlogom: neznana kategorija, brez kriterija, neskladni filtri, meje, tržnica', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const post = (config: Record<string, unknown>) => request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send({ ...CARDS, config });
    expect((await post({ category: 'watches', keywords: 'seiko' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ category: 'trading-cards' })).body.detail).toContain('vsaj eno');
    expect((await post({ category: 'trading-cards', keywords: 'x', minPrice: 100, maxPrice: 50 })).body.detail).toContain('cena');
    expect((await post({ category: 'trading-cards', keywords: 'x', marketplaces: ['EBAY_FR'] })).body.detail).toContain('EBAY_FR');
    expect((await post({ category: 'trading-cards', cards: { gradeStatus: 'raw', gradingCompany: 'PSA' } })).body.detail).toContain('Neocenjena');
    expect((await post({ category: 'retro-gaming', retro: { platform: 'atari' } })).status).toBe(400);
    expect((await post({ category: 'trading-cards', keywords: 'x', minDiscountPct: 150 })).status).toBe(400);
  });

  it('tuje iskanje: 404 za branje, spremembo in brisanje; PATCH je delen in se preveri kot celota', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const id = (await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(CARDS)).body.id as string;
    expect((await request(app).get(`/api/v1/scanners/${id}`).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/scanners/${id}`).set(AUTH(bor.token)).send({ aiEnabled: true })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/scanners/${id}`).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/scanners/${id}/results`).set(AUTH(bor.token))).status).toBe(404);

    const patched = await request(app).patch(`/api/v1/scanners/${id}`).set(AUTH(ana.token)).send({ config: { maxPrice: 80 }, aiEnabled: true });
    expect(patched.status).toBe(200);
    expect(patched.body.config).toMatchObject({ category: 'trading-cards', maxPrice: 80 });
    expect(patched.body.aiEnabled).toBe(true);
    const bad = await request(app).patch(`/api/v1/scanners/${id}`).set(AUTH(ana.token)).send({ config: { minPrice: 900 } });
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toContain('cena');
  });

  it('rezultati praznega skenerja: seznam brez rezultatov', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const created = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(RETRO);
    const res = await request(app).get(`/api/v1/scanners/${created.body.id}/results`).set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [], total: 0 });
  });
});
