import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { SharedFileModel } from '../../../src/modules/file-sharing/models/shared-file.model.js';
import { FileInboxModel } from '../../../src/modules/file-sharing/models/file-inbox.model.js';
import { createInbox, dropFile, loginAndUnlock, unlockDrop } from './_helpers.js';

// Pogodbeni testi JAVNE poti za ODDAJO (009b) — pošiljatelj nima računa in ga ne bo dobil.
//
// To so edine javne poti v tem zaledju, ki PIŠEJO NA DISK. Zato tu ni dovolj preveriti, da srečna
// pot deluje: vsaka zavrnitev mora tudi dokazati, da za sabo ni pustila zapisa.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  delete process.env.FILE_SHARE_MAX_MB;
  setTestEnv();
  await clearTestDb();
});

describe('GET /drop/{token} — kaj sme izvedeti nekdo, ki ima samo naslov', () => {
  it('vrne dovoljeno velikost in rok BREZ prijave', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 40 });

    const res = await request(app).get(`/api/v1/drop/${inbox.token}`).expect(200);
    expect(res.body.maxFileBytes).toBe(40 * 1024 * 1024);
    expect(res.body.expiresAt).toBeTruthy();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('OZNAKE in NAVODILA ne izda — to je podatek, ki ga varuje koda (FR-084)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, {
      label: 'Pogodba najem 2026',
      note: 'Skeniraj obe strani.',
    });

    const res = await request(app).get(`/api/v1/drop/${inbox.token}`).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('Pogodba');
    expect(JSON.stringify(res.body)).not.toContain('Skeniraj');
    expect(res.body.label).toBeUndefined();
    expect(res.body.note).toBeUndefined();
  });

  it('NE izda preostalega prostora — to bi bil števec dogajanja za vsakogar z naslovom', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 3, maxTotalMb: 40 });

    const prazen = await request(app).get(`/api/v1/drop/${inbox.token}`).expect(200);
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);
    await dropFile(app, inbox.token, ticket, Buffer.alloc(1024, 3));
    const poOddaji = await request(app).get(`/api/v1/drop/${inbox.token}`).expect(200);

    // Isti odgovor pred oddajo in po njej: kdor samo opazuje naslov, o predalu ne izve nič novega.
    expect(poOddaji.body).toEqual(prazen.body);
    expect(poOddaji.body.remainingFiles).toBeUndefined();
    expect(poOddaji.body.remainingBytes).toBeUndefined();
  });

  it('neznan, potekel, zaprt in izbrisan predal dajo ENAK odgovor (FR-085)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const auth = { Authorization: `Bearer ${token}` };

    const neznan = await request(app).get('/api/v1/drop/aaaaaaaaaaaaaaaaaaaaaa').expect(404);

    const zaprt = await createInbox(app, token);
    await request(app).post(`/api/v1/inboxes/${zaprt.id}/close`).set(auth).expect(200);
    const zaprtRes = await request(app).get(`/api/v1/drop/${zaprt.token}`).expect(404);

    const potekel = await createInbox(app, token);
    await FileInboxModel.updateOne({ _id: potekel.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const potekelRes = await request(app).get(`/api/v1/drop/${potekel.token}`).expect(404);

    const izbrisan = await createInbox(app, token);
    await request(app).delete(`/api/v1/inboxes/${izbrisan.id}`).set(auth).expect(204);
    const izbrisanRes = await request(app).get(`/api/v1/drop/${izbrisan.token}`).expect(404);

    for (const res of [zaprtRes, potekelRes, izbrisanRes]) {
      expect(res.body.detail).toBe(neznan.body.detail);
      expect(res.body.title).toBe(neznan.body.title);
    }
  });

  it('žeton napačne oblike vrne isti 404, ne 400 — oblika ni namig', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/drop/prekratek').expect(404);
    expect(res.body.detail).toContain('Ta povezava ne velja');
  });

  it('besedilo je ISTO kot pri povezavi za prevzem — po odgovoru ni mogoče ločiti smeri', async () => {
    const { app } = await createApp();
    const prevzem = await request(app).get('/api/v1/share/aaaaaaaaaaaaaaaaaaaaaa').expect(404);
    const oddaja = await request(app).get('/api/v1/drop/aaaaaaaaaaaaaaaaaaaaaa').expect(404);
    expect(oddaja.body.detail).toBe(prevzem.body.detail);
  });
});

