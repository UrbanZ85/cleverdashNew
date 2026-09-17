import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, jpegBytes, loginAs, loginTwo, seedRecipe } from './_helpers.js';
import { resetPublicRateLimiter } from '../../../src/modules/recipes/services/public-throttle.service.js';

// US5 — FR-040 do FR-048.
//
// TA DATOTEKA JE VARNOSTNO OBČUTLJIVA. Vse, kar javna pot vrne, vidi kdor koli na internetu, ki ima
// naslov. Glavni test tu ni "povezava deluje", ampak "povezava ne pove ničesar drugega".

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  await clearTestDb();
  // Števec dušenja živi v pomnilniku procesa in bi se prenašal med testi — brez tega bi bil
  // vrstni red testov pomemben.
  resetPublicRateLimiter();
});

describe('izdaja in preklic', () => {
  it('lastnik izda povezavo, ki se odpre BREZ prijave (FR-040, FR-041)', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const recipe = await seedRecipe({
      ownerId: user.userId,
      title: 'Bučna juha',
      ingredients: ['1 buča'],
      steps: ['Popeci.'],
    });

    const izdana = await request(app)
      .post(`/api/v1/recipes/${recipe._id}/public-link`)
      .set(AUTH(user.token))
      .send({});

    expect(izdana.status).toBe(201);
    expect(izdana.body.publicLink.url).toMatch(/\/r\/[A-Za-z0-9_-]{22}$/);

    const token = izdana.body.publicLink.url.split('/r/')[1];
    // BREZ glave Authorization — to je bistvo.
    const javna = await request(app).get(`/api/v1/shared-recipes/${token}`);

    expect(javna.status).toBe(200);
    expect(javna.body).toMatchObject({ title: 'Bučna juha', ingredients: ['1 buča'], steps: ['Popeci.'] });
  });

  it('javni odgovor NE razkrije lastnika, soudeležencev, ocene ne žetona (FR-042)', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    const recipe = await seedRecipe({
      ownerId: a.userId,
      rating: 5,
      lastCookedAt: new Date(),
      members: [{ userId: b.userId, role: 'edit' }],
      publicShare: { token: 'a'.repeat(22) },
    });

    const res = await request(app).get('/api/v1/shared-recipes/' + 'a'.repeat(22));
    const body = JSON.stringify(res.body);

    for (const forbidden of ['ownerId', 'members', 'rating', 'lastCookedAt', 'cookCount', 'publicShare', 'searchText', 'capabilities']) {
      expect(body, `javni odgovor vsebuje "${forbidden}"`).not.toContain(forbidden);
    }
    // Niti identifikatorjev ljudi — ne po imenu polja ne po vrednosti.
    expect(body).not.toContain(a.userId);
    expect(body).not.toContain(b.userId);
    expect(body).not.toContain(String(recipe._id));
  });

  it('preklic je TAKOJŠEN (FR-044)', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const token = 'b'.repeat(22);
    const recipe = await seedRecipe({ ownerId: user.userId, publicShare: { token } });

    expect((await request(app).get(`/api/v1/shared-recipes/${token}`)).status).toBe(200);

    await request(app).delete(`/api/v1/recipes/${recipe._id}/public-link`).set(AUTH(user.token));

    expect((await request(app).get(`/api/v1/shared-recipes/${token}`)).status).toBe(404);
  });

  it('nova povezava po preklicu ima DRUG žeton; stara ne oživi (FR-045)', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const stari = 'c'.repeat(22);
    const recipe = await seedRecipe({ ownerId: user.userId, publicShare: { token: stari } });

    await request(app).delete(`/api/v1/recipes/${recipe._id}/public-link`).set(AUTH(user.token));
    const nova = await request(app)
      .post(`/api/v1/recipes/${recipe._id}/public-link`)
      .set(AUTH(user.token))
      .send({});

    const noviToken = nova.body.publicLink.url.split('/r/')[1];
    expect(noviToken).not.toBe(stari);
    expect((await request(app).get(`/api/v1/shared-recipes/${stari}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/shared-recipes/${noviToken}`)).status).toBe(200);
  });

  it('ponovni klic pri ŽIVI povezavi vrne obstoječo, ne izda druge', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: user.userId });

    const prva = await request(app).post(`/api/v1/recipes/${recipe._id}/public-link`).set(AUTH(user.token)).send({});
    const druga = await request(app).post(`/api/v1/recipes/${recipe._id}/public-link`).set(AUTH(user.token)).send({});

    // Dva naslova do istega recepta bi pomenila, da preklic enega pusti drugega pri življenju —
    // lastnik bi mislil, da je zaprl dostop.
    expect(druga.body.publicLink.url).toBe(prva.body.publicLink.url);
  });

  it('izbris recepta ubije javno povezavo (FR-048)', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const token = 'd'.repeat(22);
    const recipe = await seedRecipe({ ownerId: user.userId, publicShare: { token } });

    await request(app).delete(`/api/v1/recipes/${recipe._id}`).set(AUTH(user.token));
    expect((await request(app).get(`/api/v1/shared-recipes/${token}`)).status).toBe(404);
  });
});

