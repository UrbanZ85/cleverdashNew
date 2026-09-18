import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';
import { ApiKeyModel } from '../../src/platform/apikeys/model.js';
import { RecipeModel } from '../../src/modules/recipes/models/recipe.model.js';
import { NoteModel } from '../../src/modules/notes/models/note.model.js';
import { SavedLinkModel } from '../../src/modules/saved-links/models/saved-link.model.js';
import { SavedLinkGroupModel } from '../../src/modules/saved-links/models/saved-link-group.model.js';

// Celoten tok, kot ga bo živel uporabnik: v Nastavitvah izda ključ, navodilo prilepi agentu,
// agent pošlje POST z `X-API-Key`. Integracijski in ne enotski test, ker je predmet preverbe
// natanko tisto, česar enotski ne vidi — da vratar, obsegi, lastništvo zapisa in shramba
// delujejo SKUPAJ.

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

/** Prijavljen človek z običajnimi uporabniškimi obsegi (ne administrator). */
async function login(app: Express, sub: string) {
  return loginAsTestUser(app, fakeKeycloak, {
    sub,
    email: `${sub}@example.com`,
    roles: ['cleverdash-user'],
  });
}

async function issueKey(
  app: Express,
  token: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app)
    .post('/api/v1/ingest/keys')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('izdaja agentskega ključa', () => {
  it('navaden uporabnik si ključ izda sam in dobi navodilo s čistopisom', async () => {
    // Bistvo funkcionalnosti: en klic vrne ključ IN besedilo, ki ga človek prilepi agentu.
    // Čistopis se pokaže samo tu, zato navodilo z vdelanim ključem ne more nastati kdaj kasneje.
    const app = await boot();
    const user = await login(app, 'kc-ingest-issue');

    const res = await issueKey(app, user.accessToken, {
      label: 'ChatGPT — recepti',
      targets: ['recipes'],
      expiresInMinutes: 10,
    });

    expect(res.status).toBe(201);
    expect(res.body.secret).toMatch(/^cd_/);
    expect(res.body.targets).toEqual(['recipes']);
    expect(res.body.targetTitles).toEqual(['Recepti']);
    expect(res.body.instructions).toContain(res.body.secret);
    expect(res.body.instructions).toContain('/api/v1/ingest');
    expect(res.body.curl).toContain(res.body.secret);
    expect(res.body).not.toHaveProperty('keyHash');

    const stored = await ApiKeyModel.findById(res.body.id).lean();
    expect(String(stored?.ownerId)).toBe(user.userId);
    expect(stored?.expiresAt).toBeInstanceOf(Date);
  });

  it('obsegi se IZPELJEJO iz ciljev in jih klicatelj ne izbere', async () => {
    // Prosto polje `scopes` tu ne obstaja: sicer bi bila izdaja agentskega ključa pot, po kateri
    // si uporabnik izda ključ s katerim koli svojim obsegom.
    const app = await boot();
    const user = await login(app, 'kc-ingest-scopes');

    const res = await issueKey(app, user.accessToken, {
      label: 'poskus',
      targets: ['recipes', 'notes'],
      scopes: ['admin', 'file-sharing:write'],
    });

    expect(res.status).toBe(201);
    expect(res.body.scopes.sort()).toEqual(['notes:write', 'recipes:write']);
    expect(res.body.scopes).not.toContain('admin');
  });

  it('ključ ne more izdati drugega ključa', async () => {
    // Ključ, ki izdaja ključe, je podvojevalnik poverilnic — preklic prvega ne ustavi naslednjih.
    const app = await boot();
    const user = await login(app, 'kc-ingest-nochain');
    const first = await issueKey(app, user.accessToken, { label: 'prvi', targets: ['recipes'] });

    const res = await request(app)
      .post('/api/v1/ingest/keys')
      .set('X-API-Key', first.body.secret)
      .send({ label: 'drugi', targets: ['recipes'] });

    expect(res.status).toBe(403);
  });

  it('neobstoječ cilj je zavrnjen z navedbo razpoložljivih', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-badtarget');
    const res = await issueKey(app, user.accessToken, { label: 'x', targets: ['kamere'] });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('recipes');
  });

  it('ključ brez cilja ne more nastati', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-notarget');
    const res = await issueKey(app, user.accessToken, { label: 'x', targets: [] });
    expect(res.status).toBe(400);
  });

  it('seznam vrne samo svoje ključe in nikoli zgoščene vrednosti', async () => {
    const app = await boot();
    const ana = await login(app, 'kc-ingest-ana');
    const bor = await login(app, 'kc-ingest-bor');
    await issueKey(app, ana.accessToken, { label: 'anin', targets: ['recipes'] });
    await issueKey(app, bor.accessToken, { label: 'borov', targets: ['notes'] });

    const res = await request(app)
      .get('/api/v1/ingest/keys')
      .set('Authorization', `Bearer ${ana.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].label).toBe('anin');
    expect(res.body[0]).not.toHaveProperty('keyHash');
    expect(res.body[0]).not.toHaveProperty('secret');
  });

  it('preklic je revokedAt in ključ takoj neha delovati', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-revoke');
    const key = await issueKey(app, user.accessToken, { label: 'x', targets: ['notes'] });

    const del = await request(app)
      .delete(`/api/v1/ingest/keys/${key.body.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(del.status).toBe(204);

    const stored = await ApiKeyModel.findById(key.body.id).lean();
    expect(stored).not.toBeNull();
    expect(stored?.revokedAt).not.toBeNull();

    const after = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'notes', data: { body: 'po preklicu' } });
    expect(after.status).toBe(401);
  });

  it('tujega ključa ni mogoče preklicati', async () => {
    const app = await boot();
    const ana = await login(app, 'kc-ingest-ana2');
    const bor = await login(app, 'kc-ingest-bor2');
    const anin = await issueKey(app, ana.accessToken, { label: 'anin', targets: ['recipes'] });

    const res = await request(app)
      .delete(`/api/v1/ingest/keys/${anin.body.id}`)
      .set('Authorization', `Bearer ${bor.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('uvoz z agentskim ključem', () => {
  it('recept nastane in pripade LASTNIKU KLJUČA, ne ugibanemu uporabniku', async () => {
    // Pravi razlog za `ApiKey.ownerId`: pri DVEH uporabnikih je staro ugibanje
    // (`resolveAutomationOwnerUserId`) vrnilo null in avtomatizacija ni imela komu pisati.
    const app = await boot();
    const ana = await login(app, 'kc-ingest-owner-ana');
    await login(app, 'kc-ingest-owner-bor');
    const key = await issueKey(app, ana.accessToken, { label: 'gpt', targets: ['recipes'] });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({
        target: 'recipes',
        data: {
          title: 'Bučna juha',
          url: 'https://okusno.si/recept/bucna-juha',
          ingredients: ['1 buča', '1 čebula'],
          steps: ['Speci bučo.', 'Zmiksaj.'],
          prepMinutes: 45,
          categories: ['Juhe'],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('created');
    expect(res.body.title).toBe('Bučna juha');
    expect(res.body.url).toBe(`http://localhost:3000/recipes/${res.body.id}`);

    const recipe = await RecipeModel.findById(res.body.id).lean();
    expect(String(recipe?.ownerId)).toBe(ana.userId);
    expect(recipe?.ingredients).toEqual(['1 buča', '1 čebula']);
    expect(recipe?.categories).toEqual(['Juhe']);
    // Strežnik strani NI obiskal — agent jo je prebral namesto njega (člen VIII).
    expect(recipe?.sourceStatus).toBe('skipped');
  });

  it('isti naslov drugič ne ustvari dvojnika, ampak pokaže obstoječega', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-dup');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['recipes'] });

    const body = {
      target: 'recipes',
      data: { title: 'Bučna juha', url: 'https://okusno.si/recept/bucna-juha' },
    };
    const first = await request(app).post('/api/v1/ingest').set('X-API-Key', key.body.secret).send(body);
    const second = await request(app).post('/api/v1/ingest').set('X-API-Key', key.body.secret).send(body);

    expect(first.status).toBe(201);
    // 200 in ne 201: nič ni nastalo, in `201 Created` bi bil neresničen.
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('duplicate');
    expect(second.body.id).toBe(first.body.id);
    expect(await RecipeModel.countDocuments({})).toBe(1);
  });

  it('pri enem samem cilju je polje "target" neobvezno', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-single');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['notes'] });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ data: { title: 'Brez cilja', body: 'vsebina' } });

    expect(res.status).toBe(201);
    expect(res.body.target).toBe('notes');
  });

  it('pri več ciljih manjkajoč "target" NE pristane tiho nekje', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-multi');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['notes', 'recipes'] });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ data: { title: 'Kam pa to?', body: 'vsebina' } });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('target');
    expect(await NoteModel.countDocuments({})).toBe(0);
  });

  it('ključ ne more pisati v cilj, ki mu ni bil dodeljen', async () => {
    // Druga zapora poleg obsegov: uporabnik `notes:write` IMA (je navaden uporabnik), a ta ključ
    // je bil izdan samo za recepte.
    const app = await boot();
    const user = await login(app, 'kc-ingest-forbidden');
    const key = await issueKey(app, user.accessToken, { label: 'samo recepti', targets: ['recipes'] });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'notes', data: { body: 'poskus' } });

    expect(res.status).toBe(403);
    expect(await NoteModel.countDocuments({})).toBe(0);
  });

  it('neznan cilj dobi ISTI odgovor kot nedovoljen', async () => {
    // Sicer bi klicatelj z omejenim ključem iz razlike med odgovoroma prebral, kateri moduli v
    // tej namestitvi obstajajo — podatek, do katerega prek tega ključa nima dostopa.
    const app = await boot();
    const user = await login(app, 'kc-ingest-unknown');
    const key = await issueKey(app, user.accessToken, { label: 'samo recepti', targets: ['recipes'] });

    const forbiddenTarget = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'notes', data: { body: 'obstaja, a ni dovoljen' } });
    const unknownTarget = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'kamere', data: { body: 'sploh ne obstaja' } });

    expect(unknownTarget.status).toBe(forbiddenTarget.status);
    expect(unknownTarget.body.detail.replace('kamere', 'notes')).toBe(forbiddenTarget.body.detail);
  });

  it('brez poverilnice ni uvoza', async () => {
    const app = await boot();
    const res = await request(app)
      .post('/api/v1/ingest')
      .send({ target: 'notes', data: { body: 'brez ključa' } });
    expect(res.status).toBe(401);
    expect(await NoteModel.countDocuments({})).toBe(0);
  });

  it('potekel ključ je zavrnjen', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-expired');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['notes'] });
    await ApiKeyModel.updateOne({ _id: key.body.id }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'notes', data: { body: 'po izteku' } });

    expect(res.status).toBe(401);
  });

  it('neveljavno telo vrne 400 z imenom polja in ne 500', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-badbody');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['recipes'] });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'recipes', data: { ingredients: ['moka'] } });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('title');
  });

  it('sveženj shrani več zapisov v enem klicu in prešteje dvojnike', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-batch');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['saved-links'] });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({
        target: 'saved-links',
        data: [
          { url: 'https://primer.si/ena', title: 'Ena' },
          { url: 'https://primer.si/dve', title: 'Dve' },
          // Isti naslov kot prvi — zaporedna obdelava ga mora prepoznati ZNOTRAJ istega svežnja.
          { url: 'https://primer.si/ena', title: 'Ena znova' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.duplicates).toBe(1);
    expect(await SavedLinkModel.countDocuments({})).toBe(2);
  });

  it('neveljaven zapis sredi svežnja ne pusti prejšnjih shranjenih', async () => {
    // Sicer bi agent videl samo 400, sklepal, da ni shranjeno nič, in ob ponovnem poskusu
    // podvojil prva dva zapisa.
    const app = await boot();
    const user = await login(app, 'kc-ingest-batch-partial');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['saved-links'] });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({
        target: 'saved-links',
        data: [
          { url: 'https://primer.si/ena' },
          { url: 'https://primer.si/dve' },
          { title: 'brez naslova strani' },
        ],
      });

    expect(res.status).toBe(400);
    expect(await SavedLinkModel.countDocuments({})).toBe(0);
  });

  it('povezava se uvrsti v obstoječo mapo po imenu, neznano ime pa samo javi', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-group');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['saved-links'] });
    const group = await SavedLinkGroupModel.create({ userId: user.userId, name: 'Kolesarjenje', order: 0 });

    const matched = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      // Namenoma z malo začetnico: "kolesarjenje" in "Kolesarjenje" sta ista mapa.
      .send({ target: 'saved-links', data: { url: 'https://primer.si/a', group: 'kolesarjenje' } });

    expect(matched.status).toBe(201);
    const stored = await SavedLinkModel.findById(matched.body.id).lean();
    expect(String(stored?.groupId)).toBe(String(group._id));

    const unmatched = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'saved-links', data: { url: 'https://primer.si/b', group: 'Ne obstaja' } });

    expect(unmatched.status).toBe(201);
    expect(unmatched.body.warnings[0]).toContain('Ne obstaja');
    // Mapa se NE ustvari: razvrščanje je uporabnikova odločitev.
    expect(await SavedLinkGroupModel.countDocuments({})).toBe(1);
  });

  it('agent ne more pripeti beležke na vrh seznama', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-pin');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['notes'] });

    const res = await request(app)
      .post('/api/v1/ingest')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'notes', data: { body: 'poskus pripenjanja', pinned: true } });

    expect(res.status).toBe(201);
    const note = await NoteModel.findById(res.body.id).lean();
    expect(note?.pinned).toBe(false);
  });
});