describe('POST /drop/{token}/unlock — vpis kode', () => {
  it('pravilna koda vrne oznako, navodilo in dovolilnico — brez piškotka (FR-091)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, {
      label: 'Skenirane pogodbe',
      note: 'Skeniraj obe strani.',
      maxFiles: 3,
      maxTotalMb: 40,
    });

    const { res, ticket } = await unlockDrop(app, inbox.token, inbox.code);
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Skenirane pogodbe');
    expect(res.body.note).toBe('Skeniraj obe strani.');
    expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.ticketExpiresAt).toBeTruthy();
    expect(res.body.remainingFiles).toBe(3);
    expect(res.body.remainingBytes).toBe(40 * 1024 * 1024);
    expect(res.headers['cache-control']).toBe('no-store');

    // Dovolilnica za oddajo NE gre v piškotek: piškotek bi brskalnik pripel sam tudi zahtevi s
    // tuje strani, kar bi pri poti, ki piše na disk, pomenilo oddajo v imenu obiskovalca.
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('koda z vezaji iz prikaza deluje enako kot brez njih', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    const { res } = await unlockDrop(app, inbox.token, inbox.code.replace(/-/g, '').toLowerCase());
    expect(res.status).toBe(200);
  });

  it('napačna koda je 401 in pove le, koliko poskusov ostane', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    const { res } = await unlockDrop(app, inbox.token, 'AAAA-BBBB-CCCC-DDDD');
    expect(res.status).toBe(401);
    expect(res.body.detail).toContain('Poskusov do zaklepa');
    expect(res.body.ticket).toBeUndefined();
  });

  it('koda DRUGEGA predala je zavrnjena enako kot napačna (isto pravilo kot FR-016)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const prvi = await createInbox(app, token, { label: 'Prvi' });
    const drugi = await createInbox(app, token, { label: 'Drugi' });

    const tuja = await unlockDrop(app, prvi.token, drugi.code);
    const napačna = await unlockDrop(app, prvi.token, 'AAAA-BBBB-CCCC-DDDD');
    expect(tuja.res.status).toBe(401);
    expect(tuja.res.body.title).toBe(napačna.res.body.title);
  });

  it('lastnikova seja na javni poti ničesar ne spremeni — koda je še vedno potrebna (FR-024)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    // Lastnik, prijavljen v istem brskalniku, mora vpisati kodo enako kot tujec.
    const brezKode = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'x.pdf', byteSize: 5 });
    expect(brezKode.status).toBe(401);
    expect(await SharedFileModel.countDocuments({})).toBe(0);
  });

  it('Idempotency-Key se NE upošteva — vsaka odklenitev da svojo dovolilnico (FR-097)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    const prvi = await request(app)
      .post(`/api/v1/drop/${inbox.token}/unlock`)
      .set('Idempotency-Key', 'isti-kljuc')
      .send({ code: inbox.code })
      .expect(200);
    const drugi = await request(app)
      .post(`/api/v1/drop/${inbox.token}/unlock`)
      .set('Idempotency-Key', 'isti-kljuc')
      .send({ code: inbox.code })
      .expect(200);

    // Shranjen odgovor bi ponovil dovolilnico tudi po tem, ko je bil predal zaprt.
    expect(drugi.body.ticket).not.toBe(prvi.body.ticket);
  });
});

