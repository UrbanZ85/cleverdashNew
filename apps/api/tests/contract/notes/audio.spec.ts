import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { SettingsModel } from '../../../src/modules/settings/model.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import { FAKE_AUDIO, loginAndUnlock, seedNoteFixture } from './_helpers.js';

// Pogodbeni testi zvočnih posnetkov beležke (007) — vključno z DVOJNO ključavnico pred
// pošiljanjem posnetka zunanji storitvi za prepis (domain/transcription-gate.ts).

const TRANSCRIPTION_URL = 'https://transcribe.example.com/v1/audio/transcriptions';

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  // `setTestEnv` samo PREPIŠE navedene ključe in ne pobriše prej nastavljenih, zato bi test,
  // ki nastavi storitev za prepis, "okužil" vse naslednje v tej datoteki — od tam naprej bi
  // bila videti kot nastavljena. Ključa je treba odstraniti izrecno.
  delete process.env.NOTES_TRANSCRIPTION_URL;
  delete process.env.NOTES_TRANSCRIPTION_API_KEY;
  delete process.env.NOTES_AUDIO_MAX_MB;
  setTestEnv();
  return clearTestDb();
});

// `openid-client` (Keycloak) uporablja isti globalni `fetch` — klici proti ponarejenemu
// Keycloaku (127.0.0.1) MORAJO iti do resničnega omrežja, ne v spodnje ročne mocke.
const realFetch = globalThis.fetch;

/** Stub globalnega `fetch`, ki na naslov storitve za prepis odgovori z `body`, vse ostalo
 * (Keycloak) pa spusti naprej. */
function stubTranscription(handler: () => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).startsWith(TRANSCRIPTION_URL)) return handler();
      return realFetch(input, init);
    }),
  );
}

async function uploadAudio(app: Awaited<ReturnType<typeof createApp>>['app'], noteId: string, token: string, query = '') {
  return request(app)
    .post(`/api/v1/notes/${noteId}/audio${query}`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'audio/webm')
    .send(FAKE_AUDIO);
}

describe('POST /notes/{id}/audio', () => {
  it('shrani posnetek in vrne 201 z metapodatki, brez samih bajtov', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();

    const res = await uploadAudio(app, String(note._id), token, '?durationMs=4200');

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.mimeType).toBe('audio/webm');
    expect(res.body.byteSize).toBe(FAKE_AUDIO.byteLength);
    expect(res.body.durationMs).toBe(4200);
    expect(res.body.transcriptStatus).toBe('none');
    // Bajti posnetka niso del nobenega odgovora s metapodatki — samo endpoint za predvajanje
    // jih vrne (note-audio.model.ts, `select: false`).
    expect(res.body.data).toBeUndefined();
  });

  it('prepis iz brskalnika se shrani skupaj s posnetkom', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();

    const res = await uploadAudio(app, String(note._id), token, '?transcript=Narekovano%20besedilo');

    expect(res.status).toBe(201);
    expect(res.body.transcript).toBe('Narekovano besedilo');
    expect(res.body.transcriptSource).toBe('browser');
    expect(res.body.transcriptStatus).toBe('done');
  });

  it('vrsta vsebine, ki ni zvok, je zavrnjena s 415', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();

    const res = await request(app)
      .post(`/api/v1/notes/${note._id}/audio`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.4'));

    expect(res.status).toBe(415);
  });

  it('prevelik posnetek vrne 413 z mejo, ne 500', async () => {
    setTestEnv({ NOTES_AUDIO_MAX_MB: '1' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();

    const res = await request(app)
      .post(`/api/v1/notes/${note._id}/audio`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'audio/webm')
      .send(Buffer.alloc(1024 * 1024 + 1024, 7));

    expect(res.status).toBe(413);
    expect(res.body.detail).toContain('1 MB');
  });

  it('posnetek k tuji beležki ni mogoč (404, ne 403)', async () => {
    const { app } = await createApp();
    const mine = await loginAsTestUser(app, fakeKeycloak, { sub: 'kc-a', email: 'a@example.com', roles: ['cleverdash-admin'] });
    const theirs = await loginAsTestUser(app, fakeKeycloak, { sub: 'kc-b', email: 'b@example.com', roles: ['cleverdash-admin'] });
    const note = await seedNoteFixture({ userId: theirs.userId });

    const res = await uploadAudio(app, String(note._id), mine.accessToken);
    expect(res.status).toBe(404);
  });
});

