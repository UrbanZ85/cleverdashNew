import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { resetSnapshotCacheForTests } from '../../../src/modules/analytics/services/snapshot-cache.service.js';
import { AUTH, loginAsAdmin, loginAsUser, seedAdminApiKey } from './_helpers.js';

// US1.6 in US5.3 — FR-001 do FR-004, SC-004.
//
// To je najpomembnejši test te funkcionalnosti. Vsi ostali moduli vrnejo klicatelju SVOJE podatke;
// ta vrne sliko cele namestitve, zato je napačno odprta pot tu drugačna vrsta napake kot drugje.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  resetSnapshotCacheForTests();
  await clearTestDb();
});

let app: Express;
async function boot(): Promise<Express> {
  app = (await createApp()).app;
  return app;
}

const PATHS = ['/api/v1/analytics/storage', '/api/v1/analytics/usage'];

describe('dostop do analitike', () => {
  it('administrator pride skozi na vseh poteh', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    for (const path of PATHS) {
      const res = await request(app).get(path).set(AUTH(admin.token));
      expect(res.status, path).toBe(200);
    }
  });

  it('navaden uporabnik dobi 403 na vseh poteh (FR-002)', async () => {
    const app = await boot();
    const user = await loginAsUser(app, 'navadna');
    for (const path of PATHS) {
      const res = await request(app).get(path).set(AUTH(user.token));
      expect(res.status, path).toBe(403);
    }
  });

  it('API ključ z obsegom `admin` dobi 403 (FR-003)', async () => {
    // Ključ je sejan neposredno v bazo, ker ga prek API-ja ni mogoče ustvariti. Brez tega bi test
    // dokazoval samo, da `platform/apikeys` obsega ne dodeli — ne pa, da ima ta modul svojo zaporo.
    const app = await boot();
    const secret = await seedAdminApiKey();
    for (const path of PATHS) {
      const res = await request(app).get(path).set('X-API-Key', secret);
      expect(res.status, path).toBe(403);
    }
  });

  it('brez poverilnic je zahteva zavrnjena', async () => {
    const app = await boot();
    for (const path of PATHS) {
      const res = await request(app).get(path);
      expect([401, 403], path).toContain(res.status);
    }
  });

  it('zavrnitev je problem+json in ne golo besedilo', async () => {
    const app = await boot();
    const user = await loginAsUser(app, 'navadna');
    const res = await request(app).get(PATHS[0]!).set(AUTH(user.token));
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 403 });
  });
});

describe('vidnost zavihka v meniju (FR-001, SC-004)', () => {
  it('administrator zavihek `analytics` v /tabs IMA', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/tabs').set(AUTH(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.map((t: { id: string }) => t.id)).toContain('analytics');
  });

  it('navaden uporabnik zavihka `analytics` v /tabs NIMA — ni izklopljen, ni ga', async () => {
    // Zavrnjena pot, ki je v meniju, je slaba izkušnja, ne varnost. Zato oboje: vratar in register.
    const app = await boot();
    const user = await loginAsUser(app, 'navadna');
    const res = await request(app).get('/api/v1/tabs').set(AUTH(user.token));
    expect(res.status).toBe(200);
    expect(res.body.map((t: { id: string }) => t.id)).not.toContain('analytics');
  });
});
