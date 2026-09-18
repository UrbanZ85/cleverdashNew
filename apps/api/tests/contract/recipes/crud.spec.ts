import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, seedRecipe } from './_helpers.js';

// US1, US2, US6, US8 — FR-001 do FR-009, FR-050 do FR-054.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;

async function boot(): Promise<Express> {
  app = (await createApp()).app;
  return app;
}

describe('POST /recipes', () => {
  it('shrani recept z ENIM samim poljem — ime (FR-001, SC-002)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');

    const res = await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({
      title: 'Babičina potica',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Babičina potica',
      // Naslov je NEOBVEZEN — to je glavna razlika do modula 008 (FR-002, US2).
      url: null,
      // Brez naslova ni česa brati, zato `none` in ne `failed`: odsotnost naslova ni napaka.
      sourceStatus: 'none',
      isOwn: true,
      cookCount: 0,
      rating: null,
      lastCookedAt: null,
    });
    expect(res.body.capabilities.deleteRecipe).toBe(true);
  });

  it('sprejme TOČNO obliko, ki jo pošlje obrazec — vsa neizpolnjena polja kot null', async () => {
    // Pripeto ob napaki, pri kateri urejevalnik recepta ni mogel shraniti. Vzrok je bil na
    // ODJEMALCU (ion-input type=number vrne število, ne niza — glej recipes.model.ts), a ker je
    // bila napaka videti kot "strežnik ne sprejme", ta test pribije, da telo v tej obliki JE
    // veljavno. Brez njega bi bila naslednja taka preiskava spet ugibanje.
    const app = await boot();
    const user = await loginAs(app, 'a');

    const res = await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({
      title: 'Test',
      url: null,
      description: null,
      ingredients: [],
      steps: [],
      prepMinutes: null,
      servings: null,
      tags: [],
      categories: [],
      importFromUrl: false,
    });

    expect(res.status).toBe(201);
  });

  it('zavrne recept brez imena', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    const res = await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({ title: '  ' });
    expect(res.status).toBe(400);
  });

  it('razbije prilepljene sestavine po vrsticah in pobere vodilne oznake (FR-005)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');

    const res = await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'Juha', ingredients: '- 400 g buče\n\n* 1 čebula\n1. sol' });

    expect(res.body.ingredients).toEqual(['400 g buče', '1 čebula', 'sol']);
  });

  it('zavrne naslov, ki ni http(s), Z RAZLOGOM (FR-002)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');

    const res = await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'X', url: 'javascript:alert(1)' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('javascript');
  });

  it('zapis nastane TUDI, kadar strani ni mogoče prebrati (FR-012)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');

    // `http://` ne prestane varovala odhodnih naslovov, zato je izid `skipped` — a recept MORA
    // nastati. To je bila v modulu 008 prava napaka, zato je tu izrecno pokrita.
    const res = await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'Juha', url: 'http://okusno.si/juha' });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe('http://okusno.si/juha');
    expect(res.body.sourceStatus).toBe('skipped');
  });

  it('oznake ohranijo prikazno obliko in se dedupliciarajo po zloženi (FR-006)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');

    const res = await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'X', tags: ['Sladice', 'sladice', 'Vegi'] });

    expect(res.body.tags).toEqual(['Sladice', 'Vegi']);
  });
});

describe('GET /recipes', () => {
  it('išče čez ime, opis IN sestavine, neobčutljivo na šumnike (FR-050, FR-051)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');

    await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'Nedeljsko kosilo', ingredients: ['1 buča', 'sol'] });
    await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({ title: 'Palačinke' });

    // Vnos BREZ šumnika mora najti zapis s šumnikom, in to prek SESTAVINE, ne prek imena — recept
    // se najpogosteje išče po tem, kar je v hladilniku.
    const brez = await request(app).get('/api/v1/recipes?q=buca').set(AUTH(user.token));
    expect(brez.body.recipes.map((r: { title: string }) => r.title)).toEqual(['Nedeljsko kosilo']);

    // In enako z šumnikom — zlaganje mora veljati za OBE strani primerjave, ne le za zapis.
    const zSumnikom = await request(app).get('/api/v1/recipes?q=BUČA').set(AUTH(user.token));
    expect(zSumnikom.body.recipes.map((r: { title: string }) => r.title)).toEqual(['Nedeljsko kosilo']);
  });

  it('filtrira po oznaki (FR-052)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    await seedRecipe({ ownerId: user.userId, title: 'Potica', tags: ['Sladice'], tagKeys: ['sladice'] });
    await seedRecipe({ ownerId: user.userId, title: 'Juha', tags: ['Juhe'], tagKeys: ['juhe'] });

    const res = await request(app).get('/api/v1/recipes?tag=SLADICE').set(AUTH(user.token));
    expect(res.body.recipes.map((r: { title: string }) => r.title)).toEqual(['Potica']);
  });

  it('razvrstitev "cooked" postavi NIKOLI kuhane na vrh (FR-053)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    await seedRecipe({ ownerId: user.userId, title: 'Nedavno', lastCookedAt: new Date('2026-09-01') });
    await seedRecipe({ ownerId: user.userId, title: 'Davno', lastCookedAt: new Date('2025-01-01') });
    await seedRecipe({ ownerId: user.userId, title: 'Nikoli', lastCookedAt: null });

    const res = await request(app).get('/api/v1/recipes?sort=cooked').set(AUTH(user.token));
    expect(res.body.recipes.map((r: { title: string }) => r.title)).toEqual(['Nikoli', 'Davno', 'Nedavno']);
  });

  it('ne vrne TUJEGA recepta (FR-063)', async () => {
    const app = await boot();
    const a = await loginAs(app, 'a');
    const b = await loginAs(app, 'b');
    await seedRecipe({ ownerId: a.userId, title: 'Skrivnost' });

    const res = await request(app).get('/api/v1/recipes').set(AUTH(b.token));
    expect(res.body.recipes).toHaveLength(0);
  });
});

