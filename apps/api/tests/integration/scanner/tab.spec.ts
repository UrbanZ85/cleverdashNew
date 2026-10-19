import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { TAB_REGISTRY, type TabDefinition } from '../../../src/platform/tabs/registry.js';
import { loginAs } from '../../contract/scanner/_helpers.js';

// FR-040, člen I: zavihek Skenerji je v registru z ENIM vnosom; brez njega ga v GET /tabs ni, vse
// ostalo ostane (vzorec tests/integration/flight-deals/tab-removal.spec.ts).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);

let removed: TabDefinition | undefined;
afterEach(async () => {
  if (removed) {
    TAB_REGISTRY.push(removed);
    removed = undefined;
  }
  await clearTestDb();
});

describe('016: zavihek "Skenerji" v registru', () => {
  it('vnos obstaja, z angleškim id-jem, slovenskim naslovom in obsegom jedra (člen X); order je enoličen', () => {
    const tab = TAB_REGISTRY.find((t) => t.id === 'scanners');
    expect(tab).toMatchObject({ title: 'Skenerji', icon: 'scan-outline', route: '/scanners', order: 13, requiredScopes: ['scanners:read'], enabled: true });
    const orders = TAB_REGISTRY.map((t) => t.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('navaden uporabnik ga dobi v GET /tabs; brez vnosa ga ni, drugi zavihki pa ostanejo', async () => {
    const { app } = await createApp();
    const user = await loginAs(app, 'ana');
    const withTab = await request(app).get('/api/v1/tabs').set({ Authorization: `Bearer ${user.token}` });
    expect((withTab.body as Array<{ id: string }>).map((t) => t.id)).toContain('scanners');

    const idx = TAB_REGISTRY.findIndex((t) => t.id === 'scanners');
    removed = TAB_REGISTRY.splice(idx, 1)[0];
    const res = await request(app).get('/api/v1/tabs').set({ Authorization: `Bearer ${user.token}` });
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
    expect(ids).not.toContain('scanners');
    expect(ids).toContain('flight-deals');
    expect(ids).toContain('dashboard');
  });
});
