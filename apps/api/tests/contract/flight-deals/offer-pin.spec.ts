import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightOfferPinModel } from '../../../src/modules/flight-deals/models/flight-offer-pin.model.js';
import { AUTH, loginAs, seedMatch, seedOffer, seedRule } from './_helpers.js';

// Pripenjanje ponudb: osebno (po uporabniku), na vrhu seznama, 404 brez vidnega ujemanja.

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

describe('PUT /flight-deals/offers/:offerId/pin', () => {
  it('pripne samo za klicatelja; pripeta je prva in pripeta tudi v podrobnostih', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const rule = await seedRule(ana.userId);
    const cheap = await seedOffer({ price: { amount: 100, currency: 'EUR' } });
    const dear = await seedOffer({ price: { amount: 900, currency: 'EUR' } });
    await seedMatch(rule, cheap);
    await seedMatch(rule, dear);

    const pin = await request(app).put(`/api/v1/flight-deals/offers/${dear._id}/pin`).set(AUTH(ana.token)).send({ pinned: true });
    expect(pin.status).toBe(200);
    expect(pin.body).toEqual({ pinned: true });

    const list = await request(app).get('/api/v1/flight-deals/offers?sort=price').set(AUTH(ana.token));
    expect(list.body.offers.map((o: { id: string; pinned: boolean }) => [o.id, o.pinned])).toEqual([
      [String(dear._id), true],
      [String(cheap._id), false],
    ]);
    expect((await request(app).get(`/api/v1/flight-deals/offers/${dear._id}`).set(AUTH(ana.token))).body.pinned).toBe(true);

    // Tuja ponudba: brez vidnega ujemanja je 404, nič se ne shrani.
    expect((await request(app).put(`/api/v1/flight-deals/offers/${dear._id}/pin`).set(AUTH(bor.token)).send({ pinned: true })).status).toBe(404);
    expect(await FlightOfferPinModel.countDocuments()).toBe(1);

    await request(app).put(`/api/v1/flight-deals/offers/${dear._id}/pin`).set(AUTH(ana.token)).send({ pinned: false });
    expect(await FlightOfferPinModel.countDocuments()).toBe(0);
  });

  it('neveljavno telo je 400', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    const offer = await seedOffer();
    await seedMatch(rule, offer);
    expect((await request(app).put(`/api/v1/flight-deals/offers/${offer._id}/pin`).set(AUTH(ana.token)).send({ pinned: 'da' })).status).toBe(400);
  });
});
