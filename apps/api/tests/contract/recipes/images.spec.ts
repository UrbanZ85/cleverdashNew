import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, jpegBytes, loginAs, loginTwo, pngBytes, seedRecipe } from './_helpers.js';
import { RecipeImageModel } from '../../../src/modules/recipes/models/recipe-image.model.js';

// US3 — FR-020 do FR-027.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function withRecipe(key = 'a') {
  const app = (await createApp()).app;
  const user = await loginAs(app, key);
  const recipe = await seedRecipe({ ownerId: user.userId });
  return { app, user, recipeId: String(recipe._id) };
}

describe('POST /recipes/{id}/images', () => {
  it('naloži sliko in jo naredi NASLOVNO, ker je prva (FR-024)', async () => {
    const { app, user, recipeId } = await withRecipe();

    const res = await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mimeType: 'image/jpeg', isCover: true });

    // Recept brez naslovne slike bi bil v seznamu brez slike, kar uporabnik razume kot napako
    // nalaganja — zato prva slika postane naslovna sama od sebe.
    const recipe = await request(app).get(`/api/v1/recipes/${recipeId}`).set(AUTH(user.token));
    expect(recipe.body.coverImageId).toBe(res.body.id);
    expect(recipe.body.imageCount).toBe(1);
  });

  it('vrsto ugotovi iz VSEBINE, ne iz glave Content-Type (FR-021)', async () => {
    const { app, user, recipeId } = await withRecipe();

    // Odjemalec LAŽE: pravi, da je JPEG, pošlje pa PNG. V zapisu mora biti PNG.
    const res = await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(pngBytes());

    expect(res.body.mimeType).toBe('image/png');
  });

  it('zavrne HTML, tudi kadar je poslan kot image/jpeg', async () => {
    const { app, user, recipeId } = await withRecipe();

    // To je cel razlog preverbe podpisa: HTML, ki bi se naložil kot "slika" in se pozneje postregel
    // z naše domene, bi bil shranjen XSS (research.md §6).
    const res = await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('<html><script>alert(1)</script></html>'));

    expect(res.status).toBe(400);
    expect(await RecipeImageModel.countDocuments({})).toBe(0);
  });

  it('bralec slike ne more naložiti (FR-033)', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    const recipe = await seedRecipe({ ownerId: a.userId, members: [{ userId: b.userId, role: 'view' }] });

    const res = await request(app)
      .post(`/api/v1/recipes/${recipe._id}/images`)
      .set(AUTH(b.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    expect(res.status).toBe(403);
  });
});

describe('GET /recipes/{id}/images', () => {
  it('izpis NE prenese bajtov slike (FR-025, SC-005)', async () => {
    const { app, user, recipeId } = await withRecipe();
    await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes(200_000));

    const res = await request(app).get(`/api/v1/recipes/${recipeId}/images`).set(AUTH(user.token));

    expect(res.body.images).toHaveLength(1);
    // `data` in `thumb` imata `select: false`; izpis sme povedati velikost, ne pa je prenesti.
    expect(res.body.images[0]).not.toHaveProperty('data');
    expect(res.body.images[0]).not.toHaveProperty('thumb');
    expect(JSON.stringify(res.body).length).toBeLessThan(2_000);
  });
});

