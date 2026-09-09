import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock } from './_helpers.js';

// Pogodbeni testi `POST /saved-links` (008, US1) proti
// specs/008-saved-links/contracts/openapi.yaml.
//
// Vse tukaj teče z NEDOSEGLJIVIM naslovom (`primer.test` se ne razreši) ali s podtaknjenim
// `fetch` — noben test ne sme biti odvisen od resnične tuje strani. Bistvo US1 je prav to, da
// zapis nastane tudi takrat, ko branje strani ne uspe (FR-004).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});

// `openid-client` (Keycloak) uporablja isti globalni `fetch` — klici proti ponarejenemu
// Keycloaku (127.0.0.1) MORAJO iti do resničnega omrežja, ne v spodnje ročne mocke.
const realFetch = globalThis.fetch;

/** Stub globalnega `fetch`, ki na vse, kar ni Keycloak, odgovori z danim HTML. */
function stubPage(html: string, contentType = 'text/html; charset=utf-8') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('127.0.0.1') || url.includes('localhost')) return realFetch(input, init);
      return new Response(html, { status: 200, headers: { 'content-type': contentType } });
    }),
  );
}

describe('POST /saved-links', () => {
  it('vrne 201 v obliki CreatedSavedLink', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    stubPage('<html><head><title>Agencija za okolje</title></head></html>');

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.arso.gov.si/', comment: 'vreme' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      url: 'https://www.arso.gov.si/',
      titleSource: 'auto',
      comment: 'vreme',
      groupId: null,
      order: 0,
      duplicateOfId: null,
    });
    expect(res.body.id).toBeTruthy();
    expect(res.body.createdAt).toBeTruthy();
    // Naslov favicona NI v odgovoru — samo zastavica (člen VIII).
    expect(res.body.faviconUrl).toBeUndefined();
    expect(typeof res.body.hasFavicon).toBe('boolean');
  });

  it('prebere ime strani, kadar ga uporabnik ni vpisal (FR-010)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    stubPage('<html><head><title>Agencija za okolje</title></head></html>');

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.arso.gov.si/' });

    expect(res.body.title).toBe('Agencija za okolje');
    expect(res.body.titleSource).toBe('auto');
    expect(res.body.metadataStatus).toBe('ok');
  });

  it('vpisano ime ima prednost pred prebranim in nastavi titleSource: manual (FR-014)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    stubPage('<html><head><title>Nekaj drugega</title></head></html>');

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.arso.gov.si/', title: 'Moje vreme' });

    expect(res.body.title).toBe('Moje vreme');
    expect(res.body.titleSource).toBe('manual');
  });

  it('dopolni manjkajočo shemo v https (FR-002)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    stubPage('<html><head><title>x</title></head></html>');

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: ' primer.si/stran ' });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe('https://primer.si/stran');
  });

  it('javascript:alert(1) vrne 400 s problem+json (FR-003)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'javascript:alert(1)' });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.status).toBe(400);
    expect(res.body.detail).toContain('javascript');
  });

  it('naslov nad 2048 znaki vrne 400', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: `https://primer.si/${'a'.repeat(2100)}` });

    expect(res.status).toBe(400);
  });

  it('duplicateOfId je null pri prvem zapisu in ID prvega pri drugem enakem naslovu (FR-005)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    stubPage('<html><head><title>x</title></head></html>');

    const first = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://primer.si/a' });
    expect(first.body.duplicateOfId).toBeNull();

    // Drugi zapis NASTANE — dvojnik je dovoljen, vmesnik nanj samo opozori (research.md §10).
    const second = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: ' PRIMER.si/a ', comment: 'še enkrat, drug komentar' });

    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.duplicateOfId).toBe(first.body.id);

    const list = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${token}`);
    expect(list.body.links).toHaveLength(2);
  });

  it('nov zapis gre na VRH svoje mape (FR-033)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    stubPage('<html><head><title>x</title></head></html>');

    for (const path of ['a', 'b', 'c']) {
      await request(app)
        .post('/api/v1/saved-links')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: `https://primer.si/${path}`, title: path });
    }

    const list = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${token}`);
    expect(list.body.links.map((l: { title: string }) => l.title)).toEqual(['c', 'b', 'a']);
  });

  it('neznana mapa vrne 404 (ne 403 in ne tiho nerazvrščeno)', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://primer.si/a', groupId: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(404);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/saved-links').send({ url: 'https://primer.si/' });
    expect(res.status).toBe(401);
  });
});
