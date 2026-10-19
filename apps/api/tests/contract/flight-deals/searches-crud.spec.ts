import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightSearchMatchModel } from '../../../src/modules/flight-deals/models/flight-search-match.model.js';
import { AUTH, loginAs, seedMatch, seedOffer, seedRule, weekendInput } from './_helpers.js';

// US1: CRUD iskanj proti pogodbi (`/flight-deals/searches*`).

beforeAll(async () => {
  setTestEnv({ FLIGHT_MAX_RULES_PER_USER: '3' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
async function boot() {
  app = (await createApp()).app;
  return app;
}

describe('POST /flight-deals/searches', () => {
  it('ustvari iskanje s predogledom in stanjem "še ni preverjeno" (acceptance US1.1, US1.2)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).post('/api/v1/flight-deals/searches').set(AUTH(ana.token)).send(weekendInput());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Vikend',
      active: true,
      isOwn: true,
      departureAirports: ['LJU', 'TRS'],
      recipients: [],
      lastCheck: null,
      lastSuccessfulCheckAt: null,
      offerCount: 0,
    });
    expect(res.body.preview.outboundWindow).toEqual({ from: '2026-10-20', to: '2026-11-03' });
    expect(res.body.preview.queries).toBe(6);
    expect(res.body.dates).toEqual({ mode: 'range', from: '2026-10-22', to: '2026-11-01' });
    expect(res.body.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('max < min nočitev → 400 s slovenskim razlogom (acceptance US1.4)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).post('/api/v1/flight-deals/searches').set(AUTH(ana.token)).send(weekendInput({ minNights: 3, maxNights: 2 }));
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/nočitev/);
  });

  it('fleksibilnost −1 in 2,5 → 400; neznano letališče → 400 (acceptance US1.5)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    expect((await request(app).post('/api/v1/flight-deals/searches').set(AUTH(ana.token)).send(weekendInput({ flexDays: -1 }))).status).toBe(400);
    expect((await request(app).post('/api/v1/flight-deals/searches').set(AUTH(ana.token)).send(weekendInput({ flexDays: 2.5 }))).status).toBe(400);
    const res = await request(app).post('/api/v1/flight-deals/searches').set(AUTH(ana.token)).send(weekendInput({ departureAirports: ['XXX'] }));
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('XXX');
  });

  it('presežena meja iskanj na osebo → 400 (FR-015)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    for (let i = 0; i < 3; i += 1) await seedRule(ana.userId, { name: `Iskanje ${i}` });
    const res = await request(app).post('/api/v1/flight-deals/searches').set(AUTH(ana.token)).send(weekendInput());
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/mejo 3 iskanj/);
  });

  it('Idempotency-Key: ponovitev vrne isti odgovor in ne ustvari drugega iskanja', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const key = 'fd-create-1';
    const a = await request(app).post('/api/v1/flight-deals/searches').set(AUTH(ana.token)).set('Idempotency-Key', key).send(weekendInput());
    const b = await request(app).post('/api/v1/flight-deals/searches').set(AUTH(ana.token)).set('Idempotency-Key', key).send(weekendInput());
    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    const list = await request(app).get('/api/v1/flight-deals/searches').set(AUTH(ana.token));
    expect(list.body.searches).toHaveLength(1);
  });
});

describe('GET / PATCH / DELETE', () => {
  it('seznam vrne samo lastnikova iskanja, najnovejše najprej', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    await seedRule(ana.userId, { name: 'Prvo' });
    await seedRule(ana.userId, { name: 'Drugo' });
    await seedRule(bor.userId, { name: 'Borovo' });
    const res = await request(app).get('/api/v1/flight-deals/searches').set(AUTH(ana.token));
    expect(res.body.searches.map((s: { name: string }) => s.name)).toEqual(['Drugo', 'Prvo']);
  });

  it('PATCH je delen: active:false deaktivira, ostalo ostane; sprememba se preveri kot celota', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    const off = await request(app).patch(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(ana.token)).send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.active).toBe(false);
    expect(off.body.name).toBe('Testni vikend');

    const bad = await request(app).patch(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(ana.token)).send({ maxNights: 1 });
    expect(bad.status).toBe(400); // min 2 > max 1

    const empty = await request(app).patch(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(ana.token)).send({});
    expect(empty.status).toBe(400);
  });

  it('DELETE vrne 200 z deleted:true in pobriše ujemanja, ponudbe pa ostanejo', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    const offer = await seedOffer();
    await seedMatch(rule, offer);
    const res = await request(app).delete(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(await FlightSearchMatchModel.countDocuments({ ruleId: rule._id })).toBe(0);
    const again = await request(app).get(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(ana.token));
    expect(again.status).toBe(404);
  });

  it('GET enega iskanja vrne offerCount aktivnih ujemanj', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    await seedMatch(rule, await seedOffer());
    await seedMatch(rule, await seedOffer());
    const res = await request(app).get(`/api/v1/flight-deals/searches/${rule._id}`).set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body.offerCount).toBe(2);
  });
});