describe('žeton ne pove ničesar (FR-046)', () => {
  it('neveljaven, preklican, neobstoječ in izbrisan dajo ENAK odgovor', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    await seedRecipe({
      ownerId: user.userId,
      publicShare: { token: 'e'.repeat(22), revokedAt: new Date() },
    });

    const odgovori = await Promise.all([
      request(app).get('/api/v1/shared-recipes/' + 'e'.repeat(22)), // preklican
      request(app).get('/api/v1/shared-recipes/' + 'f'.repeat(22)), // neobstoječ
      request(app).get('/api/v1/shared-recipes/prekratek'), // napačna oblika
    ]);

    // Različni odgovori bi povedali, da je žeton nekoč obstajal, in bi iz javne strani naredili
    // orodje za ugotavljanje, kdo je kdaj kaj delil.
    for (const res of odgovori) {
      expect(res.status).toBe(404);
      expect(res.body.detail).toBe('Ta povezava ne obstaja ali ni več veljavna.');
    }
  });

  it('žeton oblike Mongo operatorja ne pride do poizvedbe', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    await seedRecipe({ ownerId: user.userId, publicShare: { token: 'g'.repeat(22) } });

    // Vzorec iz varnostnega pregleda 009: razčlenjena vrednost v pogoju poizvedbe je OPERATOR, ki
    // bi se prevedel v "katera koli živa povezava".
    const res = await request(app).get('/api/v1/shared-recipes/' + encodeURIComponent('{"$ne":null}'));
    expect(res.status).toBe(404);
  });
});

describe('javna stran je samo za BRANJE (FR-043)', () => {
  it('slika je vezana na žeton in pripada natanko temu receptu', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const token = 'h'.repeat(22);
    const deljen = await seedRecipe({ ownerId: user.userId, publicShare: { token } });
    const drug = await seedRecipe({ ownerId: user.userId, title: 'Zaseben' });

    const slikaDeljenega = await request(app)
      .post(`/api/v1/recipes/${deljen._id}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());
    const slikaDrugega = await request(app)
      .post(`/api/v1/recipes/${drug._id}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    expect((await request(app).get(`/api/v1/shared-recipes/${token}/images/${slikaDeljenega.body.id}`)).status).toBe(200);
    // Žeton enega recepta NE sme odpreti slik drugega.
    expect((await request(app).get(`/api/v1/shared-recipes/${token}/images/${slikaDrugega.body.id}`)).status).toBe(404);
  });

  it('javni odgovor se NE sme predpomniti — sicer preklic ne bi učinkoval takoj', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const token = 'i'.repeat(22);
    await seedRecipe({ ownerId: user.userId, publicShare: { token } });

    const res = await request(app).get(`/api/v1/shared-recipes/${token}`);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('na javni poti ni nobene pisalne metode', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const token = 'j'.repeat(22);
    await seedRecipe({ ownerId: user.userId, publicShare: { token } });

    for (const res of [
      await request(app).post(`/api/v1/shared-recipes/${token}`).send({}),
      await request(app).patch(`/api/v1/shared-recipes/${token}`).send({ title: 'Ugrabljeno' }),
      await request(app).delete(`/api/v1/shared-recipes/${token}`),
    ]) {
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(204);
    }
  });
});

describe('obsegi (FR-061)', () => {
  it('izdaja javne povezave je pod recipes:share in ne recipes:write', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    // Soudeleženec `edit` ima pravico PISANJA vsebine, a nima `managePublicLink` — to je natanko
    // razlika, zaradi katere sta obsega ločena.
    const recipe = await seedRecipe({ ownerId: a.userId, members: [{ userId: b.userId, role: 'edit' }] });

    expect(
      (await request(app).patch(`/api/v1/recipes/${recipe._id}`).set(AUTH(b.token)).send({ title: 'X' })).status,
    ).toBe(200);
    expect(
      (await request(app).post(`/api/v1/recipes/${recipe._id}/public-link`).set(AUTH(b.token)).send({})).status,
    ).toBe(403);
  });
});
