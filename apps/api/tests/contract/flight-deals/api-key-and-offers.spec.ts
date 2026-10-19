import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightOfferHistoryModel } from '../../../src/modules/flight-deals/models/flight-offer-history.model.js';
import { AUTH, loginAs, seedApiKey, seedMatch, seedOffer, seedRule, weekendInput } from './_helpers.js';

// US7 (API ključ, člen III) in US2/US3 (seznam ponudb, podrobnosti z zgodovino, pregled).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
async function boot() {
  app = (await createApp()).app;
}

describe('API ključ (US7)', () => {
  it('ključ z read bere, z write ustvari v imenu lastnika ključa; brez share ne doda prejemnika; admin → 403', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const read = await seedApiKey(['flight-deals:read'], ana.userId, 'seed-fd-read');
    const write = await seedApiKey(['flight-deals:read', 'flight-deals:write'], ana.userId, 'seed-fd-write');

    const created = await request(app).post('/api/v1/flight-deals/searches').set('X-API-Key', write).set('Idempotency-Key', 'k1').send(weekendInput());
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/v1/flight-deals/searches').set('X-API-Key', read);
    expect(list.body.searches).toHaveLength(1);
    // Iskanje pripada lastniku ključa — Ana ga vidi kot svoje.
    expect((await request(app).get('/api/v1/flight-deals/searches').set(AUTH(ana.token))).body.searches).toHaveLength(1);
    expect((await request(app).post('/api/v1/flight-deals/searches').set('X-API-Key', read).send(weekendInput())).status).toBe(403);
    expect((await request(app).put(`/api/v1/flight-deals/searches/${created.body.id}/recipients/${bor.userId}`).set('X-API-Key', write).send({})).status).toBe(403);
    expect((await request(app).get('/api/v1/flight-deals/admin/scheduler').set('X-API-Key', write)).status).toBe(403);
    expect((await request(app).get('/api/v1/flight-deals/offers').set('X-API-Key', read)).status).toBe(200);
  });
});

describe('ponudbe (US2, US3)', () => {
  it('GET /offers: scope, sort, changed, limit+total; podrobnosti z zgodovino in change', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    const cheap = await seedOffer({ price: { amount: 100, currency: 'EUR' }, previousPrice: { amount: 120, currency: 'EUR', at: new Date() }, lastChangeType: 'PRICE_DOWN' });
    const pricey = await seedOffer({ price: { amount: 300, currency: 'EUR' } });
    await seedMatch(rule, cheap, 'PRICE_DOWN');
    await seedMatch(rule, pricey, 'UNCHANGED');
    await FlightOfferHistoryModel.create([
      { offerId: cheap._id, runId: rule._id, checkedAt: new Date(Date.now() - 2000), price: { amount: 120, currency: 'EUR' }, previousPrice: null, changeType: 'NEW', expiresAt: new Date(Date.now() + 86_400_000) },
      { offerId: cheap._id, runId: rule._id, checkedAt: new Date(Date.now() - 1000), price: { amount: 100, currency: 'EUR' }, previousPrice: { amount: 120, currency: 'EUR' }, changeType: 'PRICE_DOWN', expiresAt: new Date(Date.now() + 86_400_000) },
    ]);

    const byPrice = await request(app).get('/api/v1/flight-deals/offers?sort=price').set(AUTH(ana.token));
    expect(byPrice.status).toBe(200);
    expect(byPrice.body.total).toBe(2);
    expect(byPrice.body.offers.map((o: { price: { amount: number } }) => o.price.amount)).toEqual([100, 300]);
    expect(byPrice.body.offers[0]).toMatchObject({
      providerId: 'fake',
      providerOfficial: false,
      origin: expect.objectContaining({ iata: 'LJU', timezone: 'Europe/Ljubljana', countryName: 'Slovenija' }),
      destination: expect.objectContaining({ iata: 'STN', timezone: 'Europe/London' }),
      pricePerPerson: { amount: 50, currency: 'EUR' },
      previousPrice: { amount: 120, currency: 'EUR' },
      change: { type: 'PRICE_DOWN', absolute: -20, percent: -16.7 },
      matches: [expect.objectContaining({ searchId: String(rule._id), isOwn: true, owner: null, changeType: 'PRICE_DOWN' })],
    });
    expect(byPrice.body.offers[1].change).toBeNull();
    expect(byPrice.body.offers[1].previousPrice).toBeNull();

    const changed = await request(app).get('/api/v1/flight-deals/offers?changed=true').set(AUTH(ana.token));
    expect(changed.body.total).toBe(1);
    const limited = await request(app).get('/api/v1/flight-deals/offers?limit=1').set(AUTH(ana.token));
    expect(limited.body.offers).toHaveLength(1);
    expect(limited.body.total).toBe(2);

    const detail = await request(app).get(`/api/v1/flight-deals/offers/${cheap._id}`).set(AUTH(ana.token));
    expect(detail.status).toBe(200);
    expect(detail.body.history.map((h: { changeType: string }) => h.changeType)).toEqual(['NEW', 'PRICE_DOWN']);
    expect(detail.body.history[0].previousPrice).toBeNull();

    const perRule = await request(app).get(`/api/v1/flight-deals/searches/${rule._id}/offers?sort=departure`).set(AUTH(ana.token));
    expect(perRule.body.total).toBe(2);
  });

  it('nedosegljive ponudbe so skrite, razen z includeUnavailable', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    const gone = await seedOffer({ availability: 'unavailable', lastChangeType: 'UNAVAILABLE' });
    const match = await seedMatch(rule, gone, 'UNAVAILABLE');
    await match.updateOne({ status: 'unavailable' });
    expect((await request(app).get('/api/v1/flight-deals/offers').set(AUTH(ana.token))).body.total).toBe(0);
    const incl = await request(app).get('/api/v1/flight-deals/offers?includeUnavailable=true').set(AUTH(ana.token));
    expect(incl.body.total).toBe(1);
    expect(incl.body.offers[0].availability).toBe('unavailable');
    expect(incl.body.offers[0].change).toEqual({ type: 'UNAVAILABLE', absolute: 0, percent: 0 });
  });

  it('GET /overview združi iskanja, nove, spremembe, najcenejše in zadnji zagon', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    await seedMatch(rule, await seedOffer(), 'NEW');
    const res = await request(app).get('/api/v1/flight-deals/overview?limit=5').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body.searches).toHaveLength(1);
    expect(res.body.newOffers.total).toBe(1);
    expect(res.body.cheapest.offers).toHaveLength(1);
    expect(res.body.priceChanges.offers).toHaveLength(0);
    expect(res.body.lastRun).toBeNull();
    expect(res.body.limits).toMatchObject({ maxRecipients: 10, maxFlexDays: 60 });
  });
});
