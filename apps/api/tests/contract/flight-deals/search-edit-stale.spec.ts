import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightSearchMatchModel } from '../../../src/modules/flight-deals/models/flight-search-match.model.js';
import { AUTH, loginAs, seedMatch, seedOffer, seedRule } from './_helpers.js';

// Sprememba iskanja: ponudbe, ki novim nastavitvam ne ustrezajo več, izginejo s seznama; pripete ostanejo.

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

describe('PATCH /flight-deals/searches/:id', () => {
  it('ujemanja zunaj novega obdobja označi za zastarela, pripeta ponudba ostane', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    const starred = await seedOffer();
    const plain = await seedOffer();
    await seedMatch(rule, starred);
    await seedMatch(rule, plain);
    const pin = await request(app).put(`/api/v1/flight-deals/offers/${starred._id}/pin`).set(AUTH(ana.token)).send({ pinned: true });
    expect(pin.status).toBe(200);

    const res = await request(app)
      .patch(`/api/v1/flight-deals/searches/${rule._id}`)
      .set(AUTH(ana.token))
      .send({ dates: { mode: 'range', from: '2030-04-01', to: '2030-04-30' } });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/v1/flight-deals/offers').set(AUTH(ana.token));
    expect(list.body.offers.map((o: { id: string }) => o.id)).toEqual([String(starred._id)]);
    expect((await FlightSearchMatchModel.findOne({ offerId: plain._id }))?.status).toBe('stale');
    expect((await FlightSearchMatchModel.findOne({ offerId: starred._id }))?.status).toBe('active');
  });

  it('sprememba, ki ne vpliva na ujemanje (ime), ponudb ne skrije', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    const offer = await seedOffer();
    await seedMatch(rule, offer);

    const res = await request(app).patch(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(ana.token)).send({ name: 'Preimenovano' });
    expect(res.status).toBe(200);

    expect((await FlightSearchMatchModel.findOne({ offerId: offer._id }))?.status).toBe('active');
  });
});
