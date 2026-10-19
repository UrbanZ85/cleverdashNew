import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginAsAdmin, seedApiKey } from './_helpers.js';

// FR-045, FR-055, SC-005: kdo pride kam. Administracija je zaprta vsem razen prijavljenemu adminu
// — tudi API ključu z obsegom `admin`, ker je zapora LASTNA (platform/auth/admin-guard.ts).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function boot(): Promise<Express> {
  return (await createApp()).app;
}

// 016: administracija je v jedru skenerjev; stanje virov letov je dodatek tipa v `/scanners/admin/types`.
const ADMIN_PATHS = ['/api/v1/scanners/admin/types', '/api/v1/scanners/admin/types/flights/schedule', '/api/v1/scanners/admin/runs', '/api/v1/scanners/admin/notifications'];

describe('dostop do modula Leti', () => {
  it('navaden uporabnik ima zavihek v GET /tabs in bere svoja iskanja', async () => {
    const app = await boot();
    const user = await loginAs(app, 'ana');
    const tabs = await request(app).get('/api/v1/tabs').set(AUTH(user.token));
    expect(tabs.status).toBe(200);
    const tab = (tabs.body as Array<{ id: string; title: string; route: string }>).find((t) => t.id === 'flight-deals');
    expect(tab).toMatchObject({ title: 'Leti', route: '/flight-deals' });

    const res = await request(app).get('/api/v1/flight-deals/searches').set(AUTH(user.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ searches: [], limits: expect.objectContaining({ maxSearchesPerUser: 20 }) });
  });

  it('brez poverilnic je zavrnjeno', async () => {
    const app = await boot();
    const res = await request(app).get('/api/v1/flight-deals/searches');
    expect([401, 403]).toContain(res.status);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('API ključ brez obsega modula dobi 403', async () => {
    const app = await boot();
    const secret = await seedApiKey(['notes:read']);
    const res = await request(app).get('/api/v1/flight-deals/searches').set('X-API-Key', secret);
    expect(res.status).toBe(403);
  });

  it('navaden uporabnik na administraciji dobi 403 na vseh poteh (FR-045)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'ana');
    for (const path of ADMIN_PATHS) {
      const res = await request(app).get(path).set(AUTH(user.token));
      expect(res.status, path).toBe(403);
    }
  });

  it('API ključ z obsegom admin na administraciji dobi 403 — zapora je lastna', async () => {
    const app = await boot();
    const secret = await seedApiKey(['admin'], null, 'seed-fd-admin');
    for (const path of ADMIN_PATHS) {
      const res = await request(app).get(path).set('X-API-Key', secret);
      expect(res.status, path).toBe(403);
    }
  });

  it('administrator pride skozi na vseh administratorskih poteh', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    for (const path of ADMIN_PATHS) {
      const res = await request(app).get(path).set(AUTH(admin.token));
      expect(res.status, path).toBe(200);
    }
  });

  it('referenčne poti so odprte vsakemu prijavljenemu klicatelju brez modularnega obsega', async () => {
    const app = await boot();
    const secret = await seedApiKey(['notes:read'], null, 'seed-fd-ref');
    for (const path of ['/api/v1/flight-deals/airports?q=trst', '/api/v1/flight-deals/countries', '/api/v1/flight-deals/providers']) {
      const res = await request(app).get(path).set('X-API-Key', secret);
      expect(res.status, path).toBe(200);
    }
  });
});
