import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { SharedFileModel } from '../../src/modules/file-sharing/models/shared-file.model.js';
import { loginAndUnlock } from '../contract/file-sharing/_helpers.js';

// FR-009: kvote ne sme prekoračiti niti nalaganje, ki teče VZPOREDNO.
//
// Ključno je, da napoved (`POST /files`) prostor REZERVIRA: zapis v stanju `uploading` ima
// `byteSize` in ga agregacija zasedenosti šteje. Brez tega bi dve hkratni napovedi obe videli
// prazno kvoto in obe šli skozi.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  delete process.env.FILE_SHARE_QUOTA_MB;
  setTestEnv();
  await clearTestDb();
});

describe('Kvota pri vzporednem nalaganju', () => {
  it('napoved REZERVIRA prostor — druga napoved iste velikosti ne gre več skozi', async () => {
    setTestEnv({ FILE_SHARE_QUOTA_MB: '2' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const nearlyFull = Math.floor(1.5 * 1024 * 1024);

    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'prva.bin', byteSize: nearlyFull })
      .expect(201);

    // Prva datoteka še ni naložena (`uploading`), a je prostor že njen.
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'druga.bin', byteSize: nearlyFull })
      .expect(507);
  });

  it('dve hkratni napovedi ne moreta obe uspeti, če skupaj presegata kvoto', async () => {
    setTestEnv({ FILE_SHARE_QUOTA_MB: '2' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const size = Math.floor(1.5 * 1024 * 1024);

    const [a, b] = await Promise.all([
      request(app).post('/api/v1/files').set('Authorization', `Bearer ${token}`).send({ fileName: 'a.bin', byteSize: size }),
      request(app).post('/api/v1/files').set('Authorization', `Bearer ${token}`).send({ fileName: 'b.bin', byteSize: size }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 507]);
    expect(await SharedFileModel.countDocuments({})).toBe(1);
  });

  it('sproščen prostor je spet na voljo', async () => {
    setTestEnv({ FILE_SHARE_QUOTA_MB: '2' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const size = Math.floor(1.5 * 1024 * 1024);

    const prva = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'prva.bin', byteSize: size })
      .expect(201);

    await SharedFileModel.deleteOne({ _id: prva.body.id });

    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'druga.bin', byteSize: size })
      .expect(201);
  });
});
