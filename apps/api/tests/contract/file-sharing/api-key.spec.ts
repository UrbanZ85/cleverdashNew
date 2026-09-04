import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { createApp } from '../../../src/main.js';
import { ApiKeyModel } from '../../../src/platform/apikeys/model.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { SharedFileModel } from '../../../src/modules/file-sharing/models/shared-file.model.js';
import { FileShareGrantModel } from '../../../src/modules/file-sharing/models/file-share-grant.model.js';
import { defaultTestUserId, loginAndUnlock, unlock, uploadFile } from './_helpers.js';

// US6 (P5), člen III: kar se da narediti v UI, se MORA dati narediti tudi s HTTP klicem.
// n8n je prvorazreden odjemalec, ne naknadna misel.

const SECRET = 'file-sharing-test-key';

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv();
  await clearTestDb();
});

async function seedKey(scopes: string[]): Promise<void> {
  // API ključ ni vezan na uporabnika (člen III), zato mora obstajati natanko en uporabnik, v
  // čigar imenu avtomatizacija deluje (platform/auth/automation-owner.ts).
  await defaultTestUserId();
  await ApiKeyModel.create({
    label: 'n8n',
    keyHash: createHash('sha256').update(SECRET).digest('hex'),
    keyPrefix: SECRET.slice(0, 8),
    scopes,
  });
}

describe('Nalaganje z API ključem', () => {
  it('cel tok deluje brez vmesnika in vrne povezavo ter geslo', async () => {
    await seedKey(['file-sharing:read', 'file-sharing:write']);
    const { app } = await createApp();

    const created = await request(app)
      .post('/api/v1/files')
      .set('X-API-Key', SECRET)
      .send({ fileName: 'porocilo.pdf', byteSize: 12, expiresInDays: 7 })
      .expect(201);

    const uploaded = await request(app)
      .put(`/api/v1/files/${created.body.id}/content`)
      .set('X-API-Key', SECRET)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('dvanajst!!!!'))
      .expect(201);

    expect(uploaded.body.shareUrl).toContain('/d/');
    expect(uploaded.body.password).toMatch(/^[A-Z2-9]{4}-/);

    // Datoteka pripada uporabniku, ne ključu — sicer bi bila brez lastnika.
    const doc = await SharedFileModel.findById(created.body.id).lean();
    expect(String(doc!.userId)).toBe(await defaultTestUserId());
  });

  it('brez obsega za pisanje je 403', async () => {
    await seedKey(['file-sharing:read']);
    const { app } = await createApp();
    await request(app)
      .post('/api/v1/files')
      .set('X-API-Key', SECRET)
      .send({ fileName: 'a.bin', byteSize: 10 })
      .expect(403);
  });

  it('API ključ NE obide meje velikosti ne kvote (FR-063)', async () => {
    await seedKey(['file-sharing:read', 'file-sharing:write']);
    setTestEnv({ FILE_SHARE_MAX_MB: '1' });
    const { app } = await createApp();

    await request(app)
      .post('/api/v1/files')
      .set('X-API-Key', SECRET)
      .send({ fileName: 'ogromna.bin', byteSize: 5 * 1024 * 1024 })
      .expect(413);

    delete process.env.FILE_SHARE_MAX_MB;
    setTestEnv();
  });
});

describe('Idempotentnost (člen III)', () => {
  it('ponovljen POST /files z istim ključem ne ustvari drugega zapisa', async () => {
    await seedKey(['file-sharing:read', 'file-sharing:write']);
    const { app } = await createApp();
    const key = randomUUID();
    const body = { fileName: 'porocilo.pdf', byteSize: 12 };

    const prvi = await request(app).post('/api/v1/files').set('X-API-Key', SECRET).set('Idempotency-Key', key).send(body).expect(201);
    const drugi = await request(app).post('/api/v1/files').set('X-API-Key', SECRET).set('Idempotency-Key', key).send(body).expect(201);

    expect(drugi.body.id).toBe(prvi.body.id);
    expect(await SharedFileModel.countDocuments({})).toBe(1);
  });

  it('ponovljen preklic z istim ključem vrne prvotni odgovor', async () => {
    await seedKey(['file-sharing:read', 'file-sharing:write']);
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const key = randomUUID();

    const prvi = await request(app)
      .post(`/api/v1/files/${share.id}/revoke`)
      .set('X-API-Key', SECRET)
      .set('Idempotency-Key', key)
      .expect(200);
    const drugi = await request(app)
      .post(`/api/v1/files/${share.id}/revoke`)
      .set('X-API-Key', SECRET)
      .set('Idempotency-Key', key)
      .expect(200);

    expect(drugi.body.id).toBe(prvi.body.id);
    expect(drugi.body.state).toBe('revoked');
  });
});

