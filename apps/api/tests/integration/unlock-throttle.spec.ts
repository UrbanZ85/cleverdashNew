import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { SharedFileModel } from '../../src/modules/file-sharing/models/shared-file.model.js';
import { FileShareAttemptModel } from '../../src/modules/file-sharing/models/file-share-attempt.model.js';
import { loginAndUnlock, unlock, uploadFile } from '../contract/file-sharing/_helpers.js';

// FR-030/FR-031, research.md §9: dušenje ugibanja gesla.
//
// To je edini mehanizem te vrste v celotnem zaledju — `login-throttle.service.ts` je bil v 004
// izbrisan, ko je dušenje prijav prevzel Keycloak. Brez teh testov bi bila javna pot z geslom
// odprta avtomatu.

const WRONG = 'ABCD-EFGH-JKLM-NPQR';

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  delete process.env.FILE_SHARE_ATTEMPT_LIMIT;
  delete process.env.FILE_SHARE_LOCK_MINUTES;
  delete process.env.FILE_SHARE_ATTEMPT_WINDOW_MINUTES;
  setTestEnv();
  await clearTestDb();
});

describe('Dušenje po POVEZAVI', () => {
  it('po preseženi meji je zavrnjeno tudi PRAVILNO geslo', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '3' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    // Tretji zgrešen poskus še gre skozi (obdela se), četrti je zavrnjen.
    for (let i = 0; i < 2; i++) {
      const { res } = await unlock(app, share.token, WRONG);
      expect(res.status).toBe(401);
    }
    const tretji = await unlock(app, share.token, WRONG);
    expect(tretji.res.status).toBe(429);

    // In zdaj tisto, kar je bistvo: pravilno geslo NE pomaga, dokler traja zaklep.
    const { res } = await unlock(app, share.token, share.password);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeTruthy();
  });

  it('sporočilo šteje preostale poskuse navzdol', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '3' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const prvi = await unlock(app, share.token, WRONG);
    expect(prvi.res.body.detail).toContain('Poskusov do zaklepa: 2');
    const drugi = await unlock(app, share.token, WRONG);
    expect(drugi.res.body.detail).toContain('Poskusov do zaklepa: 1');
  });

  it('lastnik VIDI, da nekdo ugiba (FR-033)', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '3' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await unlock(app, share.token, WRONG);
    await unlock(app, share.token, WRONG);

    const detail = await request(app)
      .get(`/api/v1/files/${share.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.failedAttempts).toBe(2);

    await unlock(app, share.token, WRONG);
    const locked = await request(app)
      .get(`/api/v1/files/${share.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(locked.body.lockedUntil).toBeTruthy();
  });

  it('uspešna odklenitev ponastavi števec povezave', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '5' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await unlock(app, share.token, WRONG);
    await unlock(app, share.token, WRONG);
    const ok = await unlock(app, share.token, share.password);
    expect(ok.res.status).toBe(200);

    const detail = await request(app)
      .get(`/api/v1/files/${share.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.failedAttempts).toBe(0);
    const attempt = await FileShareAttemptModel.findOne({ key: `link:${share.id}` }).lean();
    expect(attempt).toBeNull();
  });

  it('uspeh NE ponastavi števca naslova — sicer bi ena svoja povezava prala ugibanje po tujih', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '5' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await unlock(app, share.token, WRONG);
    await unlock(app, share.token, WRONG);
    await unlock(app, share.token, share.password);

    // Števec POVEZAVE je ponastavljen, števec NASLOVA pa ne — zato preostali poskusi štejejo
    // po strožjem od obeh (2 od 5 sta že porabljena na naslovu, tretji je ta).
    const ipAttempt = await FileShareAttemptModel.findOne({ key: /^ip:/ }).lean();
    expect(ipAttempt!.count).toBe(2);

    const next = await unlock(app, share.token, WRONG);
    expect(next.res.body.detail).toContain('Poskusov do zaklepa: 2');
  });
});

describe('Dušenje po IZVORNEM NASLOVU', () => {
  it('ugibanje po MNOGO povezavah z istega naslova se ustavi, čeprav je vsaka pod svojo mejo', async () => {
    // Brez meje po naslovu bi napadalec z eno povezavo na naslov obšel dušenje v celoti
    // (research.md §9).
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '3' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const shares = [
      await uploadFile(app, token, { fileName: 'a.bin' }),
      await uploadFile(app, token, { fileName: 'b.bin' }),
      await uploadFile(app, token, { fileName: 'c.bin' }),
    ];

    // Po eno zgrešitev na vsako povezavo: nobena povezava ni blizu svoje meje …
    const statuses: number[] = [];
    for (const share of shares) {
      const { res } = await unlock(app, share.token, WRONG);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 2)).toEqual([401, 401]);
    // … tretji poskus pa je tretja zgrešitev z ISTEGA naslova.
    expect(statuses[2]).toBe(429);

    // Zaklenjen je naslov, ne le ena povezava: tudi pravilno geslo četrte datoteke ne gre skozi.
    const cetrta = await uploadFile(app, token, { fileName: 'd.bin' });
    const { res } = await unlock(app, cetrta.token, cetrta.password);
    expect(res.status).toBe(429);
  });
});

describe('Kaj se o poskusu shrani in kaj ne (FR-032)', () => {
  it('zgrešen poskus pusti sled o ŠTETJU, nikjer pa poskušenega gesla', async () => {
    // Preverja se TRAJNO stanje, ne izpis na konzolo: izpis je pinova stvar in se lahko
    // preusmeri, shranjeno pa je tisto, kar preživi in kar bi lahko kdaj kdo prebral.
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '5' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const attempted = 'ZZZZ-ZZZZ-ZZZZ-ZZZZ';
    await unlock(app, share.token, attempted);

    const doc = await SharedFileModel.findById(share.id).lean();
    const attempts = await FileShareAttemptModel.find({}).lean();

    // Sled o poskusu obstaja — na povezavi IN na naslovu.
    expect(doc!.failedAttempts).toBe(1);
    expect(attempts.map((a) => a.key).some((k) => k.startsWith('link:'))).toBe(true);
    expect(attempts.map((a) => a.key).some((k) => k.startsWith('ip:'))).toBe(true);

    // Poskušenega gesla ni nikjer — ne v zapisu datoteke, ne v števcu poskusov.
    const dump = JSON.stringify({ doc, attempts });
    expect(dump).not.toContain('ZZZZZZZZZZZZZZZZ');
    expect(dump).not.toContain(attempted);
    // In tudi pravo geslo ne (v zapisu je samo scrypt povzetek).
    expect(dump).not.toContain(share.password.replace(/-/g, ''));
  });

  it('zapis o poskusih preživi zaklep — TTL ga ne sme pobrisati med njim', async () => {
    // Če bi zapis potekel pred koncem zaklepa, bi bil zaklep s tem odpravljen.
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '2', FILE_SHARE_LOCK_MINUTES: '60' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await unlock(app, share.token, WRONG);
    await unlock(app, share.token, WRONG);

    const attempt = await FileShareAttemptModel.findOne({ key: `link:${share.id}` }).lean();
    expect(attempt!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(attempt!.expiresAt.getTime()).toBeGreaterThan(attempt!.lockedUntil!.getTime());
  });
});
