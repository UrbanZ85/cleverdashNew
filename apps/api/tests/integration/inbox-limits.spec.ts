import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { SharedFileModel } from '../../src/modules/file-sharing/models/shared-file.model.js';
import { FileInboxModel } from '../../src/modules/file-sharing/models/file-inbox.model.js';
import { FileInboxTicketModel } from '../../src/modules/file-sharing/models/file-inbox-ticket.model.js';
import { FileShareAttemptModel } from '../../src/modules/file-sharing/models/file-share-attempt.model.js';
import { runFileShareCleanup } from '../../src/modules/file-sharing/services/cleanup.service.js';
import { MAX_PENDING_UPLOADS } from '../../src/modules/file-sharing/services/inbox.service.js';
import { createInbox, dropFile, loginAndUnlock, unlock, unlockDrop, uploadFile } from '../contract/file-sharing/_helpers.js';

// FR-087/FR-088/FR-090/FR-096: kaj ustavi nekoga, ki IMA naslov in kodo.
//
// Predal je edina pot, po kateri v to namestitev piše človek brez računa. Vprašanje tega testa
// zato ni, ali oddaja deluje (to je pogodbeni test), ampak ali jo je mogoče zlorabiti do te
// mere, da lastniku napolni disk ali mu prepreči rabo.

const MB = 1024 * 1024;

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  delete process.env.FILE_SHARE_QUOTA_MB;
  delete process.env.FILE_SHARE_MAX_MB;
  delete process.env.FILE_SHARE_ATTEMPT_LIMIT;
  delete process.env.FILE_SHARE_INBOX_MAX_MB;
  delete process.env.FILE_SHARE_INBOX_MAX_FILES;
  setTestEnv();
  await clearTestDb();
});

