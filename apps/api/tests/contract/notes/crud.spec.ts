import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedNoteFixture } from './_helpers.js';

// Pogodbeni testi CRUD operacij nad beležkami (007).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('POST /notes', () => {
  it('ustvari beležko in vrne 201 z ID-jem', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Nakup', body: 'Kruh, mleko', tags: ['Dom', 'dom ', 'nakup'] });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe('Nakup');
    // Oznake se normalizirajo (male črke, brez podvojitev) — domain/note-input.ts.
    expect(res.body.tags).toEqual(['dom', 'nakup']);
    expect(res.body.audio).toEqual([]);
  });

  it('brez naslova vzame prvo vrstico vsebine', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Prva vrstica\nDruga vrstica' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Prva vrstica');
  });

  it('prazna beležka je zavrnjena s 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '   ', body: '' });

    expect(res.status).toBe(400);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/notes').send({ body: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /notes', () => {
  it('vrne pripete najprej, nato najnovejše spremenjene', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedNoteFixture({ title: 'Stara', updatedAt: new Date('2026-01-01T10:00:00Z') });
    await seedNoteFixture({ title: 'Nova', updatedAt: new Date('2026-08-01T10:00:00Z') });
    await seedNoteFixture({ title: 'Pripeta', pinned: true, updatedAt: new Date('2025-01-01T10:00:00Z') });

    const res = await request(app).get('/api/v1/notes').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.notes.map((n: { title: string }) => n.title)).toEqual(['Pripeta', 'Nova', 'Stara']);
    expect(res.body.total).toBe(3);
  });

  it('išče po naslovu in vsebini, brez razlikovanja velikih črk', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedNoteFixture({ title: 'Sestanek', body: 'o proračunu' });
    await seedNoteFixture({ title: 'Nakup', body: 'kruh' });

    const byTitle = await request(app).get('/api/v1/notes?query=sestanek').set('Authorization', `Bearer ${token}`);
    expect(byTitle.body.notes).toHaveLength(1);

    const byBody = await request(app).get('/api/v1/notes?query=PRORAČUN').set('Authorization', `Bearer ${token}`);
    expect(byBody.body.notes).toHaveLength(1);
    expect(byBody.body.notes[0].title).toBe('Sestanek');
  });

  it('posebni znaki v iskanju ne podrejo poizvedbe', async () => {
    // Brez ubežnih znakov (escapeRegExp) bi "(" vrgel napako regularnega izraza, ".*" pa bi
    // vrnil vse — oboje bi bilo videti kot pokvarjeno iskanje.
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedNoteFixture({ title: 'Formula', body: 'c++ in (oklepaji)' });

    const res = await request(app).get('/api/v1/notes?query=c%2B%2B').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);

    const wildcard = await request(app).get('/api/v1/notes?query=.*').set('Authorization', `Bearer ${token}`);
    expect(wildcard.body.notes).toHaveLength(0);
  });

  it('filtrira po oznaki in vrne seznam vseh oznak uporabnika', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedNoteFixture({ title: 'A', tags: ['delo'] });
    await seedNoteFixture({ title: 'B', tags: ['dom'] });

    const res = await request(app).get('/api/v1/notes?tag=DELO').set('Authorization', `Bearer ${token}`);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].title).toBe('A');
    expect(res.body.tags).toEqual(['delo', 'dom']);
  });
});

describe('GET /notes/{id}', () => {
  it('vrne beležko s praznim seznamom posnetkov', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();

    const res = await request(app).get(`/api/v1/notes/${note._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.audio).toEqual([]);
  });

  it('neveljaven ID vrne 404, ne 500', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/notes/ni-objectid').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /notes/{id}', () => {
  it('spremeni samo navedena polja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture({ title: 'Naslov', body: 'Vsebina', tags: ['delo'] });

    const res = await request(app)
      .put(`/api/v1/notes/${note._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pinned: true });

    expect(res.status).toBe(200);
    expect(res.body.pinned).toBe(true);
    expect(res.body.title).toBe('Naslov');
    expect(res.body.body).toBe('Vsebina');
    expect(res.body.tags).toEqual(['delo']);
  });

  it('prazna vsebina in prazen naslov skupaj sta zavrnjena', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture({ title: 'Naslov', body: 'Vsebina' });

    const res = await request(app)
      .put(`/api/v1/notes/${note._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '', body: '' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /notes/{id}', () => {
  it('izbriše beležko in vrne 204', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const note = await seedNoteFixture();

    const res = await request(app).delete(`/api/v1/notes/${note._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const after = await request(app).get(`/api/v1/notes/${note._id}`).set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(404);
  });
});