describe('PATCH /recipes/{id}', () => {
  it('izpuščeno polje pusti pri miru, null ga POBRIŠE', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    const recipe = await seedRecipe({
      ownerId: user.userId,
      title: 'Juha',
      description: 'Star opis',
      url: 'https://okusno.si/juha',
    });

    const res = await request(app)
      .patch(`/api/v1/recipes/${recipe._id}`)
      .set(AUTH(user.token))
      .send({ description: null });

    expect(res.status).toBe(200);
    expect(res.body.description).toBeNull();
    // `url` ni bil poslan, zato mora ostati — `null` in `undefined` se NE smeta zliti.
    expect(res.body.url).toBe('https://okusno.si/juha');
  });

  it('posodobi iskalno polje, tako da novo ime takoj najde iskanje', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: user.userId, title: 'Juha' });

    await request(app)
      .patch(`/api/v1/recipes/${recipe._id}`)
      .set(AUTH(user.token))
      .send({ title: 'Ričet' });

    const res = await request(app).get('/api/v1/recipes?q=ricet').set(AUTH(user.token));
    expect(res.body.recipes).toHaveLength(1);
  });

  it('tuj recept vrne 404, ne 403 (FR-063)', async () => {
    const app = await boot();
    const a = await loginAs(app, 'a');
    const b = await loginAs(app, 'b');
    const recipe = await seedRecipe({ ownerId: a.userId });

    const res = await request(app)
      .patch(`/api/v1/recipes/${recipe._id}`)
      .set(AUTH(b.token))
      .send({ title: 'Ugrabljeno' });

    // Obstoj tujega zapisa NI podatek, ki bi ga API smel razkriti.
    expect(res.status).toBe(404);
  });

  it('neveljaven identifikator vrne 404 in ne 500', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    const res = await request(app).get('/api/v1/recipes/ni-objectid').set(AUTH(user.token));
    expect(res.status).toBe(404);
  });
});

describe('POST /recipes/{id}/cooked', () => {
  it('zapiše datum in poveča števec (FR-008)', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: user.userId });

    const res = await request(app)
      .post(`/api/v1/recipes/${recipe._id}/cooked`)
      .set(AUTH(user.token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.cookCount).toBe(1);
    expect(res.body.lastCookedAt).not.toBeNull();
  });

  it('vnos za nazaj NE pomakne datuma nazaj, števec pa vseeno naraste', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: user.userId, lastCookedAt: new Date('2026-09-10') });

    const res = await request(app)
      .post(`/api/v1/recipes/${recipe._id}/cooked`)
      .set(AUTH(user.token))
      .send({ cookedAt: '2026-01-01T12:00:00.000Z' });

    expect(new Date(res.body.lastCookedAt).toISOString()).toContain('2026-09-10');
    expect(res.body.cookCount).toBe(1);
  });

  it('zavrne datum v prihodnosti', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: user.userId });

    const res = await request(app)
      .post(`/api/v1/recipes/${recipe._id}/cooked`)
      .set(AUTH(user.token))
      .send({ cookedAt: new Date(Date.now() + 86_400_000).toISOString() });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /recipes/{id}', () => {
  it('izbriše recept', async () => {
    const app = await boot();
    const user = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: user.userId });

    expect((await request(app).delete(`/api/v1/recipes/${recipe._id}`).set(AUTH(user.token))).status).toBe(204);
    expect((await request(app).get(`/api/v1/recipes/${recipe._id}`).set(AUTH(user.token))).status).toBe(404);
  });
});
