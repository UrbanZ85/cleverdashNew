import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedRecipe } from './_helpers.js';
import type { MemberRole } from '../../../src/modules/recipes/domain/capabilities.js';

// US4 — FR-030 do FR-039, FR-063.
//
// Matrika pravic je izčrpno pokrita že kot čista funkcija (tests/unit/recipes-capabilities.spec.ts).
// Ta datoteka preverja nekaj drugega: da usmerjevalnik to matriko RES uporabi na vsakem endpointu
// in da se statusi navzven ujemajo — 403 soudeležencu, 404 tujcu. Enotski test tega ne dokaže, ker
// ne gre skozi HTTP.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

/** Vsa dejanja nad receptom — da je razvidno, katero od njih katera stopnja sme. */
function actions(app: Express, recipeId: string) {
  return {
    beri: () => request(app).get(`/api/v1/recipes/${recipeId}`),
    uredi: () => request(app).patch(`/api/v1/recipes/${recipeId}`).send({ title: 'Novo' }),
    oceni: () => request(app).patch(`/api/v1/recipes/${recipeId}`).send({ rating: 5 }),
    skuhano: () => request(app).post(`/api/v1/recipes/${recipeId}/cooked`).send({}),
    izbrisi: () => request(app).delete(`/api/v1/recipes/${recipeId}`),
    deli: () => request(app).put(`/api/v1/recipes/${recipeId}/members/000000000000000000000001`).send({ role: 'view' }),
    javnaPovezava: () => request(app).post(`/api/v1/recipes/${recipeId}/public-link`).send({}),
  };
}

async function shared(app: Express, role: MemberRole) {
  const { a, b } = await loginTwo(app);
  const recipe = await seedRecipe({
    ownerId: a.userId,
    members: [{ userId: b.userId, role }],
  });
  return { a, b, recipeId: String(recipe._id) };
}

describe('soudeleženec "view" (FR-033)', () => {
  it('bere, a ne more spremeniti NIČESAR — vključno z oznako "skuhano"', async () => {
    const app = (await createApp()).app;
    const { b, recipeId } = await shared(app, 'view');
    const act = actions(app, recipeId);

    expect((await act.beri().set(AUTH(b.token))).status).toBe(200);
    // 403 in ne 404: bralec recept VIDI, zato mu je treba povedati, da naj za urejanje prosi
    // lastnika — 404 bi bil zanj videti kot izgubljen recept.
    expect((await act.uredi().set(AUTH(b.token))).status).toBe(403);
    expect((await act.skuhano().set(AUTH(b.token))).status).toBe(403);
    expect((await act.izbrisi().set(AUTH(b.token))).status).toBe(403);
    expect((await act.deli().set(AUTH(b.token))).status).toBe(403);
    expect((await act.javnaPovezava().set(AUTH(b.token))).status).toBe(403);
  });

  it('v zmožnostih vidi natanko to, kar sme (FR-064, SC-007)', async () => {
    const app = (await createApp()).app;
    const { b, recipeId } = await shared(app, 'view');
    const res = await request(app).get(`/api/v1/recipes/${recipeId}`).set(AUTH(b.token));

    expect(res.body.capabilities).toMatchObject({
      readRecipe: true,
      editRecipe: false,
      markCooked: false,
      manageSharing: false,
      leaveRecipe: true,
    });
  });
});

describe('soudeleženec "edit" (FR-034, FR-035)', () => {
  it('ureja vsebino in označi skuhano, NE pa ocene, deljenja in brisanja', async () => {
    const app = (await createApp()).app;
    const { b, recipeId } = await shared(app, 'edit');
    const act = actions(app, recipeId);

    expect((await act.uredi().set(AUTH(b.token))).status).toBe(200);
    expect((await act.skuhano().set(AUTH(b.token))).status).toBe(200);
    // Ocena je LASTNIKOVA (FR-035) — to je edino polje v telesu s strožjo zahtevo od ostalih.
    expect((await act.oceni().set(AUTH(b.token))).status).toBe(403);
    expect((await act.izbrisi().set(AUTH(b.token))).status).toBe(403);
    expect((await act.deli().set(AUTH(b.token))).status).toBe(403);
  });

  it('zapiše, KDO je nazadnje spremenil (FR-009)', async () => {
    const app = (await createApp()).app;
    const { a, b, recipeId } = await shared(app, 'edit');

    await request(app).patch(`/api/v1/recipes/${recipeId}`).set(AUTH(b.token)).send({ title: 'Popravljeno' });

    const res = await request(app).get(`/api/v1/recipes/${recipeId}`).set(AUTH(a.token));
    expect(res.body.lastModifiedBy.id).toBe(b.userId);
  });
});

describe('tujec (FR-063)', () => {
  it('dobi 404 na VSAKI poti — obstoj tujega zapisa ni podatek', async () => {
    const app = (await createApp()).app;
    const a = await loginAs(app, 'a');
    const c = await loginAs(app, 'c');
    const recipe = await seedRecipe({ ownerId: a.userId });
    const act = actions(app, String(recipe._id));

    for (const call of [act.beri, act.uredi, act.skuhano, act.izbrisi, act.deli, act.javnaPovezava]) {
      expect((await call().set(AUTH(c.token))).status).toBe(404);
    }
  });
});