describe('pot na cilj in shema za Custom GPT Action', () => {
  it('POST /ingest/recipes shrani enako kot /ingest s "target" v telesu', async () => {
    // Custom GPT Action izbira med ORODJI in ne med vrednostmi polja, zato potrebuje eno pot na
    // cilj. Obe obliki morata voditi v isto kodo — sicer bi bili dve pogodbi in ne dva zapisa ene.
    const app = await boot();
    const user = await login(app, 'kc-ingest-path');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['recipes'] });

    const res = await request(app)
      .post('/api/v1/ingest/recipes')
      .set('X-API-Key', key.body.secret)
      .send({ title: 'Prek poti', url: 'https://primer.si/recept' });

    expect(res.status).toBe(201);
    expect(res.body.target).toBe('recipes');
    const recipe = await RecipeModel.findById(res.body.id).lean();
    expect(String(recipe?.ownerId)).toBe(user.userId);
  });

  it('pot prevlada nad nasprotujočim "target" v telesu', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-path-wins');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['recipes', 'notes'] });

    const res = await request(app)
      .post('/api/v1/ingest/notes')
      .set('X-API-Key', key.body.secret)
      .send({ target: 'recipes', body: 'to je beležka' });

    expect(res.status).toBe(201);
    expect(res.body.target).toBe('notes');
    expect(await NoteModel.countDocuments({})).toBe(1);
    expect(await RecipeModel.countDocuments({})).toBe(0);
  });

  it('"targets" in "openapi.json" nista razumljena kot imeni ciljev', async () => {
    // Brez pravilnega vrstnega reda poti bi ju `/ingest/:target` ujel in bi GET postal POST cilj.
    const app = await boot();
    const user = await login(app, 'kc-ingest-shadow');
    const res = await request(app)
      .get('/api/v1/ingest/targets')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('shema za Action je veljaven OpenAPI z eno operacijo na cilj', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-schema');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['recipes'] });

    const res = await request(app)
      .get('/api/v1/ingest/openapi.json')
      .set('X-API-Key', key.body.secret);

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.servers[0].url).toBe('http://localhost:3000');
    // Samo cilji TEGA ključa — shema ne sme razkriti modulov, do katerih ključ nima dostopa.
    expect(Object.keys(res.body.paths)).toEqual(['/api/v1/ingest/recipes']);

    const op = res.body.paths['/api/v1/ingest/recipes'].post;
    expect(op.operationId).toBe('shrani_recipes');
    const schema = op.requestBody.content['application/json'].schema;
    expect(schema.required).toEqual(['title']);
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).toContain('ingredients');
    // Ključ v shemi NE sme biti — vpiše se ločeno v zavihku Authentication.
    expect(JSON.stringify(res.body)).not.toContain(key.body.secret);
    expect(res.body.components.securitySchemes.apiKey.name).toBe('X-API-Key');
  });

  it('operationId za cilj z vezajem je veljaven', async () => {
    // Action dovoli samo `[A-Za-z0-9_-]`; `saved-links` bi kot `shrani_saved-links` še šlo, a
    // podčrtaj je varnejši pri vseh različicah.
    const app = await boot();
    const user = await login(app, 'kc-ingest-schema-dash');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['saved-links'] });

    const res = await request(app)
      .get('/api/v1/ingest/openapi.json')
      .set('X-API-Key', key.body.secret);

    const op = res.body.paths['/api/v1/ingest/saved-links'].post;
    expect(op.operationId).toBe('shrani_saved_links');
    expect(op.operationId).toMatch(/^[A-Za-z0-9_]+$/);
  });
});

