import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedRecipe } from './_helpers.js';
import { RecipeCategoryModel } from '../../../src/modules/recipes/models/recipe-category.model.js';

// US10 — FR-080 do FR-086: kategorije ("Juhe", "Kosila", "Zajtrki", "Večerje").
//
// Osrednja stvar, ki jo ta datoteka preverja, ni CRUD, ampak razmerje med DVEMA viroma resnice:
// besednjakom (zbirka `recipecategories`) in imeni, zapisanimi v receptih. Povezana sta prek
// ZLOŽENEGA IMENA, ne prek identifikatorja, in prav to je treba dokazati — sicer bi preimenovanje
// ali izbris pustila recepte kazati v nič.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('besednjak kategorij', () => {
  it('nastane, se izpiše s števcem receptov in je urejen', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');

    for (const name of ['Juhe', 'Kosila', 'Zajtrki']) {
      const res = await request(app).post('/api/v1/recipe-categories').set(AUTH(user.token)).send({ name });
      expect(res.status).toBe(201);
    }
    await seedRecipe({ ownerId: user.userId, title: 'Bučna juha', tags: [] }).then((recipe) =>
      request(app).patch(`/api/v1/recipes/${recipe._id}`).set(AUTH(user.token)).send({ categories: ['Juhe'] }),
    );

    const res = await request(app).get('/api/v1/recipe-categories').set(AUTH(user.token));
    expect(res.body.categories.map((c: { name: string }) => c.name)).toEqual(['Juhe', 'Kosila', 'Zajtrki']);
    expect(res.body.categories[0].recipeCount).toBe(1);
    expect(res.body.categories[1].recipeCount).toBe(0);
  });

  it('podvojeno ime je zavrnjeno, tudi z drugo velikostjo črk', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    await request(app).post('/api/v1/recipe-categories').set(AUTH(user.token)).send({ name: 'Juhe' });

    // `Juhe` in `juhe` sta ISTA kategorija — brez tega bi besednjak razpadel na različice istega.
    const res = await request(app).post('/api/v1/recipe-categories').set(AUTH(user.token)).send({ name: 'juhe' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('že obstaja');
  });

  it('ime, od katerega po zlaganju ne ostane nič, je zavrnjeno', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const res = await request(app).post('/api/v1/recipe-categories').set(AUTH(user.token)).send({ name: '!!!' });
    expect(res.status).toBe(400);
  });

  it('besednjak je ZASEBEN — tuj ga ne vidi', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    await request(app).post('/api/v1/recipe-categories').set(AUTH(a.token)).send({ name: 'Juhe' });

    expect((await request(app).get('/api/v1/recipe-categories').set(AUTH(b.token))).body.categories).toEqual([]);
  });

  it('tuja kategorija se ne da preimenovati ne izbrisati', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    const created = await request(app)
      .post('/api/v1/recipe-categories')
      .set(AUTH(a.token))
      .send({ name: 'Juhe' });

    expect(
      (await request(app).patch(`/api/v1/recipe-categories/${created.body.id}`).set(AUTH(b.token)).send({ name: 'X' }))
        .status,
    ).toBe(404);
    expect(
      (await request(app).delete(`/api/v1/recipe-categories/${created.body.id}`).set(AUTH(b.token))).status,
    ).toBe(404);
  });

  it('vrstni red se shrani in seznam sledi', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const ids: string[] = [];
    for (const name of ['Juhe', 'Kosila', 'Zajtrki']) {
      const res = await request(app).post('/api/v1/recipe-categories').set(AUTH(user.token)).send({ name });
      ids.push(res.body.id);
    }

    const reversed = [...ids].reverse();
    expect(
      (await request(app).put('/api/v1/recipe-categories/order').set(AUTH(user.token)).send({ categoryIds: reversed }))
        .status,
    ).toBe(204);

    const res = await request(app).get('/api/v1/recipe-categories').set(AUTH(user.token));
    expect(res.body.categories.map((c: { name: string }) => c.name)).toEqual(['Zajtrki', 'Kosila', 'Juhe']);
  });

  it('pot /order se NE razume kot ID kategorije', async () => {
    // Statične poti morajo biti registrirane pred parametričnimi; v modulih 003 in 007 je bila to
    // prava napaka v usmerjanju.
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const res = await request(app)
      .put('/api/v1/recipe-categories/order')
      .set(AUTH(user.token))
      .send({ categoryIds: [] });
    expect(res.status).toBe(204);
  });
});

