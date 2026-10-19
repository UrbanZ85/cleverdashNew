import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightSearchRuleModel } from '../../../src/modules/flight-deals/models/flight-search-rule.model.js';
import { SettingsModel } from '../../../src/modules/settings/model.js';
import { AUTH, loginAs, weekendInput } from './_helpers.js';

// FR-007 (predogled), FR-003/FR-004 (letališča, radij, domači kraj), države, viri.

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

describe('POST /flight-deals/searches/preview', () => {
  it('vrne okni, kombinacije in opozorila, ne shrani ničesar', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).post('/api/v1/flight-deals/searches/preview').set(AUTH(ana.token)).send(weekendInput());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      outboundWindow: { from: '2026-10-20', to: '2026-11-03' },
      returnWindow: { from: '2026-10-22', to: '2026-11-03' },
      queries: 6,
      truncated: false,
    });
    expect(res.body.dateCombinations).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(await FlightSearchRuleModel.countDocuments()).toBe(0);
  });

  it('po meri ±10 razširi okno; neveljaven vnos je 400', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app)
      .post('/api/v1/flight-deals/searches/preview')
      .set(AUTH(ana.token))
      .send(weekendInput({ flexDays: 10, dates: { mode: 'range', from: '2026-11-22', to: '2026-12-01' } }));
    expect(res.body.outboundWindow).toEqual({ from: '2026-11-12', to: '2026-12-11' });
    expect((await request(app).post('/api/v1/flight-deals/searches/preview').set(AUTH(ana.token)).send({ name: 'x' })).status).toBe(400);
  });
});

describe('GET /flight-deals/airports', () => {
  it('iskanje po nizu najde Trst po kodi, imenu in mestu', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    for (const q of ['trst', 'TRS', 'ronchi', 'trieste']) {
      const res = await request(app).get(`/api/v1/flight-deals/airports?q=${q}`).set(AUTH(ana.token));
      expect(res.status, q).toBe(200);
      expect(res.body.airports.map((a: { iata: string }) => a.iata), q).toContain('TRS');
    }
    const trs = (await request(app).get('/api/v1/flight-deals/airports?q=TRS').set(AUTH(ana.token))).body.airports[0];
    expect(trs).toMatchObject({ iata: 'TRS', country: 'IT', countryName: 'Italija', timezone: 'Europe/Rome' });
  });

  it('radij 150 km od LJU vsebuje letališča iz naročila z razdaljo (acceptance US1.6)', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/flight-deals/airports?near=LJU&radiusKm=150').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    const codes = res.body.airports.map((a: { iata: string }) => a.iata);
    for (const c of ['LJU', 'ZAG', 'TRS', 'GRZ', 'KLU']) expect(codes).toContain(c);
    expect(res.body.airports[0]).toMatchObject({ iata: 'LJU', distanceKm: 0 });
  });

  it('near=home brez nastavljenega doma → 400, z domom → razdalje od doma', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const missing = await request(app).get('/api/v1/flight-deals/airports?near=home').set(AUTH(ana.token));
    expect(missing.status).toBe(400);
    expect(missing.body.detail).toMatch(/Domači kraj/);

    await SettingsModel.updateOne({ userId: ana.userId }, { $set: { 'commute.home.latitude': 46.05, 'commute.home.longitude': 14.5 } }, { upsert: true });
    const ok = await request(app).get('/api/v1/flight-deals/airports?near=home&radiusKm=60').set(AUTH(ana.token));
    expect(ok.status).toBe(200);
    expect(ok.body.airports[0]?.iata).toBe('LJU');
  });

  it('neznano letališče kot izhodišče → 400; brez q in near → prazno', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    expect((await request(app).get('/api/v1/flight-deals/airports?near=XXX').set(AUTH(ana.token))).status).toBe(400);
    expect((await request(app).get('/api/v1/flight-deals/airports').set(AUTH(ana.token))).body).toEqual({ airports: [], total: 0 });
  });
});

describe('GET /flight-deals/countries in /providers', () => {
  it('države so razvrščene po slovenskem imenu', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/flight-deals/countries').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    const names = res.body.countries.map((c: { name: string }) => c.name);
    expect(names).toContain('Slovenija');
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b, 'sl')));
  });

  it('viri: pet vnosov, brez zadnje napake, neuradni označen, Wizz/easyJet nista vklopljena', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/flight-deals/providers').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.providers.map((p: { id: string }) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(['easyjet', 'fake', 'ryanair', 'travelpayouts', 'wizzair']);
    expect(byId.ryanair).toMatchObject({ official: false, enabled: false });
    expect(byId.wizzair.enabled).toBe(false);
    expect(byId.travelpayouts.enabled).toBe(false); // brez žetona v testnem okolju
    expect(byId.travelpayouts).not.toHaveProperty('lastError');
    expect(byId.travelpayouts.notice).toMatch(/48 ur/);
  });
});
