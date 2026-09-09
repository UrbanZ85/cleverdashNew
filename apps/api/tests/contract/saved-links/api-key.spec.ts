import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createApp } from '../../../src/main.js';
import { ApiKeyModel } from '../../../src/platform/apikeys/model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { SavedLinkModel } from '../../../src/modules/saved-links/models/saved-link.model.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';

// US6 (P6), člen III: kar se da narediti v vmesniku, se MORA dati narediti tudi s HTTP
// klicem. n8n je prvorazreden odjemalec, ne naknadna misel (SC-007).
//
// Idempotentnost NI izvedena v tem modulu — uveljavlja jo globalni
// `platform/idempotency/middleware.ts`, vpet v `main.ts` PRED moduli. T057 je zato preverba
// in ne izvedba: ta test je edino, kar dokazuje, da modul res teče skozenj in da med izjeme
// (poti, ki izdajajo skrivnosti) ni po nesreči padel.

const SECRET = 'saved-links-test-key';

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  vi.unstubAllGlobals();
  setTestEnv();
  await clearTestDb();
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

async function seedKey(scopes: string[]): Promise<string> {
  // API ključ ni vezan na uporabnika (člen III), zato mora obstajati natanko en uporabnik, v
  // čigar imenu avtomatizacija deluje (platform/auth/automation-owner.ts).
  const user = await UserModel.create({
    keycloakSubject: 'kc-sub-automation',
    email: 'lastnik@example.com',
    displayName: 'Lastnik',
    scopes: [],
  });
  await ApiKeyModel.create({
    label: 'n8n',
    keyHash: createHash('sha256').update(SECRET).digest('hex'),
    keyPrefix: SECRET.slice(0, 8),
    scopes,
  });
  return String(user._id);
}

describe('Shranjevanje z API ključem', () => {
  it('klic z X-API-Key in obsegom uspe in zapis pripada uporabniku, ne ključu', async () => {
    const userId = await seedKey(['saved-links:read', 'saved-links:write']);
    const { app } = await createApp();
    stubPage('Agencija za okolje');

    const created = await request(app)
      .post('/api/v1/saved-links')
      .set('X-API-Key', SECRET)
      .send({ url: 'https://www.arso.gov.si/', comment: 'vreme' });

    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Agencija za okolje');

    const doc = await SavedLinkModel.findById(created.body.id).lean();
    expect(String(doc?.userId)).toBe(userId);
  });

  it('brez obsega saved-links:write vrne 403', async () => {
    await seedKey(['saved-links:read']);
    const { app } = await createApp();

    const res = await request(app)
      .post('/api/v1/saved-links')
      .set('X-API-Key', SECRET)
      .send({ url: 'https://primer.si/' });

    expect(res.status).toBe(403);
  });

  it('brez obsega saved-links:read vrne 403 tudi na branju', async () => {
    await seedKey(['saved-links:write']);
    const { app } = await createApp();

    const res = await request(app).get('/api/v1/saved-links').set('X-API-Key', SECRET);
    expect(res.status).toBe(403);
  });

  it('ponovljen POST z istim Idempotency-Key vrne prvotni odgovor in NE ustvari drugega zapisa', async () => {
    await seedKey(['saved-links:read', 'saved-links:write']);
    const { app } = await createApp();
    stubPage('Doma');

    const body = { url: 'https://primer.si/doma' };
    const first = await request(app)
      .post('/api/v1/saved-links')
      .set('X-API-Key', SECRET)
      .set('Idempotency-Key', '7c1f-test')
      .send(body);
    const second = await request(app)
      .post('/api/v1/saved-links')
      .set('X-API-Key', SECRET)
      .set('Idempotency-Key', '7c1f-test')
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    // ISTI odgovor, ne nov zapis — in `duplicateOfId` ostane `null`, kar je dokaz, da drugi
    // klic zapisa res ni ustvaril (sicer bi drugi zapis kazal na prvega).
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.duplicateOfId).toBeNull();
    expect(await SavedLinkModel.countDocuments({})).toBe(1);
  });

  it('mape in vrstni red so dosegljivi z API ključem (SC-007)', async () => {
    await seedKey(['saved-links:read', 'saved-links:write']);
    const { app } = await createApp();
    stubPage('Doma');

    const group = await request(app)
      .post('/api/v1/saved-link-groups')
      .set('X-API-Key', SECRET)
      .send({ name: 'Delo' });
    expect(group.status).toBe(201);

    const link = await request(app)
      .post('/api/v1/saved-links')
      .set('X-API-Key', SECRET)
      .send({ url: 'https://primer.si/a', groupId: group.body.id });
    expect(link.status).toBe(201);

    const order = await request(app)
      .put('/api/v1/saved-links/order')
      .set('X-API-Key', SECRET)
      .send({ groupId: group.body.id, linkIds: [link.body.id] });
    expect(order.status).toBe(204);

    const patched = await request(app)
      .patch(`/api/v1/saved-links/${link.body.id}`)
      .set('X-API-Key', SECRET)
      .send({ comment: 'iz n8n' });
    expect(patched.body.comment).toBe('iz n8n');

    const refreshed = await request(app)
      .post(`/api/v1/saved-links/${link.body.id}/refresh-metadata`)
      .set('X-API-Key', SECRET)
      .send({ force: true });
    expect(refreshed.status).toBe(200);

    const deletedGroup = await request(app)
      .delete(`/api/v1/saved-link-groups/${group.body.id}`)
      .set('X-API-Key', SECRET);
    expect(deletedGroup.body.movedLinks).toBe(1);

    const removed = await request(app)
      .delete(`/api/v1/saved-links/${link.body.id}`)
      .set('X-API-Key', SECRET);
    expect(removed.status).toBe(204);
  });

  it('napačen ključ vrne 401', async () => {
    await seedKey(['saved-links:read', 'saved-links:write']);
    const { app } = await createApp();

    const res = await request(app).get('/api/v1/saved-links').set('X-API-Key', 'napacen');
    expect(res.status).toBe(401);
  });
});