describe('kategorije na receptu', () => {
  it('recept jih sprejme in so v odgovoru', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');

    const res = await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'Bučna juha', categories: ['Juhe', 'Kosila'] });

    expect(res.status).toBe(201);
    // VEČ kategorij na recept: bučna juha je hkrati juha IN kosilo — to je bil razlog za ta model.
    expect(res.body.categories).toEqual(['Juhe', 'Kosila']);
  });

  it('neznana kategorija se SAMODEJNO doda v besednjak', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');

    // Brez tega bi bilo za eno dejanje potrebna dva klica — past, v katero bi vsak nov odjemalec
    // (in n8n) padel enkrat.
    await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({ title: 'X', categories: ['Zajtrki'] });

    const res = await request(app).get('/api/v1/recipe-categories').set(AUTH(user.token));
    expect(res.body.categories.map((c: { name: string }) => c.name)).toEqual(['Zajtrki']);
  });

  it('podvojene po zloženi obliki se zlijejo v eno', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const res = await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'X', categories: ['Juhe', 'juhe', 'JUHE'] });
    expect(res.body.categories).toEqual(['Juhe']);
  });

  it('filter po kategoriji je neobčutljiv na velikost črk in šumnike', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({ title: 'Juha', categories: ['Večerje'] });
    await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({ title: 'Potica', categories: ['Sladice'] });

    const res = await request(app).get('/api/v1/recipes?category=vecerje').set(AUTH(user.token));
    expect(res.body.recipes.map((r: { title: string }) => r.title)).toEqual(['Juha']);
  });

  it('kategorija in oznaka sta LOČENA filtra in delujeta hkrati', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'Vegi juha', categories: ['Juhe'], tags: ['vegi'] });
    await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'Goveja juha', categories: ['Juhe'], tags: ['meso'] });

    const res = await request(app).get('/api/v1/recipes?category=Juhe&tag=vegi').set(AUTH(user.token));
    expect(res.body.recipes.map((r: { title: string }) => r.title)).toEqual(['Vegi juha']);
  });

  it('iskalnik najde recept tudi po imenu kategorije', async () => {
    // Človek, ki vpiše "juhe", pričakuje juhe — ne praznega seznama z nasvetom, naj uporabi čip.
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({ title: 'Ričet', categories: ['Juhe'] });

    const res = await request(app).get('/api/v1/recipes?q=juhe').set(AUTH(user.token));
    expect(res.body.recipes).toHaveLength(1);
  });

  it('več kot dovoljeno kategorij se poreže, recept pa se vseeno shrani', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const many = Array.from({ length: 20 }, (_, i) => `Kat${i}`);
    const res = await request(app).post('/api/v1/recipes').set(AUTH(user.token)).send({ title: 'X', categories: many });
    expect(res.status).toBe(201);
    expect(res.body.categories).toHaveLength(8);
  });
});

describe('preimenovanje', () => {
  it('popravi ime v besednjaku IN v lastnih receptih', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const created = await request(app)
      .post('/api/v1/recipe-categories')
      .set(AUTH(user.token))
      .send({ name: 'Juhe' });
    const recipe = await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'Ričet', categories: ['Juhe'] });

    const renamed = await request(app)
      .patch(`/api/v1/recipe-categories/${created.body.id}`)
      .set(AUTH(user.token))
      .send({ name: 'Juhice' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.updatedRecipes).toBe(1);

    const after = await request(app).get(`/api/v1/recipes/${recipe.body.id}`).set(AUTH(user.token));
    expect(after.body.categories).toEqual(['Juhice']);

    // In filter po NOVEM imenu dela — torej se je popravil tudi zloženi ključ, ne le prikazno ime.
    const filtered = await request(app).get('/api/v1/recipes?category=juhice').set(AUTH(user.token));
    expect(filtered.body.recipes).toHaveLength(1);
  });

  it('NE seže v tuj deljen recept — tam je ime last lastnika', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);

    // A ima recept s kategorijo "Juhe" in ga deli z B.
    const recipe = await seedRecipe({
      ownerId: a.userId,
      title: 'Ričet',
      members: [{ userId: b.userId, role: 'edit' }],
    });
    await request(app).patch(`/api/v1/recipes/${recipe._id}`).set(AUTH(a.token)).send({ categories: ['Juhe'] });

    // B ima SVOJO kategorijo z istim imenom in jo preimenuje.
    const bCategory = await request(app).post('/api/v1/recipe-categories').set(AUTH(b.token)).send({ name: 'Juhe' });
    const renamed = await request(app)
      .patch(`/api/v1/recipe-categories/${bCategory.body.id}`)
      .set(AUTH(b.token))
      .send({ name: 'Juhice' });

    expect(renamed.body.updatedRecipes).toBe(0);
    const after = await request(app).get(`/api/v1/recipes/${recipe._id}`).set(AUTH(a.token));
    expect(after.body.categories).toEqual(['Juhe']);
  });

  it('preimenovanje v ime, ki že obstaja, je zavrnjeno', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    await request(app).post('/api/v1/recipe-categories').set(AUTH(user.token)).send({ name: 'Juhe' });
    const druga = await request(app).post('/api/v1/recipe-categories').set(AUTH(user.token)).send({ name: 'Kosila' });

    const res = await request(app)
      .patch(`/api/v1/recipe-categories/${druga.body.id}`)
      .set(AUTH(user.token))
      .send({ name: 'juhe' });
    expect(res.status).toBe(400);
  });
});

describe('izbris kategorije', () => {
  it('jo odstrani z receptov, RECEPTOV pa ne izbriše', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const created = await request(app)
      .post('/api/v1/recipe-categories')
      .set(AUTH(user.token))
      .send({ name: 'Juhe' });
    const recipe = await request(app)
      .post('/api/v1/recipes')
      .set(AUTH(user.token))
      .send({ title: 'Ričet', categories: ['Juhe', 'Kosila'] });

    const res = await request(app).delete(`/api/v1/recipe-categories/${created.body.id}`).set(AUTH(user.token));
    expect(res.status).toBe(200);
    expect(res.body.updatedRecipes).toBe(1);

    const after = await request(app).get(`/api/v1/recipes/${recipe.body.id}`).set(AUTH(user.token));
    // Recept OSTANE, izgubi samo to kategorijo — druga je nedotaknjena.
    expect(after.status).toBe(200);
    expect(after.body.categories).toEqual(['Kosila']);

    expect(await RecipeCategoryModel.countDocuments({ userId: user.userId, key: 'juhe' })).toBe(0);
  });

  it('izbris kategorije, ki ni na nobenem receptu, javi 0', async () => {
    const app = (await createApp()).app;
    const user = await loginAs(app, 'a');
    const created = await request(app)
      .post('/api/v1/recipe-categories')
      .set(AUTH(user.token))
      .send({ name: 'Prazna' });

    const res = await request(app).delete(`/api/v1/recipe-categories/${created.body.id}`).set(AUTH(user.token));
    expect(res.body.updatedRecipes).toBe(0);
  });
});
