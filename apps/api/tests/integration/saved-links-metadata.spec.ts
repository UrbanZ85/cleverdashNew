import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { loginAndUnlock } from '../contract/saved-links/_helpers.js';

// 008, SC-002 in SC-008: shranjevanje NE SME biti odvisno od dosegljivosti strani (FR-004),
// naslov v zasebnem omrežju pa strežnik NIKOLI ne obišče (FR-011).
//
// Drugo je tu preverjeno na edini način, ki šteje: podtaknjen `fetch` NE SME biti klican.
// Preverjanje samo prek `metadataStatus` bi prestala tudi izvedba, ki naslov obišče in izid
// zavrže — kar je natanko tisto, kar SC-008 prepoveduje.

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

/** Vrne števec klicev na TUJE naslove; klici proti ponarejenemu Keycloaku gredo naprej. */
function countOutboundFetches(handler?: (url: string) => Response) {
  const outbound: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('127.0.0.1') || url.includes('localhost')) return realFetch(input, init);
      outbound.push(url);
      if (handler) return handler(url);
      throw new TypeError('fetch failed');
    }),
  );
  return outbound;
}

describe('branje metapodatkov ob shranjevanju', () => {
  it('nedosegljiva domena: zapis OBSTANE z metadataStatus failed (FR-004, SC-002)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    const outbound = countOutboundFetches();

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://ta-domena-ne-obstaja-12345.si/' });

    expect(res.status).toBe(201);
    expect(res.body.metadataStatus).toBe('failed');
    // Ime je nadomestek — gostitelj, ne gol naslov s shemo.
    expect(res.body.title).toBe('ta-domena-ne-obstaja-12345.si');
    // Poskus JE bil: to loči `failed` od `skipped`.
    expect(outbound).toHaveLength(1);

    // In zapis je res v bazi, ne le v odgovoru.
    const list = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${token}`);
    expect(list.body.links).toHaveLength(1);
  });

  it('http://192.168.1.1: zapis nastane, strežnik pa NE opravi nobenega klica (SC-008)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    const outbound = countOutboundFetches();

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'http://192.168.1.1' });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe('http://192.168.1.1/');
    expect(res.body.metadataStatus).toBe('skipped');
    expect(res.body.title).toBe('192.168.1.1');
    // TO je jedro SC-008: nobenega odhodnega klica.
    expect(outbound).toEqual([]);
  });

  it('naslov s poverilnicami se shrani, a se ne obišče (člen IV)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    const outbound = countOutboundFetches();

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://uporabnik:geslo@primer.si/' });

    expect(res.status).toBe(201);
    expect(res.body.metadataStatus).toBe('skipped');
    expect(outbound).toEqual([]);
  });

  it('odgovor, ki ni HTML, se ne razčlenjuje in konča kot failed', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    countOutboundFetches(
      () => new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    );

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://primer.si/dokument.pdf' });

    expect(res.status).toBe(201);
    expect(res.body.metadataStatus).toBe('failed');
    expect(res.body.title).toBe('primer.si');
  });

  it('uspešno branje zapiše ime, favicon in čas branja', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    countOutboundFetches(
      () =>
        new Response('<head><title>Doma</title><link rel="icon" href="/i.png"></head>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://primer.si/' });

    expect(res.body.metadataStatus).toBe('ok');
    expect(res.body.title).toBe('Doma');
    expect(res.body.hasFavicon).toBe(true);
    expect(res.body.metadataFetchedAt).toBeTruthy();
  });
});
