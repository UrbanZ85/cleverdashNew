import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { SharedFileModel } from '../../../src/modules/file-sharing/models/shared-file.model.js';
import { loginAndUnlock, unlock, uploadFile } from './_helpers.js';

// US2 (P1): brez gesla nihče ne dobi ničesar. To ni "dodatek" k US1 — nalaganje brez zaščite
// ni ta funkcionalnost.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv();
  await clearTestDb();
});

describe('Zavrnitve odklenitve', () => {
  it('napačno geslo je 401 in ne pove, ali je bilo blizu', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    const { res } = await unlock(app, share.token, 'ABCD-EFGH-JKLM-NPQR');
    expect(res.status).toBe(401);
    expect(res.body.detail).not.toContain(share.password);
    // Namig o tem, koliko znakov se ujema, ne obstaja — samo števec preostalih poskusov.
    expect(res.body.detail).toMatch(/Poskusov do zaklepa: \d+/);
  });

  it('geslo, ki odklepa DRUGO datoteko, je zavrnjeno enako kot napačno (FR-016)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const prva = await uploadFile(app, token, { fileName: 'prva.bin' });
    const druga = await uploadFile(app, token, { fileName: 'druga.bin' });

    const { res: napacno } = await unlock(app, prva.token, 'ABCD-EFGH-JKLM-NPQR');
    const { res: tuje } = await unlock(app, prva.token, druga.password);

    expect(tuje.status).toBe(401);
    expect(tuje.body.title).toBe(napacno.body.title);
  });

  it('brez gesla v telesu je 400, ne 401 — to ni poskus, ampak napačna zahteva', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    await request(app).post(`/api/v1/share/${share.token}/unlock`).send({}).expect(400);
  });

  it('potekla, preklicana, izbrisana in neznana povezava dajo ENAK odgovor (FR-023)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const neznana = await request(app).get('/api/v1/share/aaaaaaaaaaaaaaaaaaaaaa').expect(404);

    const potekla = await uploadFile(app, token);
    await SharedFileModel.updateOne({ _id: potekla.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const poteklaRes = await request(app).get(`/api/v1/share/${potekla.token}`).expect(404);

    const preklicana = await uploadFile(app, token);
    await request(app)
      .post(`/api/v1/files/${preklicana.id}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const preklicanaRes = await request(app).get(`/api/v1/share/${preklicana.token}`).expect(404);

    const izbrisana = await uploadFile(app, token);
    const izbrisanToken = izbrisana.token;
    await request(app).delete(`/api/v1/files/${izbrisana.id}`).set('Authorization', `Bearer ${token}`).expect(204);
    const izbrisanaRes = await request(app).get(`/api/v1/share/${izbrisanToken}`).expect(404);

    for (const res of [poteklaRes, preklicanaRes, izbrisanaRes]) {
      expect(res.body.detail).toBe(neznana.body.detail);
      expect(res.body.title).toBe(neznana.body.title);
    }
  });

  it('potekle povezave ni mogoče odkleniti niti s pravilnim geslom', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    await SharedFileModel.updateOne({ _id: share.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const { res } = await unlock(app, share.token, share.password);
    expect(res.status).toBe(404);
  });
});
