import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAsAdmin, loginAsUser, seedAdminApiKey } from './_helpers.js';

// US2, US3 — FR-021 do FR-039.
//
// Prijave se štejejo skozi PRAVI tok prijave (modules/auth/router.ts → platform/usage). Nobenega
// testa tu ni, ki bi števec pripravil z ročnim vpisom v zbirko: to bi preverjalo agregacijo in ne
// tega, da se prijava sploh prešteje.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
async function boot(): Promise<Express> {
  app = (await createApp()).app;
  return app;
}

describe('GET /analytics/usage — prijave', () => {
  it('prešteje vsako prijavo, tudi ponovljeno z istim računom', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    await loginAsUser(app, 'ana');
    await loginAsUser(app, 'ana'); // ista oseba, druga prijava

    const res = await request(app).get('/api/v1/analytics/usage?days=7').set(AUTH(admin.token));

    expect(res.status).toBe(200);
    const ana = res.body.byUser.find((u: { displayName: string }) => u.displayName === 'Uporabnik ANA');
    expect(ana.logins).toBe(2);
    // Administratorjeva lastna prijava se prav tako šteje.
    expect(res.body.logins.total).toBe(3);
  });

  it('pove čas zadnje prijave in zadnje aktivnosti (FR-033)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/usage').set(AUTH(admin.token));
    const row = res.body.byUser.find((u: { userId: string }) => u.userId === admin.userId);
    expect(row.lastLoginAt).toBeTruthy();
    expect(row.lastActiveAt).toBeTruthy();
  });

  it('šteje aktivne in neaktivne osebe (FR-034)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    await loginAsUser(app, 'ana');
    const res = await request(app).get('/api/v1/analytics/usage').set(AUTH(admin.token));
    expect(res.body.logins.activeUsers).toBe(2);
    expect(res.body.logins.inactiveUsers).toBe(0);
  });

  it('e-pošta je zamaskirana tudi tu (FR-009)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    await loginAsUser(app, 'ana');
    const res = await request(app).get('/api/v1/analytics/usage').set(AUTH(admin.token));
    expect(JSON.stringify(res.body)).not.toContain('ana@agenda.si');
  });

  it('obdobje je izbirno in se odrazi v odgovoru (FR-037)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    for (const days of [7, 30, 90]) {
      const res = await request(app).get(`/api/v1/analytics/usage?days=${days}`).set(AUTH(admin.token));
      expect(res.status, String(days)).toBe(200);
      expect(res.body.window.days).toBe(days);
    }
  });

  it('nedovoljeno obdobje je 400, ne tiho zaokroženo', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/usage?days=365').set(AUTH(admin.token));
    expect(res.status).toBe(400);
  });

  it('privzeto obdobje je 30 dni', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/usage').set(AUTH(admin.token));
    expect(res.body.window.days).toBe(30);
  });

  it('pove, od kdaj meritve obstajajo, in ali obdobje sega pred to (FR-038)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/usage?days=90').set(AUTH(admin.token));
    // Meritve so se začele danes, obdobje pa sega 90 dni nazaj — to MORA biti povedano, sicer je
    // prazno obdobje neločljivo od "nihče se ni prijavljal".
    expect(res.body.coverage.dataSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.coverage.truncated).toBe(true);
    expect(res.body.coverage.retentionDays).toBe(400);
  });
});

describe('GET /analytics/usage — lestvica zavihkov', () => {
  it('vsebuje VSE zavihke iz registra, tudi z nič ogledi (FR-035, FR-039)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/usage').set(AUTH(admin.token));

    const ids = res.body.tabs.map((t: { tabId: string }) => t.tabId);
    expect(ids).toContain('dashboard');
    expect(ids).toContain('analytics');
    expect(res.body.tabs.every((t: { views: number }) => t.views === 0)).toBe(true);
    // Naslovi so slovenski (člen X) in prihajajo iz registra, ne iz oznake.
    expect(res.body.tabs.find((t: { tabId: string }) => t.tabId === 'notes').title).toBe('Beležke');
  });

  it('zabeležen ogled se pojavi na lestvici in v razbitju po osebi (FR-036)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    await request(app).post('/api/v1/usage/views').set(AUTH(ana.token)).send({ tabId: 'notes' });

    const res = await request(app).get('/api/v1/analytics/usage').set(AUTH(admin.token));
    const notes = res.body.tabs.find((t: { tabId: string }) => t.tabId === 'notes');
    expect(notes.views).toBe(1);
    expect(notes.users).toBe(1);
    expect(res.body.byUser.find((u: { userId: string }) => u.userId === ana.userId).tabs.notes).toBe(1);
  });
});

describe('POST /usage/views', () => {
  it('prvi ogled šteje, ponovitev v oknu pa ne — in to ni napaka (FR-027)', async () => {
    const app = await boot();
    const ana = await loginAsUser(app, 'ana');

    const first = await request(app).post('/api/v1/usage/views').set(AUTH(ana.token)).send({ tabId: 'notes' });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ counted: true });

    for (let i = 0; i < 4; i++) {
      const again = await request(app).post('/api/v1/usage/views').set(AUTH(ana.token)).send({ tabId: 'notes' });
      expect(again.status).toBe(200);
      expect(again.body).toEqual({ counted: false });
    }
  });

  it('različna zavihka štejeta oba', async () => {
    const app = await boot();
    const ana = await loginAsUser(app, 'ana');
    const a = await request(app).post('/api/v1/usage/views').set(AUTH(ana.token)).send({ tabId: 'notes' });
    const b = await request(app).post('/api/v1/usage/views').set(AUTH(ana.token)).send({ tabId: 'cameras' });
    expect([a.body.counted, b.body.counted]).toEqual([true, true]);
  });

  it('neznana oznaka zavihka je 400 (FR-031)', async () => {
    const app = await boot();
    const ana = await loginAsUser(app, 'ana');
    const res = await request(app).post('/api/v1/usage/views').set(AUTH(ana.token)).send({ tabId: 'karkoli' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('karkoli');
  });

  it('prazno telo je 400', async () => {
    const app = await boot();
    const ana = await loginAsUser(app, 'ana');
    const res = await request(app).post('/api/v1/usage/views').set(AUTH(ana.token)).send({});
    expect(res.status).toBe(400);
  });

  it('API ključ ogleda ne more zabeležiti', async () => {
    // Avtomatizacija ne "gleda zaslonov"; vsak zabeležen ogled mora pripadati človeku.
    const app = await boot();
    const secret = await seedAdminApiKey();
    const res = await request(app).post('/api/v1/usage/views').set('X-API-Key', secret).send({ tabId: 'notes' });
    expect(res.status).toBe(403);
  });

  it('brez poverilnic ni mogoče zabeležiti ničesar', async () => {
    const app = await boot();
    const res = await request(app).post('/api/v1/usage/views').send({ tabId: 'notes' });
    expect([401, 403]).toContain(res.status);
  });

  it('sprejme `Idempotency-Key` (člen III, FR-043)', async () => {
    const app = await boot();
    const ana = await loginAsUser(app, 'ana');
    const res = await request(app)
      .post('/api/v1/usage/views')
      .set(AUTH(ana.token))
      .set('Idempotency-Key', 'kljuc-1')
      .send({ tabId: 'notes' });
    expect(res.status).toBe(200);
  });
});
