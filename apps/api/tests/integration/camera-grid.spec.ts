import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture } from '../contract/cameras/_helpers.js';

// quickstart.md §3.1: mreža s 3+ kamerami različnih vrst, `GET /cameras` vrne vse s
// `health`. Konec-do-konca: sejanje → HTTP klic → oblika odgovora, ne samo posamezna plast.

beforeAll(async () => {
  setTestEnv({ CAMERA_ALLOWED_EMBED_HOSTS: 'youtube.com,ipcamlive.com' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});

// 004: `openid-client` (Keycloak) uporablja isti globalni `fetch` — klici proti ponarejenemu
// Keycloaku (127.0.0.1) MORAJO iti do resničnega omrežja, ne v spodnje ročne mocke.
const realFetch = globalThis.fetch;

describe('Mreža predogledov — US1 konec-do-konca', () => {
  it('trije tipi kamer (iframe, snapshot, snapshot+iframe) se vrnejo z ustreznim zdravjem', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).includes('127.0.0.1')) return realFetch(input, init);
        return new Response(Buffer.from('jpeg'), { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }),
    );

    const iframeCam = await seedCameraFixture({
      name: 'YouTube Goli',
      type: 'iframe',
      previewUrl: 'https://www.youtube.com/embed/goli',
      order: 0,
    });
    const snapshotCam = await seedCameraFixture({
      name: 'Ipcamlive Planina',
      type: 'snapshot',
      previewUrl: 'https://g0.ipcamlive.com/player/snapshot.php?alias=znpvkamera2',
      order: 1,
    });
    const comboCam = await seedCameraFixture({
      name: 'Kombinirana',
      type: 'snapshot+iframe',
      previewUrl: 'https://g0.ipcamlive.com/player/snapshot.php?alias=x',
      fullUrl: 'https://ipcamlive.com/player/player.php?alias=x',
      order: 2,
    });

    // Zajemi posnetek za snapshotCam, da je njeno zdravje "ok", ne "unknown".
    await request(app).get(`/api/v1/cameras/${snapshotCam._id}/snapshot`).set('Authorization', `Bearer ${token}`);

    const res = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cameras).toHaveLength(3);

    const byId = (id: unknown) => res.body.cameras.find((c: { id: string }) => c.id === String(id));
    expect(byId(iframeCam._id).health.state).toBe('not-applicable');
    expect(byId(snapshotCam._id).health.state).toBe('ok');
    expect(byId(comboCam._id).health.state).toBe('unknown'); // še ni zajet posnetek zanjo
  });

  it('neaktivna kamera se z includeInactive=false izloči iz mreže, ostale se ne motijo', async () => {
    await seedCameraFixture({ name: 'Aktivna', order: 0 });
    await seedCameraFixture({ name: 'Neaktivna', order: 1, active: false });

    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/cameras?includeInactive=false').set('Authorization', `Bearer ${token}`);
    expect(res.body.cameras.map((c: { name: string }) => c.name)).toEqual(['Aktivna']);
  });
});