describe('Oddaja: dovolilnica je pogoj za vsak zapis', () => {
  it('brez glave X-Drop-Ticket ni napovedi in ni zapisa', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    const res = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .send({ fileName: 'racun.pdf', byteSize: 10 })
      .expect(401);
    expect(res.body.id).toBeUndefined();
    expect(await SharedFileModel.countDocuments({})).toBe(0);
  });

  it('izmišljena dovolilnica je 401', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);

    await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', 'a'.repeat(43))
      .send({ fileName: 'racun.pdf', byteSize: 10 })
      .expect(401);
    expect(await SharedFileModel.countDocuments({})).toBe(0);
  });

  it('dovolilnica DRUGEGA predala ne odpre tega, čeprav sta oba istega lastnika', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const prvi = await createInbox(app, token, { label: 'Prvi' });
    const drugi = await createInbox(app, token, { label: 'Drugi' });
    const { ticket } = await unlockDrop(app, drugi.token, drugi.code);

    const res = await request(app)
      .post(`/api/v1/drop/${prvi.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'racun.pdf', byteSize: 10 })
      .expect(401);
    expect(res.body.id).toBeUndefined();
  });

  it('vsebine ni mogoče poslati v oddajo DRUGEGA predala', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const prvi = await createInbox(app, token, { label: 'Prvi', maxTotalMb: 5 });
    const drugi = await createInbox(app, token, { label: 'Drugi', maxTotalMb: 5 });

    const prviTicket = (await unlockDrop(app, prvi.token, prvi.code)).ticket;
    const drugiTicket = (await unlockDrop(app, drugi.token, drugi.code)).ticket;

    // Napoved nastane v PRVEM predalu.
    const declared = await request(app)
      .post(`/api/v1/drop/${prvi.token}/files`)
      .set('X-Drop-Ticket', prviTicket)
      .send({ fileName: 'racun.pdf', byteSize: 7 })
      .expect(201);

    // Poskus, da bi vsebino zanjo poslal kdo, ki ima dovolilnico DRUGEGA predala: pot je vezana
    // na žeton drugega predala, zapis pa na prvega — zato ga ta poizvedba ne najde.
    await request(app)
      .put(`/api/v1/drop/${drugi.token}/files/${declared.body.id}/content`)
      .set('X-Drop-Ticket', drugiTicket)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('vsebina'))
      .expect(404);
  });

  it('v LASTNIKOVO datoteko po poti za oddajo ni mogoče pisati', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    // Lastnikova napoved (`POST /files`) nima `inboxId`; dovolilnica predala je zato ne doseže.
    const own = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'moja.bin', byteSize: 7 })
      .expect(201);

    await request(app)
      .put(`/api/v1/drop/${inbox.token}/files/${own.body.id}/content`)
      .set('X-Drop-Ticket', ticket)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('vsebina'))
      .expect(404);
  });

  it('neveljaven identifikator oddaje je 404, ne 500', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    await request(app)
      .put(`/api/v1/drop/${inbox.token}/files/ni-objectid/content`)
      .set('X-Drop-Ticket', ticket)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('x'))
      .expect(404);
  });
});

describe('Oddaja: srečna pot', () => {
  it('datoteka prispe cela in se pojavi na lastnikovem seznamu kot PREJETA', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 3, maxTotalMb: 10 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const content = Buffer.from('to je vsebina, ki mora priti cela');
    const { uploaded } = await dropFile(app, inbox.token, ticket, content, {
      fileName: 'pogodba-2026.pdf',
      senderName: 'Janez Novak',
    });

    expect(uploaded!.status).toBe(201);
    expect(uploaded!.body.fileName).toBe('pogodba-2026.pdf');
    expect(uploaded!.body.byteSize).toBe(content.byteLength);
    expect(uploaded!.body.remainingFiles).toBe(2);
    expect(uploaded!.body.remainingBytes).toBe(10 * 1024 * 1024 - content.byteLength);

    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    const file = list.body.files[0];
    expect(file.displayName).toBe('pogodba-2026.pdf');
    expect(file.origin).toBe('inbox');
    expect(file.inboxId).toBe(inbox.id);
    expect(file.senderName).toBe('Janez Novak');
    expect(file.state).toBe('ready');
    // Prejeta datoteka NI samodejno deljena naprej (FR-093) in NIMA roka (FR-092).
    expect(file.shareUrl).toBeNull();
    expect(file.expiresAt).toBeNull();
    expect(file.expired).toBe(false);

    // Vsebina je pri lastniku dosegljiva in enaka poslani.
    const download = await request(app)
      .get(`/api/v1/files/${file.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Buffer.from(download.body).equals(content)).toBe(true);
  });

  it('brez navedbe pošiljatelja je `senderName` null, ne prazen niz', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);
    await dropFile(app, inbox.token, ticket, Buffer.from('brez imena'));

    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.files[0].senderName).toBeNull();
  });

  it('ime datoteke s potjo je očiščeno — vnos tujca nikoli ne postane pot (FR-007)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const { uploaded } = await dropFile(app, inbox.token, ticket, Buffer.from('vsebina'), {
      fileName: '../../etc/passwd',
    });
    expect(uploaded!.body.fileName).toBe('passwd');
  });

  it('ena dovolilnica sme oddati več datotek, dokler je prostor', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 2, maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const prva = await dropFile(app, inbox.token, ticket, Buffer.from('prva'), { fileName: 'prva.pdf' });
    const druga = await dropFile(app, inbox.token, ticket, Buffer.from('druga'), { fileName: 'druga.pdf' });
    expect(prva.uploaded!.status).toBe(201);
    expect(druga.uploaded!.status).toBe(201);
    expect(druga.uploaded!.body.remainingFiles).toBe(0);

    // Tretja je zavrnjena zaradi števila, ne velikosti.
    const tretja = await dropFile(app, inbox.token, ticket, Buffer.from('x'), { fileName: 'tretja.pdf' });
    expect(tretja.declared.status).toBe(507);
    expect(tretja.declared.body.detail).toContain('toliko datotek');
  });

  it('lastnik prejeto datoteko lahko deli naprej, a le če to izrecno stori', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const auth = { Authorization: `Bearer ${token}` };
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);
    await dropFile(app, inbox.token, ticket, Buffer.from('prejeto'), { fileName: 'prejeto.pdf' });

    const list = await request(app).get('/api/v1/files').set(auth).expect(200);
    const fileId = list.body.files[0].id;

    // Šele zdaj nastaneta žeton in geslo — pred tem povezave ni bilo (FR-093).
    const shared = await request(app).post(`/api/v1/files/${fileId}/password`).set(auth).expect(200);
    expect(shared.body.shareUrl).toContain('/d/');
    expect(shared.body.password).toBeTruthy();
    const share = String(shared.body.shareUrl).split('/d/')[1];
    const unlocked = await request(app)
      .post(`/api/v1/share/${share}/unlock`)
      .send({ password: shared.body.password })
      .expect(200);
    expect(unlocked.body.fileName).toBe('prejeto.pdf');
  });
});

