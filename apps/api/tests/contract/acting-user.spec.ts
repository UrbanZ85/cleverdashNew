import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';
import { ApiKeyModel } from '../../src/platform/apikeys/model.js';
import { createHash } from 'node:crypto';

// 012 — administrator dela v imenu drugega uporabnika (glava `X-Acting-User`).
//
// Ta datoteka je varovalka pred tremi izidi, ki bi bili vsak zase huda okvara:
//
//  1. Navaden uporabnik z glavo bere ali piše tuje podatke. Po 004 je `userId` na poizvedbi
//     EDINA izolacija med uporabniki, zato je to enakovredno odsotnosti prijave.
//  2. Admin s prevzetim imenom preklicuje tuje seje ali registrira napravo za obvestila
//     tujemu računu — oboje je bilo mogoče popraviti samo z brisanjem v bazi.
//  3. Obvisela izbira (izbrisan uporabnik, odvzeta admin vloga) ubije aplikacijo: če bi
//     `/auth/me` na tako glavo vrnil napako, odjemalec ne bi nikoli izvedel, da mora izbiro
//     pozabiti.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function loginAdmin(app: Parameters<typeof loginAsTestUser>[0]) {
  return loginAsTestUser(app, fakeKeycloakForTests, {
    sub: 'kc-sub-admin',
    email: 'admin@agenda.si',
    name: 'Admin Adminovic',
    roles: ['cleverdash-admin'],
  });
}