describe('GET /recipes/{id}/images/{imageId}', () => {
  it('postreže bajte z varnostnimi glavami', async () => {
    const { app, user, recipeId } = await withRecipe();
    const created = await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    const res = await request(app)
      .get(`/api/v1/recipes/${recipeId}/images/${created.body.id}`)
      .set(AUTH(user.token));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    // Brez tega bi smel brskalnik vrsto uganiti sam in bi preverba podpisa ne pomenila nič.
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    // Slika deljenega recepta ne sme pristati v skupnem predpomnilniku posrednika (člen II).
    expect(res.headers['cache-control']).toContain('private');
  });

  it('slika tujega recepta vrne 404', async () => {
    const app = (await createApp()).app;
    const { a, b } = await loginTwo(app);
    const recipe = await seedRecipe({ ownerId: a.userId });
    const created = await request(app)
      .post(`/api/v1/recipes/${recipe._id}/images`)
      .set(AUTH(a.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    const res = await request(app)
      .get(`/api/v1/recipes/${recipe._id}/images/${created.body.id}`)
      .set(AUTH(b.token));

    expect(res.status).toBe(404);
  });
});

describe('PUT .../thumb', () => {
  it('sprejme pomanjšavo in jo postreže pod variant=thumb', async () => {
    const { app, user, recipeId } = await withRecipe();
    const created = await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes(5_000));

    const put = await request(app)
      .put(`/api/v1/recipes/${recipeId}/images/${created.body.id}/thumb`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes(100));
    expect(put.status).toBe(204);

    const thumb = await request(app)
      .get(`/api/v1/recipes/${recipeId}/images/${created.body.id}?variant=thumb`)
      .set(AUTH(user.token));
    expect(thumb.body.length).toBeLessThan(1_000);
  });

  it('pomanjšava gre skozi ISTO preverbo podpisa kot izvirnik', async () => {
    const { app, user, recipeId } = await withRecipe();
    const created = await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    // Brez tega bi bila `thumb` odprta vrata za vse, česar `data` ne dovoli (research.md §5).
    const res = await request(app)
      .put(`/api/v1/recipes/${recipeId}/images/${created.body.id}/thumb`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('<html>ni slika</html>'));

    expect(res.status).toBe(400);
  });

  it('brez pomanjšave variant=thumb postreže IZVIRNIK — seznam deluje v obeh primerih', async () => {
    const { app, user, recipeId } = await withRecipe();
    const created = await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    const res = await request(app)
      .get(`/api/v1/recipes/${recipeId}/images/${created.body.id}?variant=thumb`)
      .set(AUTH(user.token));

    expect(res.status).toBe(200);
  });
});

describe('brisanje slik', () => {
  it('brisanje NASLOVNE prenese naslovno na najstarejšo preostalo (FR-024)', async () => {
    const { app, user, recipeId } = await withRecipe();
    const upload = () =>
      request(app)
        .post(`/api/v1/recipes/${recipeId}/images`)
        .set(AUTH(user.token))
        .set('Content-Type', 'image/jpeg')
        .send(jpegBytes());

    const prva = await upload();
    const druga = await upload();
    expect(prva.body.isCover).toBe(true);

    await request(app).delete(`/api/v1/recipes/${recipeId}/images/${prva.body.id}`).set(AUTH(user.token));

    const recipe = await request(app).get(`/api/v1/recipes/${recipeId}`).set(AUTH(user.token));
    expect(recipe.body.coverImageId).toBe(druga.body.id);
  });

  it('brisanje zadnje slike pusti recept BREZ naslovne — to je veljavno stanje', async () => {
    const { app, user, recipeId } = await withRecipe();
    const created = await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    await request(app).delete(`/api/v1/recipes/${recipeId}/images/${created.body.id}`).set(AUTH(user.token));

    const recipe = await request(app).get(`/api/v1/recipes/${recipeId}`).set(AUTH(user.token));
    expect(recipe.body.coverImageId).toBeNull();
    expect(recipe.body.imageCount).toBe(0);
  });

  it('brisanje RECEPTA pobriše tudi njegove slike (FR-026)', async () => {
    const { app, user, recipeId } = await withRecipe();
    await request(app)
      .post(`/api/v1/recipes/${recipeId}/images`)
      .set(AUTH(user.token))
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());

    expect(await RecipeImageModel.countDocuments({})).toBe(1);
    await request(app).delete(`/api/v1/recipes/${recipeId}`).set(AUTH(user.token));
    // Slika brez recepta ne bi bila vidna nikjer in je ne bi imel kdo pobrisati.
    expect(await RecipeImageModel.countDocuments({})).toBe(0);
  });
});
