import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FileInboxModel } from '../../../src/modules/file-sharing/models/file-inbox.model.js';
import { FileInboxTicketModel } from '../../../src/modules/file-sharing/models/file-inbox-ticket.model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import { createInbox, dropFile, loginAndUnlock, unlockDrop } from './_helpers.js';

// Pogodbeni testi LASTNIKOVE strani sprejemnih predalov (009b) proti
// specs/009-file-sharing/contracts/openapi.yaml.

const MB = 1024 * 1024;

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  delete process.env.FILE_SHARE_INBOX_MAX_FILES;
  delete process.env.FILE_SHARE_INBOX_MAX_MB;
  setTestEnv();
  await clearTestDb();
});

describe('POST /inboxes — nastanek predala', () => {
  it('vrne naslov za oddajo IN kodo, oboje pripravljeno za pošiljanje', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/inboxes')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Skenirane pogodbe', note: 'Pošlji obe strani.', maxFiles: 3, maxTotalMb: 50 })
      .expect(201);

    expect(res.body.dropUrl).toContain('/u/');
    // Koda je v isti obliki kot geslo za prevzem — po štiri znake, ker se tako narekuje.
    expect(res.body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(res.body.inbox.label).toBe('Skenirane pogodbe');
    expect(res.body.inbox.maxFiles).toBe(3);
    expect(res.body.inbox.maxTotalBytes).toBe(50 * MB);
    expect(res.body.inbox.openForUpload).toBe(true);
    expect(res.body.inbox.receivedFiles).toBe(0);
  });

  it('kode NE hrani v berljivi obliki (FR-082)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    const doc = await FileInboxModel.findById(inbox.id).lean<{ codeHash: string } | null>();
    expect(doc!.codeHash.startsWith('scrypt$')).toBe(true);
    // Niti čistopisa niti njegove normalizirane oblike ni nikjer v zapisu.
    expect(JSON.stringify(doc)).not.toContain(inbox.code.replace(/-/g, ''));
  });

  it('kode ni v NOBENEM poznejšem odgovoru — niti na seznamu niti v podrobnostih', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const auth = { Authorization: `Bearer ${token}` };

    const list = await request(app).get('/api/v1/inboxes').set(auth).expect(200);
    const detail = await request(app).get(`/api/v1/inboxes/${inbox.id}`).set(auth).expect(200);

    const bare = inbox.code.replace(/-/g, '');
    expect(JSON.stringify(list.body)).not.toContain(bare);
    expect(JSON.stringify(detail.body)).not.toContain(bare);
    expect(detail.body.code).toBeUndefined();
  });

  it('brez oznake je 400 — predal brez oznake pošiljatelju nič ne pove', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app).post('/api/v1/inboxes').set('Authorization', `Bearer ${token}`).send({}).expect(400);
    await request(app)
      .post('/api/v1/inboxes')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: '' })
      .expect(400);
  });

  it('meja nad stropom namestitve je 400 in ne tiho znižanje (FR-087)', async () => {
    setTestEnv({ FILE_SHARE_INBOX_MAX_FILES: '5', FILE_SHARE_INBOX_MAX_MB: '100' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const auth = { Authorization: `Bearer ${token}` };

    const preveč = await request(app)
      .post('/api/v1/inboxes')
      .set(auth)
      .send({ label: 'X', maxFiles: 6 })
      .expect(400);
    expect(preveč.body.detail).toContain('5');

    const prevelik = await request(app)
      .post('/api/v1/inboxes')
      .set(auth)
      .send({ label: 'X', maxTotalMb: 101 })
      .expect(400);
    expect(prevelik.body.detail).toContain('100');
  });

  it('izpuščeni meji pomenita strop namestitve', async () => {
    setTestEnv({ FILE_SHARE_INBOX_MAX_FILES: '4', FILE_SHARE_INBOX_MAX_MB: '30' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    expect(inbox.maxFiles).toBe(4);
    expect(inbox.maxTotalBytes).toBe(30 * MB);
  });

  it('meji sta shranjeni NA PREDALU — poznejša sprememba namestitve starega predala ne razširi', async () => {
    setTestEnv({ FILE_SHARE_INBOX_MAX_FILES: '2', FILE_SHARE_INBOX_MAX_MB: '10' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    // Lastnik namestitve pozneje dvigne strop.
    setTestEnv({ FILE_SHARE_INBOX_MAX_FILES: '50', FILE_SHARE_INBOX_MAX_MB: '5000' });
    const { app: app2 } = await createApp();
    const detail = await request(app2)
      .get(`/api/v1/inboxes/${inbox.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Predal, ki ga je lastnik namenoma naredil majhnega, ostane majhen.
    expect(detail.body.maxFiles).toBe(2);
    expect(detail.body.maxTotalBytes).toBe(10 * MB);
  });

  it('brez roka je veljavna izbira in ni isto kot "nisem izbral"', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const brezRoka = await createInbox(app, token, { expiresInDays: null });
    const privzeti = await createInbox(app, token);
    const auth = { Authorization: `Bearer ${token}` };

    const a = await request(app).get(`/api/v1/inboxes/${brezRoka.id}`).set(auth).expect(200);
    const b = await request(app).get(`/api/v1/inboxes/${privzeti.id}`).set(auth).expect(200);
    expect(a.body.expiresAt).toBeNull();
    expect(b.body.expiresAt).toBeTruthy();
  });

  it('Idempotency-Key se NE upošteva — koda ne sme obležati v zbirki shranjenih odgovorov', async () => {
    // Izjema člena III ne velja samo za pot, ki izda ŽETON, ampak za vsako, ki izda SKRIVNOST:
    // shranjen odgovor je zapis v bazi in bi kodo hranil 24 ur v berljivi obliki, čeprav modul o
    // sebi trdi, da hrani samo `scrypt` povzetek (FR-082). Najdba varnostnega pregleda 009b.
    const { IdempotencyKeyModel } = await import('../../../src/platform/idempotency/model.js');
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const headers = { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'kljuc-predal' };
    const body = { label: 'Fotografije' };

    const prvi = await request(app).post('/api/v1/inboxes').set(headers).send(body).expect(201);
    const drugi = await request(app).post('/api/v1/inboxes').set(headers).send(body).expect(201);

    // Ponovljen klic naredi DRUG predal. To je namerna izbira: odvečen predal je viden in ga je
    // mogoče izbrisati, shranjene kode pa ni mogoče preklicati za nazaj.
    expect(drugi.body.inbox.id).not.toBe(prvi.body.inbox.id);
    expect(drugi.body.code).not.toBe(prvi.body.code);
    expect(await FileInboxModel.countDocuments({})).toBe(2);

    // In v zbirki ključev ni ne zapisa te poti ne kode.
    expect(await IdempotencyKeyModel.countDocuments({})).toBe(0);
    const shranjeno = JSON.stringify(await IdempotencyKeyModel.find({}).lean());
    expect(shranjeno).not.toContain(prvi.body.code.replace(/-/g, ''));
    expect(shranjeno).not.toContain(prvi.body.code);
  });

  it('nova koda se prav tako ne shrani — shranjen odgovor bi vrnil STARO kodo', async () => {
    const { IdempotencyKeyModel } = await import('../../../src/platform/idempotency/model.js');
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const headers = { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'kljuc-koda-1' };

    const prvi = await request(app).post(`/api/v1/inboxes/${inbox.id}/code`).set(headers).expect(200);
    const drugi = await request(app).post(`/api/v1/inboxes/${inbox.id}/code`).set(headers).expect(200);

    // Zamenjava, ki bi vrnila staro kodo, bi bila videti opravljena, čeprav ni bila.
    expect(drugi.body.code).not.toBe(prvi.body.code);
    expect(drugi.body.dropUrl).not.toBe(prvi.body.dropUrl);
    expect(await IdempotencyKeyModel.countDocuments({})).toBe(0);
  });
});

describe('GET /inboxes — seznam s stropi namestitve', () => {
  it('vrne predale in stropi so v odgovoru, da jih vmesnik ne ugiba', async () => {
    setTestEnv({ FILE_SHARE_INBOX_MAX_FILES: '7', FILE_SHARE_INBOX_MAX_MB: '200' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await createInbox(app, token, { label: 'Prvi' });
    await createInbox(app, token, { label: 'Drugi' });

    const res = await request(app).get('/api/v1/inboxes').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.inboxes).toHaveLength(2);
    expect(res.body.limits.maxFiles).toBe(7);
    expect(res.body.limits.maxTotalBytes).toBe(200 * MB);
    expect(res.body.limits.maxFileBytes).toBe(500 * MB);
  });

  it('prejeto se sešteje z agregacijo in nedokončane oddaje ne šteje kot prejete', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 5, maxTotalMb: 10 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    await dropFile(app, inbox.token, ticket, Buffer.from('prva vsebina'), { fileName: 'prva.pdf' });
    // Napoved BREZ vsebine: prostor je rezerviran, prejeto pa še ni nič.
    await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'visi.pdf', byteSize: 1234 })
      .expect(201);

    const res = await request(app).get('/api/v1/inboxes').set('Authorization', `Bearer ${token}`).expect(200);
    const mine = res.body.inboxes[0];
    expect(mine.receivedFiles).toBe(1);
    expect(mine.receivedBytes).toBe('prva vsebina'.length);
    expect(mine.lastReceivedAt).toBeTruthy();
  });
});

describe('Lastništvo predala (FR-053)', () => {
  it('vsak endpoint nad TUJIM predalom vrne 404, ne 403', async () => {
    const { app } = await createApp();
    const lastnik = await loginAndUnlock(app);
    const inbox = await createInbox(app, lastnik);

    const drugi = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-drugi',
      email: 'drugi@example.com',
      name: 'Drugi uporabnik',
      roles: ['cleverdash-user'],
    });
    const auth = { Authorization: `Bearer ${drugi.accessToken}` };

    await request(app).get(`/api/v1/inboxes/${inbox.id}`).set(auth).expect(404);
    await request(app).post(`/api/v1/inboxes/${inbox.id}/close`).set(auth).expect(404);
    await request(app).post(`/api/v1/inboxes/${inbox.id}/code`).set(auth).expect(404);
    await request(app).delete(`/api/v1/inboxes/${inbox.id}`).set(auth).expect(404);

    const list = await request(app).get('/api/v1/inboxes').set(auth).expect(200);
    expect(list.body.inboxes).toHaveLength(0);
  });

  it('neveljaven identifikator je 404, ne 500', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app).get('/api/v1/inboxes/ni-objectid').set('Authorization', `Bearer ${token}`).expect(404);
  });
});

describe('POST /inboxes/{id}/close — zaprtje', () => {
  it('zapre predal, razveljavi dovolilnice in oddaja od tega trenutka ne gre skozi (FR-083)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);
    expect(ticket).not.toBe('');

    const closed = await request(app)
      .post(`/api/v1/inboxes/${inbox.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(closed.body.state).toBe('closed');
    expect(closed.body.openForUpload).toBe(false);

    // Dovolilnica, ki je bila izdana PRED zaprtjem, ne velja več.
    expect(await FileInboxTicketModel.countDocuments({})).toBe(0);
    const { declared } = await dropFile(app, inbox.token, ticket, Buffer.from('pozno'));
    expect(declared.status).toBe(404);
  });

  it('drugo zaprtje je 409 — zaprtje se ne ponavlja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const auth = { Authorization: `Bearer ${token}` };

    await request(app).post(`/api/v1/inboxes/${inbox.id}/close`).set(auth).expect(200);
    await request(app).post(`/api/v1/inboxes/${inbox.id}/close`).set(auth).expect(409);
  });
});

describe('POST /inboxes/{id}/code — nova koda', () => {
  it('naredi NOVO kodo IN NOV naslov; stari naslov odgovarja kot neznan (FR-083)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    const res = await request(app)
      .post(`/api/v1/inboxes/${inbox.id}/code`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.dropUrl).not.toBe(inbox.dropUrl);
    expect(res.body.code).not.toBe(inbox.code);

    // Stari naslov je od zdaj neločljiv od neznanega (FR-085).
    const stari = await request(app).get(`/api/v1/drop/${inbox.token}`).expect(404);
    const neznan = await request(app).get('/api/v1/drop/aaaaaaaaaaaaaaaaaaaaaa').expect(404);
    expect(stari.body.detail).toBe(neznan.body.detail);

    // Stara koda na NOVEM naslovu prav tako ne odklene ničesar.
    const noviToken = String(res.body.dropUrl).split('/u/')[1];
    const staraKoda = await unlockDrop(app, noviToken!, inbox.code);
    expect(staraKoda.res.status).toBe(401);
  });

  it('zaprt predal se z novo kodo vrne v obtok — ločene operacije "odpri" namenoma ni', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const auth = { Authorization: `Bearer ${token}` };

    await request(app).post(`/api/v1/inboxes/${inbox.id}/close`).set(auth).expect(200);
    const res = await request(app).post(`/api/v1/inboxes/${inbox.id}/code`).set(auth).expect(200);

    expect(res.body.inbox.state).toBe('open');
    expect(res.body.inbox.openForUpload).toBe(true);
    const noviToken = String(res.body.dropUrl).split('/u/')[1];
    const odklep = await unlockDrop(app, noviToken!, res.body.code);
    expect(odklep.res.status).toBe(200);
  });

  it('razveljavi tudi ŽE IZDANE dovolilnice', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    await request(app).post(`/api/v1/inboxes/${inbox.id}/code`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(await FileInboxTicketModel.countDocuments({})).toBe(0);
    const { declared } = await dropFile(app, inbox.token, ticket, Buffer.from('pozno'));
    expect(declared.status).toBe(404);
  });
});

describe('DELETE /inboxes/{id} — brisanje predala', () => {
  it('izbriše predal, PREJETE DATOTEKE pa ostanejo (FR-094)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const auth = { Authorization: `Bearer ${token}` };
    const inbox = await createInbox(app, token, { maxFiles: 3, maxTotalMb: 10 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);
    await dropFile(app, inbox.token, ticket, Buffer.from('prejeta vsebina'), { fileName: 'pogodba.pdf' });

    await request(app).delete(`/api/v1/inboxes/${inbox.id}`).set(auth).expect(204);

    const inboxes = await request(app).get('/api/v1/inboxes').set(auth).expect(200);
    expect(inboxes.body.inboxes).toHaveLength(0);

    // Datoteka je lastnikova in ostane — skupaj s podatkom, po kateri poti je prišla.
    const files = await request(app).get('/api/v1/files').set(auth).expect(200);
    expect(files.body.files).toHaveLength(1);
    expect(files.body.files[0].displayName).toBe('pogodba.pdf');
    expect(files.body.files[0].origin).toBe('inbox');
    expect(files.body.files[0].inboxId).toBe(inbox.id);

    // In jo je še vedno mogoče prenesti.
    await request(app).get(`/api/v1/files/${files.body.files[0].id}/content`).set(auth).expect(200);

    // Naslov predala je mrtev.
    await request(app).get(`/api/v1/drop/${inbox.token}`).expect(404);
  });
});