describe('cilji, ki jih klicatelj sme uporabiti', () => {
  it('seznam za ključ je omejen na njegove cilje', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-targets');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['recipes'] });

    const res = await request(app).get('/api/v1/ingest/targets').set('X-API-Key', key.body.secret);

    expect(res.status).toBe(200);
    expect(res.body.map((t: { key: string }) => t.key)).toEqual(['recipes']);
    expect(res.body[0].fields.length).toBeGreaterThan(0);
  });

  it('prijavljen človek vidi vse cilje, za katere ima obsege', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-human-targets');
    const res = await request(app)
      .get('/api/v1/ingest/targets')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.map((t: { key: string }) => t.key).sort()).toEqual([
      'notes',
      'recipes',
      'saved-links',
    ]);
  });
});

describe('navodilo za obstoječ ključ', () => {
  it('se da prebrati znova, a brez ključa', async () => {
    const app = await boot();
    const user = await login(app, 'kc-ingest-reread');
    const key = await issueKey(app, user.accessToken, { label: 'gpt', targets: ['recipes'] });

    const res = await request(app)
      .get(`/api/v1/ingest/keys/${key.body.id}/instructions`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.secretAvailable).toBe(false);
    expect(res.body.instructions).toContain('<TVOJ-KLJUC>');
    expect(res.body.instructions).not.toContain(key.body.secret);
  });
});
