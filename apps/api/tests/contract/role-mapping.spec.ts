import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';
import { resetIntrospectionCacheForTests } from '../../src/platform/keycloak/introspection-cache.js';

// US3, T056, FR-006/FR-011/FR-012, SC-003: sprememba Keycloak vloge MED aktivno sejo se
// odrazi na naslednji zahtevi z ISTIM dostopnim žetonom, BREZ nove prijave — dokler
// `introspection-cache.ts` predpomni prejšnji odgovor, se sprememba ne pozna takoj, a
// najkasneje po izteku `KEYCLOAK_INTROSPECTION_CACHE_SECONDS` (tu simulirano deterministično
// z `resetIntrospectionCacheForTests()`, ne z resničnim čakanjem).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Sprememba Keycloak vloge med aktivno sejo (US3, FR-011/FR-012)', () => {
  it('dodelitev administratorske vloge da scope "admin" na naslednji zahtevi, brez nove prijave', async () => {
    const { app } = await createApp();
    const sub = 'kc-sub-role-promote';
    const { accessToken, agent } = await loginAsTestUser(app, fakeKeycloak, {
      sub,
      email: 'promote@example.com',
      roles: ['cleverdash-user'],
    });

    const before = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(before.body.scopes).not.toContain('admin');

    // Skrbnik v Keycloaku doda administratorsko vlogo temu ŽE izdanemu dostopnemu žetonu.
    fakeKeycloak.setRolesForSub(sub, ['cleverdash-user', 'cleverdash-admin']);

    // Predpomnjena introspekcija bi še vedno vrnila staro stanje — dokler ne poteče.
    const stillCached = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(stillCached.body.scopes).not.toContain('admin');

    // Simulira iztek `KEYCLOAK_INTROSPECTION_CACHE_SECONDS` — ISTI žeton, brez nove prijave.
    resetIntrospectionCacheForTests();
    const after = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(200);
    expect(after.body.scopes).toEqual(['admin']);
  });

  it('odvzem VSEH prepoznanih vlog prekine dostop na naslednji zahtevi (FR-006, SC-003)', async () => {
    const { app } = await createApp();
    const sub = 'kc-sub-role-revoke';
    const { accessToken, agent } = await loginAsTestUser(app, fakeKeycloak, {
      sub,
      email: 'revoke@example.com',
      roles: ['cleverdash-admin'],
    });

    const before = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(before.body.scopes).toEqual(['admin']);

    fakeKeycloak.setRolesForSub(sub, []); // odvzeta vloga/skupina v Keycloaku
    resetIntrospectionCacheForTests();

    const after = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
  });
});