describe('Oddaja: ena napoved, en poskus', () => {
  it('vsebine iste napovedi ni mogoče poslati dvakrat', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 5, maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const declared = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'racun.pdf', byteSize: 7 })
      .expect(201);

    const poslji = () =>
      request(app)
        .put(`/api/v1/drop/${inbox.token}/files/${declared.body.id}/content`)
        .set('X-Drop-Ticket', ticket)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('vsebina'));

    await poslji().expect(201);
    // Druga zahteva ne sme prepisati vsebine, ki je že prispela.
    await poslji().expect(404);
    expect(await SharedFileModel.countDocuments({ state: 'ready' })).toBe(1);
  });

  it('dve HKRATNI zahtevi za isto napoved: ena uspe, druga je zavrnjena', async () => {
    // Brez zapore (`uploadClaimedAt`) bi obe prestali preverjanje stanja — `uploading` se
    // prevesi šele na koncu — in obe pisali v isto začasno datoteko. Na disku bi ostala
    // prepletena vsebina, zapis pa bi bil videti uspešen (člen VII).
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 5, maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);
    const content = Buffer.from('natanko ta vsebina in nobena druga');

    const declared = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'racun.pdf', byteSize: content.byteLength })
      .expect(201);

    const poslji = () =>
      request(app)
        .put(`/api/v1/drop/${inbox.token}/files/${declared.body.id}/content`)
        .set('X-Drop-Ticket', ticket)
        .set('Content-Type', 'application/octet-stream')
        .send(content);

    const [prva, druga] = await Promise.all([poslji(), poslji()]);
    expect([prva.status, druga.status].sort()).toEqual([201, 404]);

    // Vsebina pri lastniku je natanko ena in cela.
    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.files).toHaveLength(1);
    const download = await request(app)
      .get(`/api/v1/files/${list.body.files[0].id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Buffer.from(download.body).equals(content)).toBe(true);
  });
});

describe('Oddaja: napovedana velikost je zavezujoča (FR-089)', () => {
  it('Content-Length, večji od napovedanega, je zavrnjen in ne pusti ničesar', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    // Napoved 5 bajtov, telo 2000 bajtov: zavrnjeno, preden se odpre datoteka na disku.
    const { declared, uploaded } = await dropFile(app, inbox.token, ticket, Buffer.alloc(2000, 1), {
      declaredSize: 5,
    });
    expect(declared.status).toBe(201);
    expect(uploaded!.status).toBe(413);

    // Bistvo je INVARIANTA: nič v stanju `ready`, nič na seznamu.
    expect(await SharedFileModel.countDocuments({ state: 'ready' })).toBe(0);
    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.files).toHaveLength(0);
  });

  it('Content-Length, manjši od napovedanega, ne da datoteke v stanju `ready`', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    // Napove 500 bajtov, pošlje 10: tiho shranjena okrnjena datoteka je natanko tisto, česar ne
    // sme biti (člen VII). Zapisa v `ready` zato ni.
    const { uploaded } = await dropFile(app, inbox.token, ticket, Buffer.alloc(10, 1), { declaredSize: 500 });
    expect(uploaded!.status).not.toBe(201);
    expect(await SharedFileModel.countDocuments({ state: 'ready' })).toBe(0);
  });

  it('prazno telo je 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const declared = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'prazna.bin', byteSize: 10 })
      .expect(201);

    await request(app)
      .put(`/api/v1/drop/${inbox.token}/files/${declared.body.id}/content`)
      .set('X-Drop-Ticket', ticket)
      .set('Content-Type', 'application/octet-stream')
      .set('Content-Length', '0')
      .send()
      .expect(400);
  });

  it('napovedana velikost 0 je 400 že pri napovedi', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token);
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'prazna.bin', byteSize: 0 })
      .expect(400);
  });

  it('napoved nad mejo namestitve je 413, še preden priteče bajt', async () => {
    setTestEnv({ FILE_SHARE_MAX_MB: '1' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 100 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const res = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'velika.bin', byteSize: 2 * 1024 * 1024 })
      .expect(413);
    expect(res.body.detail).toContain('1 MB');
    expect(await SharedFileModel.countDocuments({})).toBe(0);
  });

  it('vsebina brez Content-Length je 400 — brez napovedi ni mogoče preveriti ničesar', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const declared = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'racun.pdf', byteSize: 7 })
      .expect(201);

    // `Transfer-Encoding: chunked` pomeni telo brez napovedane dolžine.
    const res = await request(app)
      .put(`/api/v1/drop/${inbox.token}/files/${declared.body.id}/content`)
      .set('X-Drop-Ticket', ticket)
      .set('Content-Type', 'application/octet-stream')
      .set('Transfer-Encoding', 'chunked')
      .send(Buffer.from('vsebina'))
      .catch((err: unknown) => ({ status: 0, error: err }) as { status: number });
    expect(res.status).not.toBe(201);
    expect(await SharedFileModel.countDocuments({ state: 'ready' })).toBe(0);
  });
});

describe('Oddaja: vrsta telesa', () => {
  it('telo, napovedano kot JSON, je 415 — sicer bi ga požrl razčlenjevalnik in datoteka bi bila prazna', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const declared = await request(app)
      .post(`/api/v1/drop/${inbox.token}/files`)
      .set('X-Drop-Ticket', ticket)
      .send({ fileName: 'racun.pdf', byteSize: 12 })
      .expect(201);

    await request(app)
      .put(`/api/v1/drop/${inbox.token}/files/${declared.body.id}/content`)
      .set('X-Drop-Ticket', ticket)
      .set('Content-Type', 'application/json')
      .send('{"a":"bcd"}')
      .expect(415);
    expect(await SharedFileModel.countDocuments({ state: 'ready' })).toBe(0);
  });

  it('obrazec je 415 — na disk bi se zapisale meje obrazca skupaj z vsebino', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    const { uploaded } = await dropFile(app, inbox.token, ticket, Buffer.from('vsebina'), {
      contentType: 'multipart/form-data; boundary=----x',
    });
    expect(uploaded!.status).toBe(415);
  });

  it('prava vrsta datoteke (npr. image/png) je sprejeta — vsebina se ne pregleduje (FR-095)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);

    // Vsebina namenoma NI pravi PNG: strežnik je ne dekodira in ne preverja.
    const { uploaded } = await dropFile(app, inbox.token, ticket, Buffer.from('to ni png'), {
      contentType: 'image/png',
      fileName: 'slika.png',
    });
    expect(uploaded!.status).toBe(201);
  });
});

describe('Predal je enosmeren (FR-086)', () => {
  it('po javni poti ni mogoče prebrati, kaj je v predalu, niti prenesti oddanega', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxTotalMb: 5 });
    const { ticket } = await unlockDrop(app, inbox.token, inbox.code);
    const { declared } = await dropFile(app, inbox.token, ticket, Buffer.from('skrivnost'), {
      fileName: 'skrivnost.txt',
    });

    // Seznama ni: GET na napovedno pot ne obstaja.
    await request(app).get(`/api/v1/drop/${inbox.token}/files`).set('X-Drop-Ticket', ticket).expect(404);
    // Prenosa oddane vsebine po tej poti ni: `content` je samo PUT.
    await request(app)
      .get(`/api/v1/drop/${inbox.token}/files/${declared.body.id}/content`)
      .set('X-Drop-Ticket', ticket)
      .expect(404);
    // Brisanja ni.
    await request(app)
      .delete(`/api/v1/drop/${inbox.token}/files/${declared.body.id}/content`)
      .set('X-Drop-Ticket', ticket)
      .expect(404);
    // In dovolilnica predala ne odpre lastnikove poti.
    await request(app).get('/api/v1/files').set('X-Drop-Ticket', ticket).expect(401);
  });

  it('potrdilo o oddaji ne razkrije ničesar o drugih datotekah v predalu', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const inbox = await createInbox(app, token, { maxFiles: 3, maxTotalMb: 5 });
    const prvi = await unlockDrop(app, inbox.token, inbox.code);
    await dropFile(app, inbox.token, prvi.ticket, Buffer.from('tuja skrivnost'), {
      fileName: 'tuja-skrivnost.pdf',
      senderName: 'Nekdo drug',
    });

    // Drug pošiljatelj z isto kodo ne sme videti, kaj je oddal prvi.
    const drugi = await unlockDrop(app, inbox.token, inbox.code);
    expect(JSON.stringify(drugi.res.body)).not.toContain('tuja-skrivnost');
    expect(JSON.stringify(drugi.res.body)).not.toContain('Nekdo drug');

    const { uploaded } = await dropFile(app, inbox.token, drugi.ticket, Buffer.from('moja'), {
      fileName: 'moja.pdf',
    });
    expect(JSON.stringify(uploaded!.body)).not.toContain('tuja-skrivnost');
  });
});