describe('Meje predala pri oddaji', () => {
  it('skupni prostor predala ustavi oddajo, čeprav ima lastnik še kvoto', async () => {
    setTestEnv({ FILE_SHARE_QUOTA_MB: '5000', FILE_SHARE_INBOX_MAX_MB: '5000' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    // Predal za 1 MB pri kvoti 5 GB: meja predala je tista, ki mora ustaviti.
    const inbox = await createInbox(app, token, { maxFiles: 10, maxTotalMb: 1 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const res = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'velika.bin', byteSize: 2 * MB })
      .expect(507);
    expect(res.body.detail).toContain('V tem predalu ni več prostora');
    expect(await SharedFileModel.countDocuments({})).toBe(0);
  });

  it('kvota LASTNIKA ustavi oddajo, ne da bi razkrila njegove številke', async () => {
    setTestEnv({ FILE_SHARE_QUOTA_MB: '2', FILE_SHARE_INBOX_MAX_MB: '1000' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    // Lastnik sam zasede skoraj vso svojo kvoto.
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'moja.bin', byteSize: Math.floor(1.9 * MB) })
      .expect(201);

    const inbox = await createInbox(app, token, { maxFiles: 10, maxTotalMb: 1000 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const res = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'oddana.bin', byteSize: 1 * MB })
      .expect(507);

    // Pošiljatelj ni lastnikov skrbnik: izve, da datoteka ne gre skozi, ne pa koliko prostora
    // ima lastnik in koliko ga je porabil.
    expect(res.body.detail).toContain('Prejemnik trenutno nima prostora');
    expect(res.body.detail).not.toMatch(/\d/);
  });

  it('VZPOREDNI napovedi ne moreta obe skozi mejo predala (razsodba po `_id`)', async () => {
    setTestEnv({ FILE_SHARE_QUOTA_MB: '5000', FILE_SHARE_INBOX_MAX_MB: '5000' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 10, maxTotalMb: 3 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const napovej = () =>
      request(app)
        .post(`/api/v1/drop/${inbox.token}/files`)
        .set('X-Drop-Ticket', ticket)
        .send({ fileName: 'hkratna.bin', byteSize: 2 * MB });

    const [prva, druga] = await Promise.all([napovej(), napovej()]);
    const statusi = [prva.status, druga.status].sort();

    // Ena uspe, druga dobi 507 — nikoli obe. Brez razsodbe bi obe prebrali prazen predal,
    // preden bi katera pisala, in v predalu za 3 MB bi bilo rezerviranih 4 MB.
    expect(statusi).toEqual([201, 507]);
    const zasedeno = await SharedFileModel.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$byteSize' } } },
    ]);
    expect(zasedeno[0]!.total).toBeLessThanOrEqual(3 * MB);
  });

  it('nedokončane oddaje so omejene — viseče napovedi ne smejo zasesti predala (FR-096)', async () => {
    // Meji predala sta namenoma visoki: ustaviti ga mora meja VISEČIH oddaj, ne prostor.
    setTestEnv({ FILE_SHARE_INBOX_MAX_FILES: '50', FILE_SHARE_INBOX_MAX_MB: '1000' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 50, maxTotalMb: 100 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const napovej = () =>
      request(app)
        .post(`/api/v1/drop/${inbox.token}/files`)
        .set('X-Drop-Ticket', ticket)
        .send({ fileName: 'visi.bin', byteSize: 1024 });

    for (let i = 0; i < MAX_PENDING_UPLOADS; i += 1) {
      await napovej().expect(201);
    }
    // Naslednja je zavrnjena, dokler se katera od visečih ne zaključi ali je ne pobere pometač.
    const res = await napovej().expect(429);
    expect(res.body.detail).toContain('Prejšnje oddaje še niso zaključene');
  });

  it('pometač sprosti obtičalo oddajo in predal je znova uporaben', async () => {
    setTestEnv({ FILE_SHARE_INBOX_MAX_MB: '1000' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 1, maxTotalMb: 10 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const declared = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'obticala.bin', byteSize: 4096 })
      .expect(201);

    // Predal je zdaj "poln" — rezervacija šteje, čeprav vsebine ni.
    await dropFile(app, inbox.token, ticket, Buffer.from('naslednja')).then(({ declared: d }) =>
      expect(d.status).toBe(507),
    );

    // Postaramo zapis čez `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES` (privzeto 360 min).
    await SharedFileModel.collection.updateOne(
      { _id: (await SharedFileModel.findById(declared.body.id).lean())!._id },
      { $set: { updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) } },
    );
    const report = await runFileShareCleanup();
    expect(report.stalledUploads).toBe(1);

    const { uploaded } = await dropFile(app, inbox.token, ticket, Buffer.from('naslednja'));
    expect(uploaded!.status).toBe(201);
  });
});

describe('Dušenje ugibanja kode (FR-090)', () => {
  it('po preseženi meji je zavrnjena tudi PRAVILNA koda, in lastnik to vidi', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '3' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    for (let i = 0; i < 3; i += 1) {
      const { res } = await unlockDrop(app, inbox.token, 'AAAA-BBBB-CCCC-DDDD');
      expect([401, 429]).toContain(res.status);
    }

    // Zaklep, ki bi pravilno kodo prepustil, bi bil zgolj upočasnitev.
    const pravilna = await unlockDrop(app, inbox.token, inbox.code);
    expect(pravilna.res.status).toBe(429);
    expect(pravilna.res.headers['retry-after']).toBeTruthy();
    expect(pravilna.ticket).toBe('');

    // Lastnik MORA videti, da nekdo ugiba — v odgovoru API-ja, ne le v dnevniku.
    const detail = await request(app)
      .get(`/api/v1/inboxes/${inbox.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.failedAttempts).toBeGreaterThanOrEqual(3);
    expect(detail.body.lockedUntil).toBeTruthy();
  });

  it('poskušene kode ni nikjer — ne v zapisu predala, ne v števcu poskusov (FR-032)', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '5' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    await unlockDrop(app, inbox.token, 'TAJNA-KODA-1234');

    const doc = await FileInboxModel.findById(inbox.id).lean();
    const attempts = await FileShareAttemptModel.find({}).lean();
    expect(JSON.stringify(doc)).not.toContain('TAJNA');
    expect(JSON.stringify(attempts)).not.toContain('TAJNA');
  });

  it('števec PREDALA in števec NASLOVA sta ločena; uspeh počisti samo prvega', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '5' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    await unlockDrop(app, inbox.token, 'AAAA-BBBB-CCCC-DDDD');
    expect(await FileShareAttemptModel.countDocuments({ key: `inbox:${inbox.id}` })).toBe(1);
    expect(await FileShareAttemptModel.countDocuments({ key: /^ip:/ })).toBe(1);

    const uspeh = await unlockDrop(app, inbox.token, inbox.code);
    expect(uspeh.res.status).toBe(200);

    // Uspeh na tem predalu ne sme oprati ugibanja, ki teče z istega naslova po drugih predalih.
    expect(await FileShareAttemptModel.countDocuments({ key: `inbox:${inbox.id}` })).toBe(0);
    expect(await FileShareAttemptModel.countDocuments({ key: /^ip:/ })).toBe(1);
  });

  it('števec NASLOVA je skupen obema javnima površinama — en napadalec je ena meja', async () => {
    setTestEnv({ FILE_SHARE_ATTEMPT_LIMIT: '3' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const inbox = await createInbox(app, token);

    // Ugibanje GESLA za prevzem z istega naslova …
    for (let i = 0; i < 3; i += 1) {
      await unlock(app, share.token, 'AAAABBBBCCCCDDDD');
    }

    // … zaklene tudi oddajo, čeprav na tem predalu ni bilo niti enega poskusa. Ločena števca
    // naslova bi napadalcu mejo podvojila.
    const { res } = await unlockDrop(app, inbox.token, inbox.code);
    expect(res.status).toBe(429);
  });
});

describe('Pometač in potekli predali (FR-094)', () => {
  it('potekel predal po roku hrambe izgine, PREJETE DATOTEKE pa ostanejo', async () => {
    setTestEnv({ FILE_SHARE_INBOX_MAX_MB: '100' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 3, maxTotalMb: 10 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);
    await dropFile(app, inbox.token, ticket, Buffer.from('prejeta vsebina'), { fileName: 'prejeto.pdf' });

    // Rok je minil pred osmimi dnevi; `FILE_SHARE_RETENTION_DAYS` je privzeto 7.
    await FileInboxModel.updateOne(
      { _id: inbox.id },
      { $set: { expiresAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } },
    );

    const report = await runFileShareCleanup();
    expect(report.expiredInboxes).toBe(1);
    expect(await FileInboxModel.countDocuments({})).toBe(0);
    expect(await FileInboxTicketModel.countDocuments({})).toBe(0);

    // Datoteka je lastnikova in je pometač ne sme odnesti: ni je delil on in nima roka.
    const files = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(files.body.files).toHaveLength(1);
    expect(files.body.files[0].displayName).toBe('prejeto.pdf');
    await request(app)
      .get(`/api/v1/files/${files.body.files[0].id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('potekel predal PRED rokom hrambe ostane, da ga lastnik še vidi', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    await FileInboxModel.updateOne({ _id: inbox.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const report = await runFileShareCleanup();
    expect(report.expiredInboxes).toBe(0);

    const detail = await request(app)
      .get(`/api/v1/inboxes/${inbox.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.expired).toBe(true);
    expect(detail.body.openForUpload).toBe(false);
  });

  it('zaprt predal BREZ roka ostane — zaprtje je lastnikovo dejanje, ne rok', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { expiresInDays: null });
    await request(app)
      .post(`/api/v1/inboxes/${inbox.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const report = await runFileShareCleanup();
    expect(report.expiredInboxes).toBe(0);
    expect(await FileInboxModel.countDocuments({})).toBe(1);
  });

  it('pometač je idempotenten: drugi zagon nad istim stanjem ne naredi ničesar', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    await FileInboxModel.updateOne(
      { _id: inbox.id },
      { $set: { expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    );

    expect((await runFileShareCleanup()).expiredInboxes).toBe(1);
    expect((await runFileShareCleanup()).expiredInboxes).toBe(0);
  });
});
