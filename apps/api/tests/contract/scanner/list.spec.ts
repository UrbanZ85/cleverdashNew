import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { findRuleForTests } from '../../../src/modules/flight-deals/router.js';
import { seedMatch, seedOffer, seedRule } from '../flight-deals/_helpers.js';
import { AUTH, loginAs, registerMockType, seedApiKey, seedDefinition } from './_helpers.js';

// US3 (FR-008, FR-011, FR-040): seznam skenerjev vseh tipov — generične definicije IN iskanja letov
// v isti obliki; tuje vrstice nevidne; tip brez registracije označen.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
async function boot() {
  app = (await createApp()).app;
  registerMockType('mocks', 'single');
}

describe('GET /scanners', () => {
  it('združi iskanja letov (urnik tipa, število ponudb, povezave Leti) in generične definicije (lasten urnik), razvrščeno po updatedAt', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId, { name: 'Vikend v Londonu' });
    const offer = await seedOffer();
    await seedMatch({ _id: rule._id, userId: rule.userId }, { _id: offer._id, expiresAt: offer.expiresAt });
    await new Promise((r) => setTimeout(r, 5));
    const def = await seedDefinition(ana.userId, 'mocks', { name: 'Moj mock' });

    const res = await request(app).get('/api/v1/scanners').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body.limits).toEqual({ maxPerUser: 20 });
    const rows = res.body.scanners as Array<Record<string, unknown>>;
    expect(rows.map((r) => r['name'])).toEqual(['Moj mock', 'Vikend v Londonu']);

    const flight = rows[1]!;
    expect(flight).toMatchObject({
      id: String(rule._id),
      type: 'flights',
      typeLabel: 'Leti',
      enabled: true,
      typeAvailable: true,
      resultCount: 1,
      lastRun: null,
      links: { edit: `/flight-deals/searches/${String(rule._id)}`, results: `/flight-deals?search=${String(rule._id)}` },
    });
    expect(flight['schedule']).toMatchObject({ mode: 'type', cronExpression: '0 6,18 * * *', label: 'po urniku tipa (vsak dan ob 6:00 in 18:00)' });
    expect((flight['schedule'] as { nextRunAt: string }).nextRunAt).toMatch(/T(04|05|16|17):00:00\.000Z$/);

    const generic = rows[0]!;
    expect(generic).toMatchObject({
      id: String(def._id),
      type: 'mocks',
      typeLabel: 'Tip mocks',
      typeAvailable: true,
      resultCount: 0,
      links: { edit: `/scanners/${String(def._id)}/edit`, results: `/scanners/${String(def._id)}` },
    });
    expect(generic['schedule']).toMatchObject({ mode: 'own', preset: 'hourly', label: 'vsako uro' });
    expect((generic['schedule'] as { nextRunAt: string }).nextRunAt).toMatch(/:00:00\.000Z$/);

    // Filter po tipu.
    const onlyFlights = await request(app).get('/api/v1/scanners?type=flights').set(AUTH(ana.token));
    expect(onlyFlights.body.scanners.map((r: { type: string }) => r.type)).toEqual(['flights']);
    expect((await findRuleForTests(String(rule._id)))?.name).toBe('Vikend v Londonu');
  });

  it('tuje vrstice niso vidne; izklopljeno iskanje nima naslednjega termina; neregistriran tip ima typeAvailable false in brez termina', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    await seedRule(bor.userId, { name: 'Borovo' });
    await seedDefinition(bor.userId, 'mocks', { name: 'Borov mock' });
    await seedRule(ana.userId, { name: 'Anino', active: false });
    await seedDefinition(ana.userId, 'izginuli', { name: 'Sirota' });

    const res = await request(app).get('/api/v1/scanners').set(AUTH(ana.token));
    const rows = res.body.scanners as Array<Record<string, unknown>>;
    expect(rows.map((r) => r['name']).sort()).toEqual(['Anino', 'Sirota']);
    const anino = rows.find((r) => r['name'] === 'Anino')!;
    expect(anino).toMatchObject({ enabled: false });
    expect((anino['schedule'] as { nextRunAt: string | null }).nextRunAt).toBeNull();
    const sirota = rows.find((r) => r['name'] === 'Sirota')!;
    expect(sirota).toMatchObject({ typeAvailable: false, typeLabel: 'izginuli' });
    expect((sirota['schedule'] as { nextRunAt: string | null }).nextRunAt).toBeNull();
  });

  it('API ključ brez scanners:read dobi 403; ključ s scanners:read brez flight-deals:read ne vidi iskanj letov', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    await seedRule(ana.userId);
    await seedDefinition(ana.userId, 'mocks');
    expect((await request(app).get('/api/v1/scanners').set('X-API-Key', await seedApiKey(['notes:read']))).status).toBe(403);
    const res = await request(app).get('/api/v1/scanners').set('X-API-Key', await seedApiKey(['scanners:read'], ana.userId, 'seed-sc-read'));
    expect(res.status).toBe(200);
    expect(res.body.scanners.map((r: { type: string }) => r.type)).toEqual(['mocks']);
  });
});
