import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { TAB_REGISTRY, type TabDefinition } from '../../src/platform/tabs/registry.js';
import { resolveTabs } from '../../src/platform/tabs/resolver.js';
import { fakeKeycloakForTests } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

// SC-005, člen I: dodajanje zavihka je dodajanje enega vnosa v registru (plus ena nova
// mapa, ki tukaj ni relevantna, ker navidezen zavihek nima lastnega modula). Ta test
// dokaže, da EN sam potisk v `TAB_REGISTRY` zadošča — resolver, router in HTTP plast
// potrebujejo ničesar drugega.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  const idx = TAB_REGISTRY.findIndex((t) => t.id === 'navidezen-zavihek');
  if (idx >= 0) TAB_REGISTRY.splice(idx, 1);
  return clearTestDb();
});

// 004: nadomesti prejšnjo prijavo z e-pošto/geslom — glej tests/setup/login-as-test-user.ts.
async function loginAndUnlock(app: import('express').Express) {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-admin'] });
  return accessToken;
}

const FAKE_TAB: TabDefinition = {
  id: 'navidezen-zavihek',
  title: 'Navidezen zavihek',
  icon: 'help-outline',
  route: '/navidezen',
  order: 99,
  enabled: true,
};

describe('nov zavihek zahteva samo en vnos v registru (SC-005)', () => {
  it('resolveTabs() ga vidi takoj, brez sprememb resolverja', async () => {
    expect((await resolveTabs([], null)).map((t) => t.id)).not.toContain(FAKE_TAB.id);
    TAB_REGISTRY.push(FAKE_TAB);
    expect((await resolveTabs([], null)).map((t) => t.id)).toContain(FAKE_TAB.id);
    TAB_REGISTRY.pop();
    expect((await resolveTabs([], null)).map((t) => t.id)).not.toContain(FAKE_TAB.id);
  });

  it('GET /tabs ga vrne takoj po dodajanju, brez sprememb usmerjevalnika', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const before = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`);
    expect(before.body.map((t: { id: string }) => t.id)).not.toContain(FAKE_TAB.id);

    TAB_REGISTRY.push(FAKE_TAB);
    const after = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`);
    expect(after.body.map((t: { id: string }) => t.id)).toContain(FAKE_TAB.id);
  });

  it('odstranitev vnosa ga takoj umakne, brez preostalega stanja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    TAB_REGISTRY.push(FAKE_TAB);
    await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`);
    TAB_REGISTRY.pop();

    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`);
    expect(res.body.map((t: { id: string }) => t.id)).not.toContain(FAKE_TAB.id);
  });
});
