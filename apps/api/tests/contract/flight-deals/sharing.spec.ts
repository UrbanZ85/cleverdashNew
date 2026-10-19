import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, seedApiKey, seedMatch, seedOffer, seedRule } from './_helpers.js';

// US5 (FR-040 do FR-044): prejemniki obvestil, deljene ponudbe, preklic.

beforeAll(async () => {
  setTestEnv({ FLIGHT_MAX_RECIPIENTS: '2' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
async function boot() {
  app = (await createApp()).app;
}

describe('PUT/DELETE /flight-deals/searches/:id/recipients/:userId', () => {
  it('doda prejemnika z imenom in zamaskirano e-pošto; ponovni klic spremeni notify in ne doda drugega', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const rule = await seedRule(ana.userId);
    const path = `/api/v1/flight-deals/searches/${rule._id}/recipients/${bor.userId}`;
    const added = await request(app).put(path).set(AUTH(ana.token)).send({});
    expect(added.status).toBe(200);
    expect(added.body.recipients).toEqual([
      expect.objectContaining({ id: bor.userId, displayName: 'Uporabnik BOR', notify: true, emailHint: expect.stringContaining('@example.com') }),
    ]);
    expect(added.body.recipients[0].emailHint).not.toBe('bor@example.com');

    const muted = await request(app).put(path).set(AUTH(ana.token)).send({ notify: false });
    expect(muted.body.recipients).toHaveLength(1);
    expect(muted.body.recipients[0].notify).toBe(false);
  });

  it('lastnik sam, neprijavljena oseba, neveljaven id, meja → 400', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const cene = await loginAs(app, 'cene');
    const dani = await loginAs(app, 'dani');
    const rule = await seedRule(ana.userId);
    const base = `/api/v1/flight-deals/searches/${rule._id}/recipients`;
    expect((await request(app).put(`${base}/${ana.userId}`).set(AUTH(ana.token)).send({})).status).toBe(400);
    expect((await request(app).put(`${base}/ni-id`).set(AUTH(ana.token)).send({})).status).toBe(400);
    expect((await request(app).put(`${base}/64b000000000000000000001`).set(AUTH(ana.token)).send({})).status).toBe(400);
    expect((await request(app).put(`${base}/${bor.userId}`).set(AUTH(ana.token)).send({})).status).toBe(200);
    expect((await request(app).put(`${base}/${cene.userId}`).set(AUTH(ana.token)).send({})).status).toBe(200);
    const over = await request(app).put(`${base}/${dani.userId}`).set(AUTH(ana.token)).send({});
    expect(over.status).toBe(400);
    expect(over.body.detail).toMatch(/največ 2/);
  });

  it('brez obsega flight-deals:share je 403, tudi z write (FR-043)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const rule = await seedRule(ana.userId);
    const secret = await seedApiKey(['flight-deals:read', 'flight-deals:write'], ana.userId);
    const res = await request(app).put(`/api/v1/flight-deals/searches/${rule._id}/recipients/${bor.userId}`).set('X-API-Key', secret).send({});
    expect(res.status).toBe(403);
  });

  it('prejemnik vidi deljene ponudbe z lastnikom, ne pa iskanja; po odstranitvi ne vidi več ničesar (FR-041, FR-042)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const rule = await seedRule(ana.userId, {}, [{ userId: bor.userId }]);
    const offer = await seedOffer();
    await seedMatch(rule, offer);

    const shared = await request(app).get('/api/v1/flight-deals/offers?scope=shared').set(AUTH(bor.token));
    expect(shared.status).toBe(200);
    expect(shared.body.total).toBe(1);
    expect(shared.body.offers[0].matches[0]).toMatchObject({
      searchId: String(rule._id),
      searchName: 'Testni vikend',
      isOwn: false,
      owner: expect.objectContaining({ displayName: 'Uporabnik ANA' }),
      changeType: 'NEW',
    });
    // Konfiguracije iskanja v odgovoru NI.
    expect(JSON.stringify(shared.body)).not.toContain('departureAirports');
    expect((await request(app).get(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(bor.token)).send({ active: false })).status).toBe(404);
    expect((await request(app).get(`/api/v1/flight-deals/offers/${offer._id}`).set(AUTH(bor.token))).status).toBe(200);
    // own scope prejemniku ne vrne ničesar
    expect((await request(app).get('/api/v1/flight-deals/offers?scope=own').set(AUTH(bor.token))).body.total).toBe(0);

    const removed = await request(app).delete(`/api/v1/flight-deals/searches/${rule._id}/recipients/${bor.userId}`).set(AUTH(ana.token));
    expect(removed.status).toBe(200);
    expect(removed.body.recipients).toEqual([]);
    expect((await request(app).get('/api/v1/flight-deals/offers?scope=shared').set(AUTH(bor.token))).body.total).toBe(0);
    expect((await request(app).get(`/api/v1/flight-deals/offers/${offer._id}`).set(AUTH(bor.token))).status).toBe(404);
    // Odstranitev je idempotentna.
    expect((await request(app).delete(`/api/v1/flight-deals/searches/${rule._id}/recipients/${bor.userId}`).set(AUTH(ana.token))).status).toBe(200);
  });
});
