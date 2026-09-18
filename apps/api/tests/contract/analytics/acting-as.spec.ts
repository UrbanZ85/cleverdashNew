import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ACTING_USER_HEADER } from '../../../src/platform/auth/acting-user.js';
import { AUTH, loginAsAdmin, loginAsUser } from './_helpers.js';

// US3.4 — FR-026. NAJBOLJ TIHA NAPAKA TE FUNKCIONALNOSTI in zato lasten test.
//
// `actingUserMiddleware` (012) ZAMENJA `req.auth`, preden zahteva doseže katerikoli modul, in za
// vseh devetdeset mest, ki filtrirajo po `req.auth.subjectId`, je to pravilno. Za telemetrijo je
// narobe: števec pripada FIZIČNI OSEBI za tipkovnico. Če bi administratorjevo brskanje v tujem
// imenu štelo izbrani osebi, bi meritev merila svojega opazovalca — in to brez ene same napake v
// dnevniku.
//
// Napačna izbira (`req.auth` namesto `req.actor`) je tista, ki se napiše po navadi. Ta test je
// edina mreža pod tem.

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

describe('prevzem imena in telemetrija', () => {
  it('ogled med prevzemom imena se zapiše ADMINU, ne izbrani osebi', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    const posted = await request(app)
      .post('/api/v1/usage/views')
      .set(AUTH(admin.token))
      .set(ACTING_USER_HEADER, ana.userId)
      .send({ tabId: 'notes' });
    expect(posted.status).toBe(200);
    expect(posted.body.counted).toBe(true);

    const res = await request(app).get('/api/v1/analytics/usage').set(AUTH(admin.token));
    const adminRow = res.body.byUser.find((u: { userId: string }) => u.userId === admin.userId);
    const anaRow = res.body.byUser.find((u: { userId: string }) => u.userId === ana.userId);

    expect(adminRow.tabs.notes).toBe(1);
    expect(anaRow.tabs.notes).toBe(0);
  });

  it('administrator med prevzemom imena analitiko še vedno bere', async () => {
    // `scopes` ostanejo adminovi (acting-user.ts): dovolilnico nosi človek za tipkovnico, ne
    // podatki, ki jih gleda. Prevzem imena zato dostopa niti ne odpre niti ne zapre.
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    const res = await request(app)
      .get('/api/v1/analytics/storage')
      .set(AUTH(admin.token))
      .set(ACTING_USER_HEADER, ana.userId);
    expect(res.status).toBe(200);
  });

  it('navaden uporabnik s prevzemom imena analitike ne odpre (FR-004)', async () => {
    const app = await boot();
    const ana = await loginAsUser(app, 'ana');
    const bojan = await loginAsUser(app, 'bojan');

    const res = await request(app)
      .get('/api/v1/analytics/storage')
      .set(AUTH(ana.token))
      .set(ACTING_USER_HEADER, bojan.userId);
    // Zavrne že `actingUserMiddleware` sam — prevzem imena je administratorjeva pravica.
    expect(res.status).toBe(403);
  });

  it('pregled porabe kaže podatke CELE namestitve, ne izbrane osebe', async () => {
    // Analitika ne filtrira po `req.auth.subjectId`, zato prevzem imena na to, kaj vrne, nima
    // vpliva — kar je treba dokazati, ker je za vse druge module ravno obratno.
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    const plain = await request(app).get('/api/v1/analytics/storage?fresh=true').set(AUTH(admin.token));
    const acting = await request(app)
      .get('/api/v1/analytics/storage?fresh=true')
      .set(AUTH(admin.token))
      .set(ACTING_USER_HEADER, ana.userId);

    expect(acting.body.byUser.length).toBe(plain.body.byUser.length);
    expect(acting.body.totalBytes).toBe(plain.body.totalBytes);
  });
});
