import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginAsAdmin, seedMatch, seedOffer, seedRule } from './_helpers.js';

// FR-014, FR-031, SC-005: tuje iskanje in tuja ponudba sta 404 — obstoja ne razkrijemo. 012: admin
// z X-Acting-User vidi iskanja prevzete osebe.

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

describe('izolacija iskanj', () => {
  it('uporabnik B na iskanju uporabnika A dobi 404 za GET/PATCH/DELETE/offers/recipients', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const rule = await seedRule(ana.userId);
    const base = `/api/v1/flight-deals/searches/${rule._id}`;
    expect((await request(app).get(base).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).patch(base).set(AUTH(bor.token)).send({ name: 'Ukradeno' })).status).toBe(404);
    expect((await request(app).delete(base).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).get(`${base}/offers`).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).put(`${base}/recipients/${bor.userId}`).set(AUTH(bor.token)).send({})).status).toBe(404);
    // Iskanje je nedotaknjeno.
    const mine = await request(app).get(base).set(AUTH(ana.token));
    expect(mine.status).toBe(200);
    expect(mine.body.name).toBe('Testni vikend');
  });

  it('neveljaven id je 404, ne 500', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    expect((await request(app).get('/api/v1/flight-deals/searches/ni-id').set(AUTH(ana.token))).status).toBe(404);
    expect((await request(app).get('/api/v1/flight-deals/offers/ni-id').set(AUTH(ana.token))).status).toBe(404);
  });

  it('tuja ponudba (brez vidnega ujemanja) je 404, čeprav v bazi obstaja (FR-031)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const rule = await seedRule(ana.userId);
    const offer = await seedOffer();
    await seedMatch(rule, offer);
    expect((await request(app).get(`/api/v1/flight-deals/offers/${offer._id}`).set(AUTH(ana.token))).status).toBe(200);
    expect((await request(app).get(`/api/v1/flight-deals/offers/${offer._id}`).set(AUTH(bor.token))).status).toBe(404);
    const list = await request(app).get('/api/v1/flight-deals/offers').set(AUTH(bor.token));
    expect(list.body).toEqual({ offers: [], total: 0 });
  });

  it('admin z X-Acting-User vidi iskanja prevzete osebe (012)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const admin = await loginAsAdmin(app);
    await seedRule(ana.userId, { name: 'Anino' });
    const own = await request(app).get('/api/v1/flight-deals/searches').set(AUTH(admin.token));
    expect(own.body.searches).toHaveLength(0);
    const acting = await request(app).get('/api/v1/flight-deals/searches').set(AUTH(admin.token)).set('X-Acting-User', ana.userId);
    expect(acting.status).toBe(200);
    expect(acting.body.searches.map((s: { name: string }) => s.name)).toEqual(['Anino']);
  });
});
