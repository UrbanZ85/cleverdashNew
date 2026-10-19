import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, registerMockType, seedApiKey } from './_helpers.js';

// US3/US4 (FR-003, FR-041): referenčni seznam tipov — kaj je vklopljeno in kaj je klicatelju na voljo.

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
  registerMockType('mockoff', 'single', { enabled: false });
  registerMockType('mockscoped', 'single', { scopes: { read: 'notes:read', write: 'notes:write' } });
}

describe('GET /scanners/types', () => {
  it('vrne registrirane tipe z enabled/available, lastnostmi in prednastavitvami urnika', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/scanners/types').set(AUTH(ana.token));
    expect(res.status).toBe(200);
    const byType = Object.fromEntries((res.body.types as Array<{ type: string }>).map((t) => [t.type, t]));
    expect(byType['flights']).toMatchObject({ label: 'Leti', execution: 'batch', enabled: true, available: true, ownsDefinitions: true, createRoute: '/flight-deals/searches/new' });
    expect(byType['mocks']).toMatchObject({ execution: 'single', enabled: true, available: true, ownsDefinitions: false, customResults: false, createRoute: null });
    expect(byType['mockoff']).toMatchObject({ enabled: false, available: true });
    // Obsegi tipa: navaden uporabnik ima `notes:read`, zato je tip na voljo.
    expect(byType['mockscoped']).toMatchObject({ available: true });
    expect(res.body.presets.map((p: { id: string }) => p.id)).toEqual(['hourly', 'daily-06', 'daily-06-18', 'every-6h', 'monday-08']);
    expect(res.body.presets.every((p: { label: string; cronExpression: string }) => p.label.length > 0 && p.cronExpression.split(' ').length === 5)).toBe(true);
  });

  it('API ključ brez obsega tipa vidi tip kot nedostopen; admin vidi vse; brez poverilnic 401', async () => {
    await boot();
    const key = await seedApiKey(['scanners:read']);
    const res = await request(app).get('/api/v1/scanners/types').set('X-API-Key', key);
    expect(res.status).toBe(200);
    const byType = Object.fromEntries((res.body.types as Array<{ type: string }>).map((t) => [t.type, t]));
    expect(byType['flights']).toMatchObject({ available: false });
    expect(byType['mockscoped']).toMatchObject({ available: false });
    expect(byType['mocks']).toMatchObject({ available: true });
    expect([401, 403]).toContain((await request(app).get('/api/v1/scanners/types')).status);
  });
});

// 017 (FR-002): ali ima namestitev ključ za analizo — samo da/ne, ključ sam nikoli ne pride v odgovor.
describe('GET /scanners/types — ai.available (017)', () => {
  it('brez ključa false, s ključem true; ključ ni v odgovoru', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    expect((await request(app).get('/api/v1/scanners/types').set(AUTH(ana.token))).body.ai).toEqual({ available: false });
    setTestEnv({ OPENAI_API_KEY: 'sk-test-secret-123' });
    const res = await request(app).get('/api/v1/scanners/types').set(AUTH(ana.token));
    expect(res.body.ai).toEqual({ available: true });
    expect(JSON.stringify(res.body)).not.toContain('sk-test-secret');
    setTestEnv({ OPENAI_API_KEY: '' });
  });
});
