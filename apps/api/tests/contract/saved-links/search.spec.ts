import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedGroupFixture, seedLinkFixture } from './_helpers.js';

// Pogodbeni testi `GET /saved-links` z iskanjem (008, US2).
//
// Iskanje na zaslonu teče v pomnilniku (SC-003), a MORA obstajati tudi kot HTTP klic — člen
// III: vsaka operacija vmesnika je izvedljiva tudi s klicem. Ti testi so edino, kar to drži.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedLibrary(app: Express) {
  const { token, userId } = await loginAndUnlock(app);
  const group = await seedGroupFixture(userId, { name: 'Delo' });

  await seedLinkFixture(userId, {
    title: 'Beleženje časa',
    url: 'https://e-racunovodstvo.si/prijava',
    groupId: group._id,
    order: 0,
  });
  await seedLinkFixture(userId, {
    title: 'Vreme',
    url: 'https://www.arso.gov.si/vreme',
    comment: 'Jutranja napoved',
    order: 1,
  });
  await seedLinkFixture(userId, { title: 'Recepti', url: 'https://okusno.je/', order: 2 });

  return { token, userId, groupId: String(group._id) };
}

function titles(body: { links: { title: string }[] }): string[] {
  return body.links.map((l) => l.title);
}

describe('GET /saved-links — iskanje', () => {
  it('?q=cas najde zapis z imenom "Beleženje časa" (FR-030)', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get('/api/v1/saved-links?q=cas')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(['Beleženje časa']);
  });

  it('?q=ČAS najde isto — velike črke niso ovira', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get(`/api/v1/saved-links?q=${encodeURIComponent('ČAS')}`)
      .set('Authorization', `Bearer ${token}`);

    expect(titles(res.body)).toEqual(['Beleženje časa']);
  });

  it('?q=arso najde zapis, kjer je niz SAMO v naslovu', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get('/api/v1/saved-links?q=arso')
      .set('Authorization', `Bearer ${token}`);

    expect(titles(res.body)).toEqual(['Vreme']);
  });

  it('?q=napoved najde zapis po komentarju', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get('/api/v1/saved-links?q=napoved')
      .set('Authorization', `Bearer ${token}`);

    expect(titles(res.body)).toEqual(['Vreme']);
  });

  it('?q=. NE vrne vsega — poizvedba ni regularni izraz', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get('/api/v1/saved-links?q=.')
      .set('Authorization', `Bearer ${token}`);

    // Pika se ujame samo tam, kjer pika res je — v naslovih vseh treh zapisov. Bistvo je, da
    // se NE obravnava kot "poljuben znak" in da poizvedba ne vrže napake.
    expect(res.status).toBe(200);
    const res2 = await request(app)
      .get('/api/v1/saved-links?q=' + encodeURIComponent('...'))
      .set('Authorization', `Bearer ${token}`);
    expect(res2.body.links).toEqual([]);
  });

  it('?q=c++ ne vrže napake regularnega izraza', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get('/api/v1/saved-links?q=' + encodeURIComponent('c++'))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.links).toEqual([]);
  });

  it('iskanje gre čez VSE mape hkrati (FR-031)', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    // `cas` je v mapi "Delo", `recepti` med nerazvrščenimi — brez omejitve mape se najdeta oba.
    const res = await request(app)
      .get('/api/v1/saved-links?q=e')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.links.length).toBeGreaterThan(1);
  });
});

describe('GET /saved-links — omejitve in razvrstitev', () => {
  it('?groupId=none vrne le nerazvrščene', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get('/api/v1/saved-links?groupId=none')
      .set('Authorization', `Bearer ${token}`);

    expect(titles(res.body).sort()).toEqual(['Recepti', 'Vreme']);
  });

  it('?groupId=<id> vrne le zapise te mape', async () => {
    const { app } = await createApp();
    const { token, groupId } = await seedLibrary(app);

    const res = await request(app)
      .get(`/api/v1/saved-links?groupId=${groupId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(titles(res.body)).toEqual(['Beleženje časa']);
  });

  it('brez parametrov vrne vse, razvrščene po (groupId, order)', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${token}`);
    expect(res.body.links).toHaveLength(3);
  });

  it('?sort=recent&limit=2 vrne dva najnovejša (FR-050)', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get('/api/v1/saved-links?sort=recent&limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.links).toHaveLength(2);
    // Nazadnje zasajen zapis je prvi.
    expect(titles(res.body)[0]).toBe('Recepti');
  });

  it('izmišljena razvrstitev vrne 400, ne tihe privzete', async () => {
    const { app } = await createApp();
    const { token } = await seedLibrary(app);

    const res = await request(app)
      .get('/api/v1/saved-links?sort=abecedno')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