async function loginUser(app: Parameters<typeof loginAsTestUser>[0], key: string) {
  return loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-${key}`,
    email: `${key}.priimek@agenda.si`,
    name: `Ime ${key.toUpperCase()}`,
    roles: ['cleverdash-user'],
  });
}

async function seedApiKey(scopes: string[]): Promise<string> {
  const secret = 'cd_test_acting_user_key';
  await ApiKeyModel.create({
    label: 'test',
    scopes,
    keyHash: createHash('sha256').update(secret).digest('hex'),
    keyPrefix: secret.slice(0, 8),
  });
  return secret;
}

describe('X-Acting-User — dovolilnica', () => {
  it('navaden uporabnik z glavo dobi 403 in NE tujih podatkov', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const plain = await loginUser(app, 'a');

    await request(app)
      .post('/api/v1/notes')
      .set({ Authorization: `Bearer ${target.accessToken}` })
      .send({ title: 'Tuja beležka', body: 'ne sme uiti' })
      .expect(201);

    const res = await request(app)
      .get('/api/v1/notes')
      .set({ Authorization: `Bearer ${plain.accessToken}`, 'X-Acting-User': target.userId });

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('Tuja beležka');
  });

  it('API ključ z glavo dobi 403 — člen III: ključ sam po sebi ni admin', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const secret = await seedApiKey(['admin', 'notes:read']);

    const res = await request(app)
      .get('/api/v1/notes')
      .set({ 'X-API-Key': secret, 'X-Acting-User': target.userId });

    expect(res.status).toBe(403);
  });

  it('neobstoječ (ali izbrisan) uporabnik da 404, ne tihe vrnitve na lastne podatke', async () => {
    const { app } = await createApp();
    const admin = await loginAdmin(app);

    const neveljaven = await request(app)
      .get('/api/v1/notes')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': 'to-ni-objectid' });
    expect(neveljaven.status).toBe(404);

    const obrisan = await request(app)
      .get('/api/v1/notes')
      .set({
        Authorization: `Bearer ${admin.accessToken}`,
        'X-Acting-User': '0123456789ab0123456789ab',
      });
    expect(obrisan.status).toBe(404);
  });

  it('prevzem SVOJEGA imena je brez učinka in ne napaka', async () => {
    const { app } = await createApp();
    const admin = await loginAdmin(app);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': admin.userId });

    expect(res.status).toBe(200);
    expect(res.body.actingAs).toBeNull();
  });
});

describe('X-Acting-User — podatki izbranega uporabnika', () => {
  it('admin bere in piše beležke izbranega uporabnika, svoje pa ostanejo ločene', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const admin = await loginAdmin(app);

    await request(app)
      .post('/api/v1/notes')
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .send({ title: 'Adminova lastna' })
      .expect(201);

    // Pisanje v imenu drugega.
    const created = await request(app)
      .post('/api/v1/notes')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': target.userId })
      .send({ title: 'Za uporabnika B' })
      .expect(201);

    // Zapis res PRIPADA izbranemu uporabniku — vidi ga s svojim žetonom, brez vsake glave.
    const targetView = await request(app)
      .get('/api/v1/notes')
      .set({ Authorization: `Bearer ${target.accessToken}` });
    expect(targetView.body.notes.map((n: { id: string }) => n.id)).toContain(created.body.id);
    expect(targetView.body.notes.map((n: { title: string }) => n.title)).toEqual(['Za uporabnika B']);

    // Adminov lasten seznam se ni pomešal.
    const adminView = await request(app)
      .get('/api/v1/notes')
      .set({ Authorization: `Bearer ${admin.accessToken}` });
    expect(adminView.body.notes.map((n: { title: string }) => n.title)).toEqual(['Adminova lastna']);

    // Branje z glavo pokaže tujega in ne svojega.
    const actingView = await request(app)
      .get('/api/v1/notes')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': target.userId });
    expect(actingView.body.notes.map((n: { title: string }) => n.title)).toEqual(['Za uporabnika B']);
  });

  it('nastavitve (tema) se shranijo izbranemu uporabniku, ne adminu', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const admin = await loginAdmin(app);

    await request(app)
      .put('/api/v1/settings')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': target.userId })
      .send({ theme: 'dark' })
      .expect(200);

    const targetSettings = await request(app)
      .get('/api/v1/settings')
      .set({ Authorization: `Bearer ${target.accessToken}` });
    expect(targetSettings.body.theme).toBe('dark');

    const adminSettings = await request(app)
      .get('/api/v1/settings')
      .set({ Authorization: `Bearer ${admin.accessToken}` });
    expect(adminSettings.body.theme).not.toBe('dark');
  });
});

describe('X-Acting-User — kar OSTANE adminovo', () => {
  it('GET /auth/me pove prijavljenega in koga je prevzel (zamaskirana e-pošta)', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const admin = await loginAdmin(app);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': target.userId });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(admin.userId);
    expect(res.body.email).toBe('admin@agenda.si');
    expect(res.body.scopes).toContain('admin');
    expect(res.body.actingAs).toEqual({
      id: target.userId,
      displayName: 'Ime B',
      initials: 'IB',
      emailHint: 'b…k@agenda.si',
    });
    // Cel naslov izbranega uporabnika se ne vrne nikoli (ista projekcija kot `GET /users`).
    expect(JSON.stringify(res.body)).not.toContain('b.priimek@agenda.si');
  });

  it('seje ostanejo adminove — prevzem imena ne pokaže in ne prekliče tujih', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const admin = await loginAdmin(app);

    const res = await request(app)
      .get('/api/v1/auth/sessions')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': target.userId });

    expect(res.status).toBe(200);
    // Natanko ena seja — adminova lastna, označena kot trenutna ni (piškotka v tej zahtevi ni).
    expect(res.body).toHaveLength(1);

    // Tuje seje ni mogoče preklicati niti s poznanim identifikatorjem. Seznam sej zahteva
    // dostopni žeton (`requireScopes()`), ne le sejni piškotek, zato tudi tu Authorization.
    const targetSessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set({ Authorization: `Bearer ${target.accessToken}` });
    const targetSessionId = targetSessions.body[0].id as string;
    const del = await request(app)
      .delete(`/api/v1/auth/sessions/${targetSessionId}`)
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': target.userId });
    expect(del.status).toBe(404);

    // Seja izbranega uporabnika je še živa.
    const stillThere = await request(app)
      .get('/api/v1/auth/sessions')
      .set({ Authorization: `Bearer ${target.accessToken}` });
    expect(stillThere.body).toHaveLength(1);
  });

  it('naprava za obvestila se registrira adminu, ne izbranemu uporabniku', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const admin = await loginAdmin(app);

    await request(app)
      .post('/api/v1/devices')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': target.userId })
      .send({ pushToken: 'token-adminovega-brskalnika', platform: 'web' })
      .expect(201);

    const adminDevices = await request(app)
      .get('/api/v1/devices')
      .set({ Authorization: `Bearer ${admin.accessToken}` });
    expect(adminDevices.body).toHaveLength(1);

    const targetDevices = await request(app)
      .get('/api/v1/devices')
      .set({ Authorization: `Bearer ${target.accessToken}` });
    expect(targetDevices.body).toHaveLength(0);
  });
});

describe('X-Acting-User — idempotentnost', () => {
  it('isti Idempotency-Key v imenu DRUGEGA uporabnika NE vrne shranjenega tujega odgovora', async () => {
    const { app } = await createApp();
    const prvi = await loginUser(app, 'b');
    const drugi = await loginUser(app, 'c');
    const admin = await loginAdmin(app);

    const key = 'kljuc-za-oba';
    const body = { title: 'Enaka beležka' };

    const a = await request(app)
      .post('/api/v1/notes')
      .set({
        Authorization: `Bearer ${admin.accessToken}`,
        'X-Acting-User': prvi.userId,
        'Idempotency-Key': key,
      })
      .send(body)
      .expect(201);

    // Ista vrednost ključa, ISTO telo, DRUG uporabnik. Prevzeto ime je del identitete ključa
    // (platform/idempotency/middleware.ts, `subjectOf`), zato je to za modul neujemanje
    // klicatelja — in ta ima za tak primer svoje, starejše pravilo: `422`, ne dva veljavna
    // zapisa (glej opombo pri indeksu v platform/idempotency/model.ts).
    //
    // Pomembno tu ni število, ampak česa NE dobimo: shranjenega odgovora prve zahteve. Brez
    // prevzetega imena v ključu bi bil odgovor `200` z BELEŽKO PRVEGA uporabnika, drugemu pa
    // se ne bi ustvarilo nič — tuja beležka bi se prikazala kot njegova.
    const b = await request(app)
      .post('/api/v1/notes')
      .set({
        Authorization: `Bearer ${admin.accessToken}`,
        'X-Acting-User': drugi.userId,
        'Idempotency-Key': key,
      })
      .send(body);

    expect(b.status).toBe(422);
    expect(JSON.stringify(b.body)).not.toContain(a.body.id);

    // Beležka je nastala natanko enemu in nobena ni pri drugem.
    const prviSeznam = await request(app)
      .get('/api/v1/notes')
      .set({ Authorization: `Bearer ${prvi.accessToken}` });
    expect(prviSeznam.body.notes.map((n: { id: string }) => n.id)).toEqual([a.body.id]);

    const drugiSeznam = await request(app)
      .get('/api/v1/notes')
      .set({ Authorization: `Bearer ${drugi.accessToken}` });
    expect(drugiSeznam.body.notes).toHaveLength(0);
  });

  it('PONOVLJENA zahteva za istega uporabnika se še vedno ne izvede dvakrat', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const admin = await loginAdmin(app);

    const headers = {
      Authorization: `Bearer ${admin.accessToken}`,
      'X-Acting-User': target.userId,
      'Idempotency-Key': 'isti-kljuc-isti-uporabnik',
    };
    const body = { title: 'Samo enkrat' };

    const prva = await request(app).post('/api/v1/notes').set(headers).send(body).expect(201);
    const ponovitev = await request(app).post('/api/v1/notes').set(headers).send(body).expect(201);

    expect(ponovitev.body.id).toBe(prva.body.id);
    const seznam = await request(app)
      .get('/api/v1/notes')
      .set({ Authorization: `Bearer ${target.accessToken}` });
    expect(seznam.body.notes).toHaveLength(1);
  });
});

describe('X-Acting-User — obvisela izbira se da popraviti', () => {
  it('GET /auth/me odgovori tudi z glavo, ki ne velja več, in vrne actingAs: null', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const admin = await loginAdmin(app);

    await UserModel.deleteOne({ _id: target.userId });

    // Prav na tem odgovoru temelji samopopravek na webu (CurrentUserService): če bi bila tu
    // napaka, bi odjemalec obvisel z glavo, ki jo strežnik povsod zavrne.
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${admin.accessToken}`, 'X-Acting-User': target.userId });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(admin.userId);
    expect(res.body.actingAs).toBeNull();
  });

  it('GET /auth/me odgovori tudi navadnemu uporabniku z glavo (odvzeta admin vloga)', async () => {
    const { app } = await createApp();
    const target = await loginUser(app, 'b');
    const plain = await loginUser(app, 'a');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${plain.accessToken}`, 'X-Acting-User': target.userId });

    expect(res.status).toBe(200);
    expect(res.body.actingAs).toBeNull();
  });
});
