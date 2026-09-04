import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { SharedFileModel } from '../../../src/modules/file-sharing/models/shared-file.model.js';
import { loginAndUnlock, uploadFile } from './_helpers.js';

// Pogodbeni testi nalaganja (009, US1) proti specs/009-file-sharing/contracts/openapi.yaml.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  delete process.env.FILE_SHARE_MAX_MB;
  delete process.env.FILE_SHARE_QUOTA_MB;
  setTestEnv();
  await clearTestDb();
});

describe('POST /files (napoved) + PUT /files/{id}/content (vsebina)', () => {
  it('dvostopenjsko nalaganje vrne povezavo in geslo — geslo natanko enkrat', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const created = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'porocilo.pdf', byteSize: 11 })
      .expect(201);

    expect(created.body).toMatchObject({ uploadUrl: expect.stringContaining('/content'), maxBytes: 500 * 1024 * 1024 });
    // Odgovor prvega koraka NE vsebuje povezave in gesla — datoteka še ni prispela.
    expect(created.body.shareUrl).toBeUndefined();
    expect(created.body.password).toBeUndefined();

    const uploaded = await request(app)
      .put(`/api/v1/files/${created.body.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('enajst zna'))
      .expect(201);

    expect(uploaded.body.password).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(uploaded.body.shareUrl).toMatch(/^http:\/\/localhost:3000\/d\/[A-Za-z0-9_-]{22}$/);
    expect(uploaded.body.file).toMatchObject({ state: 'ready', displayName: 'porocilo.pdf', expired: false });
  });

  it('geslo se nikoli več ne pojavi v nobenem odgovoru', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const detail = await request(app)
      .get(`/api/v1/files/${share.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(JSON.stringify(detail.body)).not.toContain(share.password.replace(/-/g, ''));
    expect(detail.body.password).toBeUndefined();

    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(share.password.replace(/-/g, ''));
  });

  it('v bazi je samo scrypt povzetek, nikoli čistopis', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const doc = await SharedFileModel.findById(share.id).lean<{ passwordHash: string } | null>();
    expect(doc!.passwordHash.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(doc!.passwordHash).not.toContain(share.password.replace(/-/g, ''));
  });

  it('ime datoteke se očisti — pot ne preživi', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token, { fileName: '../../etc/passwd' });

    const detail = await request(app)
      .get(`/api/v1/files/${share.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.displayName).toBe('passwd');
  });

  it('zapis v stanju uploading ni na seznamu', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'nedokoncana.bin', byteSize: 100 })
      .expect(201);

    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.files).toHaveLength(0);
  });

  it('ponovno nalaganje v isti zapis je 409', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await request(app)
      .put(`/api/v1/files/${share.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('drugic'))
      .expect(409);
  });

  it('brez žetona je vsak lastnikov endpoint 401', async () => {
    const { app } = await createApp();
    await request(app).get('/api/v1/files').expect(401);
    await request(app).post('/api/v1/files').send({ fileName: 'a', byteSize: 1 }).expect(401);
  });
});

describe('Meje in kvota', () => {
  it('napovedana velikost nad mejo je 413, še preden priteče bajt', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'ogromna.bin', byteSize: 600 * 1024 * 1024 })
      .expect(413);
  });

  it('prazna datoteka je 400 (FR-008)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    // Že napoved velikosti 0 je neveljavna po shemi.
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'prazna.bin', byteSize: 0 })
      .expect(400);
  });

  it('napoved pod mejo, telo čez mejo: prenos ne uspe in na disku ne ostane nič', async () => {
    // FR-003, drugo preverjanje meje. Napovedana velikost je odjemalčeva OBLJUBA, ne dejstvo.
    //
    // Odjemalec, ki bi `Content-Length` DEJANSKO zlagal (napove 1 KB, pošlje 2 MB), z Nodejevim
    // HTTP odjemalcem ni izvedljiv — ta pošlje natanko toliko, kolikor je napovedal. Zato ta
    // test preverja ISTO MEJO z resnično glavo, domenski varovali pa sta pokriti v
    // tests/unit/size-guard.spec.ts ("ustavi na kosu, ki mejo prestopi").
    //
    // Bistvo tu je INVARIANTA, ne statusna koda: kakor koli se prenos konča, za sabo ne sme
    // pustiti niti zapisa niti vsebine (FR-006, SC-008).
    setTestEnv({ FILE_SHARE_MAX_MB: '1' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const created = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'lazna.bin', byteSize: 1024 })
      .expect(201);

    const res = await request(app)
      .put(`/api/v1/files/${created.body.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(2 * 1024 * 1024, 7))
      // Strežnik odgovori 413, še preden telo prebere; Node ob nepobranem telesu povezavo
      // poruši, zato odjemalec lahko vidi bodisi odgovor bodisi prekinjeno povezavo. Oboje je
      // sprejemljivo — nesprejemljivo bi bilo, da prenos USPE.
      .catch((err: unknown) => ({ status: 0, error: err }) as { status: number });
    expect(res.status).not.toBe(201);

    // Zapis ostane `uploading` in ga pobere pometač; na seznamu ga ni in vsebine ni.
    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.files).toHaveLength(0);
    expect(await SharedFileModel.countDocuments({ state: 'ready' })).toBe(0);
  });

  it('presežena kvota je 507 s podatkom, koliko prostora je na voljo', async () => {
    setTestEnv({ FILE_SHARE_QUOTA_MB: '1' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    await uploadFile(app, token, { content: Buffer.alloc(700 * 1024, 1) });

    const res = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'se-ena.bin', byteSize: 700 * 1024 })
      .expect(507);
    expect(res.body.detail).toMatch(/Na voljo je še \d+ MB/);
  });

  it('kvota je vidna na seznamu', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await uploadFile(app, token, { content: Buffer.alloc(1000, 3) });

    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.quota).toEqual({ usedBytes: 1000, limitBytes: 5000 * 1024 * 1024 });
  });
});
