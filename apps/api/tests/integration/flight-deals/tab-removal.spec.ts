import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { TAB_REGISTRY, type TabDefinition } from '../../../src/platform/tabs/registry.js';
import { loginAs } from '../../contract/flight-deals/_helpers.js';

// SC-011, člen I: zavihek Leti je v registru z ENIM vnosom; brez njega ga v GET /tabs ni, vse ostalo
// ostane (vzorec tests/integration/tab-isolation.spec.ts za 008).

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

describe('015: zavihek "Leti" v registru', () => {
  it('vnos obstaja, z angleškim id-jem, slovenskim naslovom in obsegom modula (člen X)', () => {
    const tab = TAB_REGISTRY.find((t) => t.id === 'flight-deals');
    expect(tab).toMatchObject({ title: 'Leti', icon: 'airplane-outline', route: '/flight-deals', order: 12, requiredScopes: ['flight-deals:read'], enabled: true });
    const orders = TAB_REGISTRY.map((t) => t.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('brez vnosa zavihka ni v GET /tabs, drugi zavihki pa ostanejo', async () => {
    const { app } = await createApp();
    const idx = TAB_REGISTRY.findIndex((t) => t.id === 'flight-deals');
    removed = TAB_REGISTRY.splice(idx, 1)[0];
    const user = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/tabs').set({ Authorization: `Bearer ${user.token}` });
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
    expect(ids).not.toContain('flight-deals');
    expect(ids).toContain('dashboard');
    expect(ids).toContain('settings');
  });
});
