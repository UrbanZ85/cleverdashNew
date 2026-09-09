import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, loginTwo, seedGroupFixture, seedLinkFixture } from './_helpers.js';

// Pogodbeni testi urejanja, brisanja in ponovnega branja strani (008, US4).
//
// Jedro te datoteke je FR-014: ROČNI VNOS IMA VEDNO PREDNOST. Samodejno branje sme ime
// prepisati samo, kadar je bilo samodejno — ali kadar uporabnik to izrecno zahteva s `force`.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});

const realFetch = globalThis.fetch;

function stubPage(title: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('127.0.0.1') || url.includes('localhost')) return realFetch(input, init);
      return new Response(`<head><title>${title}</title></head>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }),
  );
}

describe('PATCH /saved-links/{linkId}', () => {
  it('poslano ime postavi titleSource: manual (FR-014)', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, { title: 'primer.si', titleSource: 'auto' });

    const res = await request(app)
      .patch(`/api/v1/saved-links/${link._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Moje ime' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Moje ime');
    expect(res.body.titleSource).toBe('manual');
  });

  it('popravi komentar, ikono in mapo; izpuščena polja ostanejo', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const group = await seedGroupFixture(userId, { name: 'Delo' });
    const link = await seedLinkFixture(userId, { title: 'Doma', comment: 'star komentar' });

    const res = await request(app)
      .patch(`/api/v1/saved-links/${link._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: 'nov komentar', icon: 'time-outline', groupId: String(group._id) });

    expect(res.body.comment).toBe('nov komentar');
    expect(res.body.icon).toBe('time-outline');
    expect(res.body.groupId).toBe(String(group._id));
    // Ime ni bilo poslano, zato se ni spremenilo — in ni postalo "manual".
    expect(res.body.title).toBe('Doma');
    expect(res.body.titleSource).toBe('auto');
  });

  it('comment: null pobriše komentar (pomenska vrednost, ne "ne spreminjaj")', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, { comment: 'nekaj' });

    const res = await request(app)
      .patch(`/api/v1/saved-links/${link._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: null });

    expect(res.body.comment).toBeNull();
  });

  it('sprememba naslova ga NORMALIZIRA in NE sproži branja strani', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, { title: 'Ročno ime', titleSource: 'manual' });

    const fetchSpy = vi.fn(async (input: string | URL, init?: RequestInit) => realFetch(input, init));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await request(app)
      .patch(`/api/v1/saved-links/${link._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: ' nov-naslov.si/pot ' });

    expect(res.body.url).toBe('https://nov-naslov.si/pot');
    // Nobenega klica na nov-naslov.si — popravek naslova ni tih odhodni klic.
    const outbound = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('nov-naslov.si'));
    expect(outbound).toEqual([]);
  });

  it('neveljaven nov naslov vrne 400', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId);

    const res = await request(app)
      .patch(`/api/v1/saved-links/${link._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'javascript:alert(1)' });

    expect(res.status).toBe(400);
  });

  it('tuj zapis vrne 404, ne 403 (FR-006)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedLinkFixture(b.userId);

    const res = await request(app)
      .patch(`/api/v1/saved-links/${foreign._id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ title: 'Prevzeto' });

    expect(res.status).toBe(404);
  });
});

describe('POST /saved-links/{linkId}/refresh-metadata', () => {
  it('brez force ROČNEGA imena NE prepiše (FR-014, quickstart §3.4)', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, {
      url: 'https://primer.si/',
      title: 'Moje ime',
      titleSource: 'manual',
    });
    stubPage('Ime s strani');

    const res = await request(app)
      .post(`/api/v1/saved-links/${link._id}/refresh-metadata`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Moje ime');
    expect(res.body.titleSource).toBe('manual');
    // Stran JE bila prebrana — favicon in stanje se osvežita tudi takrat, ko ime ostane.
    expect(res.body.metadataStatus).toBe('ok');
    expect(res.body.hasFavicon).toBe(true);
  });

  it('s force: true ročno ime PREPIŠE ("prevzemi ime s strani")', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, {
      url: 'https://primer.si/',
      title: 'Moje ime',
      titleSource: 'manual',
    });
    stubPage('Ime s strani');

    const res = await request(app)
      .post(`/api/v1/saved-links/${link._id}/refresh-metadata`)
      .set('Authorization', `Bearer ${token}`)
      .send({ force: true });

    expect(res.body.title).toBe('Ime s strani');
    // Prevzeto ime je od tu naprej samodejno — naslednje osveževanje ga sme popraviti.
    expect(res.body.titleSource).toBe('auto');
  });

  it('samodejno ime osveži brez force', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, {
      url: 'https://primer.si/',
      title: 'primer.si',
      titleSource: 'auto',
    });
    stubPage('Pravo ime');

    const res = await request(app)
      .post(`/api/v1/saved-links/${link._id}/refresh-metadata`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.body.title).toBe('Pravo ime');
  });

  it('brez telesa (n8n pošlje prazen POST) deluje kot force: false', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, { url: 'https://primer.si/', titleSource: 'auto' });
    stubPage('Pravo ime');

    const res = await request(app)
      .post(`/api/v1/saved-links/${link._id}/refresh-metadata`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Pravo ime');
  });

  it('zasebni naslov vrne 200 z metadataStatus skipped — to ni napaka', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, { url: 'http://192.168.1.1/', title: '192.168.1.1' });

    const res = await request(app)
      .post(`/api/v1/saved-links/${link._id}/refresh-metadata`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.metadataStatus).toBe('skipped');
  });

  it('tuj zapis vrne 404', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedLinkFixture(b.userId);

    const res = await request(app)
      .post(`/api/v1/saved-links/${foreign._id}/refresh-metadata`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('GET in DELETE /saved-links/{linkId}', () => {
  it('GET vrne en zapis', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, { title: 'Doma' });

    const res = await request(app)
      .get(`/api/v1/saved-links/${link._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: String(link._id), title: 'Doma' });
  });

  it('DELETE vrne 204 in nato GET vrne 404', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId);

    const del = await request(app)
      .delete(`/api/v1/saved-links/${link._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const res = await request(app)
      .get(`/api/v1/saved-links/${link._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('neveljaven ID vrne 404, ne 500 (CastError)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);

    const res = await request(app)
      .get('/api/v1/saved-links/ni-objectid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('brisanje tujega zapisa vrne 404 in ga ne izbriše', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedLinkFixture(b.userId);

    const res = await request(app)
      .delete(`/api/v1/saved-links/${foreign._id}`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(404);
    const still = await request(app)
      .get(`/api/v1/saved-links/${foreign._id}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(still.status).toBe(200);
  });
});
