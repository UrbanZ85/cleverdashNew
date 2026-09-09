import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, loginTwo, seedLinkFixture } from './_helpers.js';

// Pogodbeni testi `GET /saved-links/{linkId}/favicon` (008, US5, FR-012, člen VIII).
//
// Najpomembnejši test je zadnji v prvem bloku: DVA zapisa istega gostitelja sprožita EN
// odhodni prenos. To je celoten smisel tega, da je ključ predpomnilnika GOSTITELJ in ne zapis
// (research.md §4) — brez tega testa bi bila ta odločitev samo komentar.

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

/** Najmanjši veljaven PNG (bajti niso prava slika — strežnik je ne dekodira). */
const FAKE_PNG = Buffer.from('89504e470d0a1a0a', 'hex');

/** Vrne seznam naslovov, na katere je šel odhodni prenos. */
function stubFavicon(response: () => Response) {
  const outbound: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('127.0.0.1') || url.includes('localhost')) return realFetch(input, init);
      outbound.push(url);
      return response();
    }),
  );
  return outbound;
}

function pngResponse(): Response {
  return new Response(FAKE_PNG, { status: 200, headers: { 'content-type': 'image/png' } });
}

describe('GET /saved-links/{linkId}/favicon', () => {
  it('vrne 200 z image/* in Cache-Control: private, max-age=604800', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, {
      url: 'https://github.com/a',
      faviconUrl: 'https://github.com/favicon.ico',
    });
    stubFavicon(pngResponse);

    const res = await request(app)
      .get(`/api/v1/saved-links/${link._id}/favicon`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/');
    expect(res.headers['cache-control']).toBe('private, max-age=604800');
    expect(res.headers['x-source-fetched-at']).toBeTruthy();
    expect(Buffer.from(res.body).byteLength).toBeGreaterThan(0);
  });

  it('zapis BREZ favicona vrne 404 (ne 500) — to ni napaka za uporabnika', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, { faviconUrl: null });
    const outbound = stubFavicon(pngResponse);

    const res = await request(app)
      .get(`/api/v1/saved-links/${link._id}/favicon`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    // Brez naslova favicona ni česa prenašati — in ne prenašamo.
    expect(outbound).toEqual([]);
  });

  it('DVA zapisa istega gostitelja sprožita EN odhodni prenos (člen VIII, research.md §4)', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const first = await seedLinkFixture(userId, {
      url: 'https://github.com/prvi',
      faviconUrl: 'https://github.com/favicon.ico',
    });
    const second = await seedLinkFixture(userId, {
      url: 'https://github.com/drugi',
      faviconUrl: 'https://github.com/favicon.ico',
    });
    const outbound = stubFavicon(pngResponse);

    const a = await request(app)
      .get(`/api/v1/saved-links/${first._id}/favicon`)
      .set('Authorization', `Bearer ${token}`);
    const b = await request(app)
      .get(`/api/v1/saved-links/${second._id}/favicon`)
      .set('Authorization', `Bearer ${token}`);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(outbound).toHaveLength(1);
  });

  it('naslov favicona v zasebnem omrežju se NE prenese (varovalo velja tudi tu)', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, {
      url: 'http://192.168.1.1/',
      faviconUrl: 'http://192.168.1.1/favicon.ico',
    });
    const outbound = stubFavicon(pngResponse);

    const res = await request(app)
      .get(`/api/v1/saved-links/${link._id}/favicon`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(outbound).toEqual([]);
  });

  it('odgovor, ki ni slika (HTML na /favicon.ico), vrne 404 in se ne postreže kot slika', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, {
      url: 'https://primer.si/',
      faviconUrl: 'https://primer.si/favicon.ico',
    });
    stubFavicon(
      () => new Response('<html>404</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );

    const res = await request(app)
      .get(`/api/v1/saved-links/${link._id}/favicon`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('favicon TUJEGA zapisa vrne 404 — slika ni pot do vednosti, kaj ima kdo shranjeno', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedLinkFixture(b.userId, {
      url: 'https://github.com/tuj',
      faviconUrl: 'https://github.com/favicon.ico',
    });
    const outbound = stubFavicon(pngResponse);

    const res = await request(app)
      .get(`/api/v1/saved-links/${foreign._id}/favicon`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(404);
    expect(outbound).toEqual([]);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const { userId } = await loginAndUnlock(app);
    const link = await seedLinkFixture(userId, { faviconUrl: 'https://github.com/favicon.ico' });

    const res = await request(app).get(`/api/v1/saved-links/${link._id}/favicon`);
    expect(res.status).toBe(401);
  });
});
