import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, unlock, uploadFile } from './_helpers.js';

// Pogodbeni testi JAVNE poti (009, US1/US2) — prejemnik nima računa in ga ne bo dobil.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv();
  await clearTestDb();
});

describe('GET /share/{token} — kaj sme izvedeti nekdo, ki ima samo naslov', () => {
  it('vrne velikost in rok BREZ prijave', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    // Brez glave Authorization — prejemnik je zunanji človek.
    const res = await request(app).get(`/api/v1/share/${share.token}`).expect(200);
    expect(res.body.byteSize).toBe(share.byteSize);
    expect(res.body.expiresAt).toBeTruthy();
  });

  it('IMENA DATOTEKE ne izda — to je podatek, ki ga varuje geslo (FR-022)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token, { fileName: 'pogodba-najem-2026.pdf' });

    const res = await request(app).get(`/api/v1/share/${share.token}`).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('pogodba');
    expect(res.body.fileName).toBeUndefined();
    expect(res.body.displayName).toBeUndefined();
  });

  it('neznana povezava vrne 404 z ISTIM besedilom kot preklicana (FR-023)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const unknown = await request(app).get('/api/v1/share/aaaaaaaaaaaaaaaaaaaaaa').expect(404);

    await request(app).post(`/api/v1/files/${share.id}/revoke`).set('Authorization', `Bearer ${token}`).expect(200);
    const revoked = await request(app).get(`/api/v1/share/${share.token}`).expect(404);

    // Kdor ima naslov, ne sme izvedeti, KATERA od možnosti drži.
    expect(revoked.body.detail).toBe(unknown.body.detail);
    expect(revoked.body.title).toBe(unknown.body.title);
  });

  it('žeton napačne oblike vrne isti 404, ne 400 — oblika ni namig', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/share/prekratek').expect(404);
    expect(res.body.detail).toContain('Ta povezava ne velja');
  });

  it('odgovor se ne sme predpomniti', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const res = await request(app).get(`/api/v1/share/${share.token}`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('POST /share/{token}/unlock', () => {
  it('pravilno geslo vrne ime datoteke in postavi piškotek z dovolilnico', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token, { fileName: 'porocilo.pdf' });

    const { res, cookie } = await unlock(app, share.token, share.password);
    expect(res.status).toBe(200);
    expect(res.body.fileName).toBe('porocilo.pdf');
    expect(res.body.downloadUrl).toBe(`/api/v1/share/${share.token}/content`);
    expect(res.body.grantExpiresAt).toBeTruthy();

    expect(cookie).toContain('cd_share=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    // `Path` je vezan na žeton: dovolilnica ene datoteke se sploh ne pošlje pri zahtevi za
    // drugo (FR-016, research.md §8).
    expect(cookie).toContain(`Path=/api/v1/share/${share.token}`);
  });

  it('geslo z vezaji iz prikaza deluje enako kot brez njih', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const { res } = await unlock(app, share.token, share.password.replace(/-/g, '').toLowerCase());
    expect(res.status).toBe(200);
  });
});

describe('GET /share/{token}/content', () => {
  it('z dovolilnico prenese celo vsebino in šteje prevzem', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const content = Buffer.from('to je vsebina, ki mora priti cela');
    const share = await uploadFile(app, token, { content, fileName: 'datoteka.bin' });

    const { cookie } = await unlock(app, share.token, share.password);
    const res = await request(app)
      .get(`/api/v1/share/${share.token}/content`)
      .set('Cookie', cookie)
      .expect(200);

    expect(Buffer.from(res.body).equals(content)).toBe(true);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('datoteka.bin');
    expect(res.headers['accept-ranges']).toBe('bytes');
    // Deljena datoteka ne sme v predpomnilnik posrednika. `send` postavi svoj `Cache-Control`
    // samo, kadar ga še ni — ta trditev je varovalka pod tem, da naš `no-store` preživi.
    expect(res.headers['cache-control']).toBe('no-store');

    const detail = await request(app)
      .get(`/api/v1/files/${share.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.downloadCount).toBe(1);
    expect(detail.body.lastDownloadedAt).toBeTruthy();
  });

  it('BREZ dovolilnice ni vsebine, tudi če je naslov pravilen (FR-021)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await request(app).get(`/api/v1/share/${share.token}/content`).expect(401);
  });

  it('podpira Range — prekinjen prenos je mogoče nadaljevati (FR-025)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const content = Buffer.from('0123456789abcdef');
    const share = await uploadFile(app, token, { content });

    const { cookie } = await unlock(app, share.token, share.password);
    const res = await request(app)
      .get(`/api/v1/share/${share.token}/content`)
      .set('Cookie', cookie)
      .set('Range', 'bytes=4-7')
      .expect(206);

    expect(Buffer.from(res.body).toString()).toBe('4567');
  });

  it('lastnikov lastni prenos NE šteje med prevzeme (FR-027, FR-028)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await request(app)
      .get(`/api/v1/files/${share.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const detail = await request(app)
      .get(`/api/v1/files/${share.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.downloadCount).toBe(0);
  });

  it('veljaven žeton seje na javni poti ničesar ne spremeni (FR-024)', async () => {
    // Če lastnik odpre svojo povezavo prijavljen v istem brskalniku, se prevzem obnaša ENAKO
    // kot za tujca — geslo je še vedno potrebno, in prisotnost žetona ga ne nadomesti.
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await request(app)
      .get(`/api/v1/share/${share.token}/content`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    const { res } = await unlock(app, share.token, share.password);
    expect(res.status).toBe(200);
  });
});
