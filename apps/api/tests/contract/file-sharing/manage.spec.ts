import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import { SharedFileModel } from '../../../src/modules/file-sharing/models/shared-file.model.js';
import { FileShareGrantModel } from '../../../src/modules/file-sharing/models/file-share-grant.model.js';
import { statBlob } from '../../../src/modules/file-sharing/services/blob-storage.service.js';
import { loginAndUnlock, unlock, uploadFile } from './_helpers.js';

// US3 (P2): lastnik vidi in upravlja, kar je delil.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv();
  await clearTestDb();
});

describe('GET /files', () => {
  it('vrne seznam z izpeljanim stanjem in kvoto', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await uploadFile(app, token, { fileName: 'ena.bin' });
    await uploadFile(app, token, { fileName: 'dve.bin' });

    const res = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.files).toHaveLength(2);
    // Najnovejša zgoraj.
    expect(res.body.files[0].displayName).toBe('dve.bin');
    expect(res.body.files[0]).toMatchObject({ state: 'ready', expired: false, downloadCount: 0 });
    expect(res.body.quota.limitBytes).toBeGreaterThan(0);
  });

  it('podrobnosti vsebujejo števec poskusov in zaklep (FR-033)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const res = await request(app)
      .get(`/api/v1/files/${share.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('failedAttempts', 0);
    expect(res.body).toHaveProperty('lockedUntil', null);
    expect(res.body.shareUrl).toContain('/d/');
  });
});

describe('Lastništvo (FR-053)', () => {
  it('vsak lastnikov endpoint nad TUJO datoteko vrne 404, ne 403', async () => {
    const { app } = await createApp();
    const lastnik = await loginAndUnlock(app);
    const share = await uploadFile(app, lastnik);

    const drugi = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-drugi',
      email: 'drugi@example.com',
      name: 'Drugi uporabnik',
      roles: ['cleverdash-user'],
    });
    const auth = { Authorization: `Bearer ${drugi.accessToken}` };

    await request(app).get(`/api/v1/files/${share.id}`).set(auth).expect(404);
    await request(app).get(`/api/v1/files/${share.id}/content`).set(auth).expect(404);
    await request(app).post(`/api/v1/files/${share.id}/revoke`).set(auth).expect(404);
    await request(app).post(`/api/v1/files/${share.id}/password`).set(auth).expect(404);
    await request(app).delete(`/api/v1/files/${share.id}`).set(auth).expect(404);

    // Tuja datoteka se tudi ne pojavi na seznamu.
    const list = await request(app).get('/api/v1/files').set(auth).expect(200);
    expect(list.body.files).toHaveLength(0);
  });

  it('neveljaven identifikator je 404, ne 500', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app).get('/api/v1/files/ni-objectid').set('Authorization', `Bearer ${token}`).expect(404);
  });
});

describe('Preklic', () => {
  it('preklic razveljavi tudi ŽE IZDANO dovolilnico (FR-026)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    // Prejemnik je geslo vpisal PRED preklicem in ima veljavno dovolilnico.
    const { cookie } = await unlock(app, share.token, share.password);
    await request(app).get(`/api/v1/share/${share.token}/content`).set('Cookie', cookie).expect(200);

    await request(app).post(`/api/v1/files/${share.id}/revoke`).set('Authorization', `Bearer ${token}`).expect(200);

    // Po preklicu ista dovolilnica ne dela več — sicer bi imel prejemnik še deset minut časa.
    await request(app).get(`/api/v1/share/${share.token}/content`).set('Cookie', cookie).expect(404);
    expect(await FileShareGrantModel.countDocuments({})).toBe(0);
  });

  it('preklicana datoteka ostane lastniku — preklic ni brisanje (FR-042)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await request(app).post(`/api/v1/files/${share.id}/revoke`).set('Authorization', `Bearer ${token}`).expect(200);

    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.files[0].state).toBe('revoked');
    expect(await statBlob((await SharedFileModel.findById(share.id).lean())!.storageId)).not.toBeNull();
  });
});

describe('Novo geslo', () => {
  it('izda NOV žeton in NOVO geslo; stara povezava umre v celoti (FR-015)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const { cookie } = await unlock(app, share.token, share.password);

    const res = await request(app)
      .post(`/api/v1/files/${share.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.password).not.toBe(share.password);
    expect(res.body.shareUrl).not.toBe(share.shareUrl);

    // Stari naslov odgovarja kot neznan — polovica ključa v rokah prejšnjega prejemnika je
    // natanko to, kar nova generacija odpravlja (research.md §12).
    await request(app).get(`/api/v1/share/${share.token}`).expect(404);
    await request(app).get(`/api/v1/share/${share.token}/content`).set('Cookie', cookie).expect(404);

    // Novo geslo na novem naslovu deluje.
    const newToken = res.body.shareUrl.split('/d/')[1];
    const relocked = await unlock(app, newToken, res.body.password);
    expect(relocked.res.status).toBe(200);
  });

  it('novo geslo vrne PREKLICANO datoteko v obtok (revoked → ready)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    await request(app).post(`/api/v1/files/${share.id}/revoke`).set('Authorization', `Bearer ${token}`).expect(200);

    const res = await request(app)
      .post(`/api/v1/files/${share.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.file.state).toBe('ready');
  });

  it('novo geslo ponastavi tudi zaklep zaradi ugibanja', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '2' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await unlock(app, share.token, 'ABCD-EFGH-JKLM-NPQR');
    await unlock(app, share.token, 'ABCD-EFGH-JKLM-NPQR');

    const res = await request(app)
      .post(`/api/v1/files/${share.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.file.failedAttempts).toBe(0);
    expect(res.body.file.lockedUntil).toBeNull();

    delete process.env.FILE_SHARE_ATTEMPT_LIMIT;
    setTestEnv();
  });
});

describe('Brisanje', () => {
  it('odstrani zapis IN vsebino z diska (FR-045)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const storageId = (await SharedFileModel.findById(share.id).lean())!.storageId;
    expect(await statBlob(storageId)).not.toBeNull();

    await request(app).delete(`/api/v1/files/${share.id}`).set('Authorization', `Bearer ${token}`).expect(204);

    expect(await statBlob(storageId)).toBeNull();
    expect(await SharedFileModel.countDocuments({})).toBe(0);
    expect(await FileShareGrantModel.countDocuments({})).toBe(0);
    await request(app).get(`/api/v1/share/${share.token}`).expect(404);
  });
});
