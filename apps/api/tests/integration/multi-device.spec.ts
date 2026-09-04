import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

// FR-017: vsaka naprava ima svojo sejo (KeycloakSession); odjava na eni ne odjavi druge.
//
// 004: prejšnji drugi test tega dokumenta ("zloraba žetona ene naprave ne prekliče druge
// družine") je testiral CleverDashevo LASTNO zaznavo ponovne uporabe obnovitvenega žetona
// (`RefreshTokenModel`, `used`/`replacedBy` veriga) — ta mehanizem je odstranjen, ker
// rotacijo obnovitvenega žetona zdaj izvaja Keycloak sam (research.md §2); CleverDash nima
// več lastne logike, ki bi jo bilo tu smiselno testirati.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('več naprav iste osebe', () => {
  it('odjava na eni napravi ne odjavi druge (ločeni KeycloakSession)', async () => {
    const { app } = await createApp();

    const phone = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-multi-device',
      email: 'multi-device@example.com',
      name: 'Test naprav',
      roles: ['cleverdash-user'],
    });
    const laptop = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-multi-device',
      email: 'multi-device@example.com',
      name: 'Test naprav',
      roles: ['cleverdash-user'],
    });

    await phone.agent.post('/api/v1/auth/logout').set('Authorization', `Bearer ${phone.accessToken}`).expect(200);

    // Prijava telefona je ločena seja (ločen piškotek/agent) od prijave prenosnika — odjava
    // ene ne sme vplivati na drugo.
    const stillWorks = await laptop.agent.post('/api/v1/auth/refresh').send();
    expect(stillWorks.status).toBe(200);
  });
});