describe('upravljanje soudeležencev', () => {
  it('lastnik doda, spremeni vlogo in odvzame — odvzem je TAKOJŠEN (FR-031)', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    const recipe = await seedRecipe({ ownerId: a.userId });
    const id = String(recipe._id);

    const dodan = await request(app)
      .put(`/api/v1/recipes/${id}/members/${b.userId}`)
      .set(AUTH(a.token))
      .send({ role: 'view' });
    expect(dodan.status).toBe(200);
    expect(dodan.body.members).toHaveLength(1);
    // Dokler soudeleženec recepta ni odprl, je zanj NOV (FR-038). Preverja se prek SEZNAMA in ne
    // prek `GET` posameznega recepta: `GET` je hkrati odprtje in oznako pobriše, zato v njegovem
    // odgovoru `isNew` po definiciji ne more biti `true`.
    expect(dodan.body.members[0].seenAt).toBeNull();
    const seznam = await request(app).get('/api/v1/recipes').set(AUTH(b.token));
    expect(seznam.body.recipes[0].isNew).toBe(true);

    const povisan = await request(app)
      .put(`/api/v1/recipes/${id}/members/${b.userId}`)
      .set(AUTH(a.token))
      .send({ role: 'edit' });
    // Ponovni klic za istega človeka NE sme dodati drugega vnosa — dva vnosa za istega človeka sta
    // stanje, na katero razsodnik dostopa nima enoličnega odgovora.
    expect(povisan.body.members).toHaveLength(1);
    expect(povisan.body.members[0].role).toBe('edit');

    await request(app).delete(`/api/v1/recipes/${id}/members/${b.userId}`).set(AUTH(a.token));
    expect((await request(app).get(`/api/v1/recipes/${id}`).set(AUTH(b.token))).status).toBe(404);
  });

  it('odprtje pobriše oznako "novo" (FR-038)', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    const recipe = await seedRecipe({ ownerId: a.userId, members: [{ userId: b.userId, role: 'view' }] });

    const list = () => request(app).get('/api/v1/recipes').set(AUTH(b.token));

    // Pred odprtjem je v seznamu označen kot nov …
    expect((await list()).body.recipes[0].isNew).toBe(true);

    // … odprtje je tisto, kar oznako pobriše …
    await request(app).get(`/api/v1/recipes/${recipe._id}`).set(AUTH(b.token));

    // … in po njem je v seznamu navaden recept.
    expect((await list()).body.recipes[0].isNew).toBe(false);
  });

  it('lastnik samega sebe ne more dodati med soudeležence (FR-037)', async () => {
    const app = (await createApp()).app;
    const a = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: a.userId });

    const res = await request(app)
      .put(`/api/v1/recipes/${recipe._id}/members/${a.userId}`)
      .set(AUTH(a.token))
      .send({ role: 'edit' });

    expect(res.status).toBe(400);
  });

  it('deljenje z neobstoječim uporabnikom je zavrnjeno (FR-036)', async () => {
    const app = (await createApp()).app;
    const a = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: a.userId });

    const res = await request(app)
      .put(`/api/v1/recipes/${recipe._id}/members/000000000000000000000009`)
      .set(AUTH(a.token))
      .send({ role: 'view' });

    // Ponudili bi dostop, ki ga prejemnik ne more uporabiti.
    expect(res.status).toBe(400);
  });
});

describe('odhod (FR-032)', () => {
  it('soudeleženec odide sam; lastniku recept ostane', async () => {
    const app = (await createApp()).app;
    const { a, b, recipeId } = await shared(app, 'edit');

    expect((await request(app).post(`/api/v1/recipes/${recipeId}/leave`).set(AUTH(b.token))).status).toBe(204);
    expect((await request(app).get(`/api/v1/recipes/${recipeId}`).set(AUTH(b.token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/recipes/${recipeId}`).set(AUTH(a.token))).status).toBe(200);
  });

  it('lastnik svojega recepta NE more zapustiti', async () => {
    const app = (await createApp()).app;
    const a = await loginAs(app, 'a');
    const recipe = await seedRecipe({ ownerId: a.userId });

    const res = await request(app).post(`/api/v1/recipes/${recipe._id}/leave`).set(AUTH(a.token));
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('izbriše');
  });
});

describe('seznam deljenih', () => {
  it('scope=shared vrne samo tuje, scope=own samo lastne (FR-054)', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    await seedRecipe({ ownerId: b.userId, title: 'Moj' });
    await seedRecipe({ ownerId: a.userId, title: 'Tujčev', members: [{ userId: b.userId, role: 'view' }] });

    const vsi = await request(app).get('/api/v1/recipes').set(AUTH(b.token));
    expect(vsi.body.recipes).toHaveLength(2);

    const lastni = await request(app).get('/api/v1/recipes?scope=own').set(AUTH(b.token));
    expect(lastni.body.recipes.map((r: { title: string }) => r.title)).toEqual(['Moj']);

    const deljeni = await request(app).get('/api/v1/recipes?scope=shared').set(AUTH(b.token));
    expect(deljeni.body.recipes.map((r: { title: string }) => r.title)).toEqual(['Tujčev']);
    expect(deljeni.body.recipes[0].isOwn).toBe(false);
  });

  it('izbris pri lastniku odnese recept VSEM — kopij ni', async () => {
    const app = (await createApp()).app;
    const { a, b, recipeId } = await shared(app, 'edit');

    await request(app).delete(`/api/v1/recipes/${recipeId}`).set(AUTH(a.token));
    expect((await request(app).get('/api/v1/recipes').set(AUTH(b.token))).body.recipes).toHaveLength(0);
  });
});