describe('GET /notes/{id}/audio/{audioId}', () => {
  it('vrne bajte posnetka z njegovo vrsto in zasebnim predpomnjenjem', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();
    const created = await uploadAudio(app, String(note._id), token);

    const res = await request(app)
      .get(`/api/v1/notes/${note._id}/audio/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/webm');
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    expect(Buffer.from(res.body).equals(FAKE_AUDIO)).toBe(true);
  });

  it('brez avtentikacije vrne 401 — posnetek glasu ni javen', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();
    const created = await uploadAudio(app, String(note._id), token);

    const res = await request(app).get(`/api/v1/notes/${note._id}/audio/${created.body.id}`);
    expect(res.status).toBe(401);
  });
});

describe('DELETE /notes/{id}', () => {
  it('izbriše tudi posnetke beležke', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();
    const created = await uploadAudio(app, String(note._id), token);

    await request(app).delete(`/api/v1/notes/${note._id}`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/v1/notes/${note._id}/audio/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('prepis na strežniku — dvojna ključavnica', () => {
  it('brez ključa v okolju: 409 in posnetek ostane doma', async () => {
    // Privzeto testno okolje storitve za prepis NIMA nastavljene.
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();

    const res = await uploadAudio(app, String(note._id), token, '?transcribe=true');

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('NOTES_TRANSCRIPTION_URL');
  });

  it('s ključem, a brez privolitve v nastavitvah: 409 z napotkom, kje jo vklopiti', async () => {
    setTestEnv({ NOTES_TRANSCRIPTION_URL: TRANSCRIPTION_URL, NOTES_TRANSCRIPTION_API_KEY: 'test-key' });
    const fetchSpy = vi.fn();
    stubTranscription(() => {
      fetchSpy();
      return new Response('{}', { status: 200 });
    });

    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();

    const res = await uploadAudio(app, String(note._id), token, '?transcribe=true');

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('Nastavitve');
    // Bistvo te varovalke: posnetek NI bil poslan nikamor.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('s ključem IN privolitvijo: posnetek se prepiše in besedilo je shranjeno', async () => {
    setTestEnv({ NOTES_TRANSCRIPTION_URL: TRANSCRIPTION_URL, NOTES_TRANSCRIPTION_API_KEY: 'test-key' });
    stubTranscription(
      () =>
        new Response(JSON.stringify({ text: 'To je prepisano besedilo.' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const { app } = await createApp();
    const { accessToken: token, userId } = await loginAsTestUser(app, fakeKeycloak, {
      roles: ['cleverdash-admin'],
    });
    await SettingsModel.findOneAndUpdate(
      { userId },
      { $set: { notes: { serverTranscription: true } } },
      { upsert: true },
    );
    const note = await seedNoteFixture({ userId });

    const res = await uploadAudio(app, String(note._id), token, '?transcribe=true');

    expect(res.status).toBe(201);
    expect(res.body.transcript).toBe('To je prepisano besedilo.');
    expect(res.body.transcriptSource).toBe('server');
    expect(res.body.transcriptStatus).toBe('done');
  });

  it('spodletela storitev: posnetek se vseeno shrani, z zapisanim razlogom', async () => {
    // Člen VI: tiha napaka je hrošč. Uporabnik mora dobiti posnetek IN vedeti, da prepisa ni.
    setTestEnv({ NOTES_TRANSCRIPTION_URL: TRANSCRIPTION_URL, NOTES_TRANSCRIPTION_API_KEY: 'test-key' });
    stubTranscription(() => new Response('quota exceeded', { status: 429 }));

    const { app } = await createApp();
    const { accessToken: token, userId } = await loginAsTestUser(app, fakeKeycloak, {
      roles: ['cleverdash-admin'],
    });
    await SettingsModel.findOneAndUpdate(
      { userId },
      { $set: { notes: { serverTranscription: true } } },
      { upsert: true },
    );
    const note = await seedNoteFixture({ userId });

    const res = await uploadAudio(app, String(note._id), token, '?transcribe=true');

    expect(res.status).toBe(201);
    expect(res.body.transcriptStatus).toBe('failed');
    expect(res.body.transcriptError).toContain('429');
    expect(res.body.byteSize).toBe(FAKE_AUDIO.byteLength);
  });

  it('POST /transcribe prepiše obstoječ posnetek', async () => {
    setTestEnv({ NOTES_TRANSCRIPTION_URL: TRANSCRIPTION_URL, NOTES_TRANSCRIPTION_API_KEY: 'test-key' });
    stubTranscription(
      () =>
        new Response(JSON.stringify({ text: 'Pozneje prepisano.' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const { app } = await createApp();
    const { accessToken: token, userId } = await loginAsTestUser(app, fakeKeycloak, {
      roles: ['cleverdash-admin'],
    });
    await SettingsModel.findOneAndUpdate(
      { userId },
      { $set: { notes: { serverTranscription: true } } },
      { upsert: true },
    );
    const note = await seedNoteFixture({ userId });
    const created = await uploadAudio(app, String(note._id), token);
    expect(created.body.transcriptStatus).toBe('none');

    const res = await request(app)
      .post(`/api/v1/notes/${note._id}/audio/${created.body.id}/transcribe`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe('Pozneje prepisano.');
    expect(res.body.transcriptSource).toBe('server');
  });
});

describe('GET /notes/capabilities', () => {
  it('loči “ni nastavljeno” od “ni vklopljeno”', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const notConfigured = await request(app)
      .get('/api/v1/notes/capabilities')
      .set('Authorization', `Bearer ${token}`);
    expect(notConfigured.status).toBe(200);
    expect(notConfigured.body.serverTranscription).toMatchObject({
      configured: false,
      enabled: false,
      available: false,
      reason: 'not-configured',
    });
    expect(notConfigured.body.audioMaxBytes).toBe(10 * 1024 * 1024);
  });

  it('stikalo iz UI (PUT /settings) vklopi prepis, ko je ključ nastavljen', async () => {
    // Pot, ki jo uporabnik dejansko ubere: Nastavitve → Moduli → Beležke. Zahteva je bila
    // izrecna — ključ v okolju ne zadošča, stikalo v vmesniku mora obstajati in šteti.
    setTestEnv({ NOTES_TRANSCRIPTION_URL: TRANSCRIPTION_URL, NOTES_TRANSCRIPTION_API_KEY: 'test-key' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const before = await request(app).get('/api/v1/notes/capabilities').set('Authorization', `Bearer ${token}`);
    expect(before.body.serverTranscription.available).toBe(false);

    const saved = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: { serverTranscription: true } });
    expect(saved.status).toBe(200);
    expect(saved.body.notes).toEqual({ serverTranscription: true });

    const after = await request(app).get('/api/v1/notes/capabilities').set('Authorization', `Bearer ${token}`);
    expect(after.body.serverTranscription).toMatchObject({
      configured: true,
      enabled: true,
      available: true,
      reason: null,
    });
  });

  it('nastavljen ključ brez privolitve da reason “not-enabled”', async () => {
    setTestEnv({ NOTES_TRANSCRIPTION_URL: TRANSCRIPTION_URL, NOTES_TRANSCRIPTION_API_KEY: 'test-key' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app).get('/api/v1/notes/capabilities').set('Authorization', `Bearer ${token}`);
    expect(res.body.serverTranscription).toMatchObject({
      configured: true,
      enabled: false,
      available: false,
      reason: 'not-enabled',
    });
  });
});
