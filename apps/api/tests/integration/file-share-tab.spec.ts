import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { loginAndUnlock, unlock, uploadFile } from '../contract/file-sharing/_helpers.js';

// US5 (P4), FR-071/FR-072/FR-073, research.md §18: `file-sharing` je PRVI zavihek, ki je
// privzeto IZKLOPLJEN — dopolnilo zahteve ga postavlja kot stvar izbire.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv();
  await clearTestDb();
});

describe('Zavihek je privzeto izklopljen (FR-071)', () => {
  it('brez osebne nastavitve ga v meniju NI', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const tabs = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`).expect(200);
    const ids = (tabs.body.tabs ?? tabs.body).map((t: { id: string }) => t.id);
    expect(ids).not.toContain('file-sharing');
    // Drugi zavihki so še vedno tam — izklopljen je natanko ta.
    expect(ids).toContain('dashboard');
  });

  it('je pa na seznamu za UREJANJE menija, sicer ga ne bi bilo mogoče vklopiti', async () => {
    // `resolveTabs` izklopljene namenoma izpusti; `listAllTabsForUser` jih vrne prav zato, da
    // jih zaslon za urejanje lahko pokaže (platform/tabs/resolver.ts).
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const all = await request(app).get('/api/v1/tabs/all').set('Authorization', `Bearer ${token}`).expect(200);
    const entry = (all.body.tabs ?? all.body).find((t: { id: string }) => t.id === 'file-sharing');
    expect(entry, 'zavihka ni na seznamu za urejanje — ne bi ga bilo mogoče vklopiti').toBeTruthy();
    expect(entry.enabled).toBe(false);
  });

  it('po vklopu se pojavi v meniju', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabs: { 'file-sharing': { enabled: true } } })
      .expect(200);

    const tabs = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`).expect(200);
    const ids = (tabs.body.tabs ?? tabs.body).map((t: { id: string }) => t.id);
    expect(ids).toContain('file-sharing');
  });
});

describe('Izklop zavihka NI preklic deljenja (FR-072, FR-073)', () => {
  it('z izklopljenim zavihkom javna povezava deluje naprej', async () => {
    // Nastavitev PRIKAZA ne sme tiho postati stikalo, ki drugim ljudem pretrga prenos.
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    // Zavihek je privzeto izklopljen — datoteka je bila naložena prek API-ja.
    const tabs = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`).expect(200);
    const ids = (tabs.body.tabs ?? tabs.body).map((t: { id: string }) => t.id);
    expect(ids).not.toContain('file-sharing');

    // Prejemnik, ki z zavihki nima nobene zveze, datoteko vseeno dobi.
    await request(app).get(`/api/v1/share/${share.token}`).expect(200);
    const { cookie, res } = await unlock(app, share.token, share.password);
    expect(res.status).toBe(200);
    await request(app).get(`/api/v1/share/${share.token}/content`).set('Cookie', cookie).expect(200);
  });
});