describe('Izjema člena III na javni poti (research.md §10)', () => {
  it('Idempotency-Key na /share/{token}/unlock NIMA učinka — dovolilnica ne sme preživeti preklica', async () => {
    // Brez izvzetja bi bil odgovor z dovolilnico shranjen pod uporabnikovim ključem in
    // ponovljen tudi PO preklicu povezave: shranjen odgovor bi preživel preklic, kar je ista
    // okvara, ki jo člen III opisuje za rotacijo žetonov.
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const key = randomUUID();

    const prvi = await request(app)
      .post(`/api/v1/share/${share.token}/unlock`)
      .set('Idempotency-Key', key)
      .send({ password: share.password })
      .expect(200);
    expect(prvi.body.fileName).toBeTruthy();

    await request(app).post(`/api/v1/files/${share.id}/revoke`).set('Authorization', `Bearer ${token}`).expect(200);

    // Ista zahteva z istim ključem po preklicu NE sme vrniti shranjenega odgovora.
    const drugi = await request(app)
      .post(`/api/v1/share/${share.token}/unlock`)
      .set('Idempotency-Key', key)
      .send({ password: share.password })
      .expect(404);
    expect(drugi.body.fileName).toBeUndefined();
  });

  it('javna pot ne piše v zbirko idempotenčnih ključev', async () => {
    // `Idempotency-Key` je zapis v bazo, ki ga sproži zahteva BREZ poverilnic — neomejeno
    // pisanje z javne poti je pot do polnjenja zbirke.
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const { IdempotencyKeyModel } = await import('../../../src/platform/idempotency/model.js');
    const before = await IdempotencyKeyModel.countDocuments({});

    await request(app)
      .post(`/api/v1/share/${share.token}/unlock`)
      .set('Idempotency-Key', randomUUID())
      .send({ password: share.password })
      .expect(200);

    expect(await IdempotencyKeyModel.countDocuments({})).toBe(before);
    // Dovolilnica je bila vseeno izdana — izjema ne pomeni, da endpoint ne dela.
    expect(await FileShareGrantModel.countDocuments({})).toBe(1);
  });

  it('binarno nalaganje glave ne upošteva (isti razlog kot POST /notes/{id}/audio v 007)', async () => {
    // Pri binarnem telesu je primerjava teles nemogoča (`req.body` je prazen), zato bi dve
    // RAZLIČNI datoteki z istim ključem bili videti kot ista zahteva.
    await seedKey(['file-sharing:read', 'file-sharing:write']);
    const { app } = await createApp();
    const key = randomUUID();

    const a = await request(app).post('/api/v1/files').set('X-API-Key', SECRET).send({ fileName: 'a.bin', byteSize: 5 }).expect(201);
    const b = await request(app).post('/api/v1/files').set('X-API-Key', SECRET).send({ fileName: 'b.bin', byteSize: 5 }).expect(201);

    const prvi = await request(app)
      .put(`/api/v1/files/${a.body.id}/content`)
      .set('X-API-Key', SECRET)
      .set('Idempotency-Key', key)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('AAAAA'))
      .expect(201);
    const drugi = await request(app)
      .put(`/api/v1/files/${b.body.id}/content`)
      .set('X-API-Key', SECRET)
      .set('Idempotency-Key', key)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('BBBBB'))
      .expect(201);

    // Različni datoteki, različna odgovora — glava ju ni zlila v enega.
    expect(drugi.body.file.id).not.toBe(prvi.body.file.id);
    expect(drugi.body.file.displayName).toBe('b.bin');

    const { cookie } = await unlock(app, drugi.body.shareUrl.split('/d/')[1], drugi.body.password);
    const content = await request(app)
      .get(`/api/v1/share/${drugi.body.shareUrl.split('/d/')[1]}/content`)
      .set('Cookie', cookie)
      .expect(200);
    expect(Buffer.from(content.body).toString()).toBe('BBBBB');
  });
});
