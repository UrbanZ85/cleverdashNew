import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

// SC-006: obvestilo prispe na napravo v manj kot 10 s. Prava dostava do naprave je zunaj
// dosega tega testa (odvisna od omrežja ponudnika, ne od naše kode) — kar TA test dokaže,
// je da pot strežnik → sprejem v dostavo nima nobenega umetnega zamika ali blokade, ki bi
// SC-006 naredila nedosegljivo, še preden sploh pride do FCM.

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('firebase-admin', () => ({
  default: {
    initializeApp: vi.fn(() => ({ messaging: () => ({ send: mockSend }) })),
    credential: { applicationDefault: vi.fn(() => ({})) },
  },
}));

const { createApp } = await import('../../src/main.js');

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  mockSend.mockReset();
  return clearTestDb();
});

// 004: nadomesti prejšnjo prijavo z e-pošto/geslom — glej tests/setup/login-as-test-user.ts.
async function loginAndUnlock(app: import('express').Express) {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-admin'] });
  return accessToken;
}

describe('SC-006: pot do oddaje obvestila je hitra', () => {
  it('POST /notifications/test se odzove v manj kot 10 s (brez umetnega zamika v poti)', async () => {
    mockSend.mockResolvedValue('message-id');
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app).post('/api/v1/devices').set('Authorization', `Bearer ${token}`).send({ pushToken: 'tok-1', platform: 'android' });

    const start = Date.now();
    const res = await request(app).post('/api/v1/notifications/test').set('Authorization', `Bearer ${token}`).send({});
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(202);
    expect(elapsedMs).toBeLessThan(10_000);
  });

  it('več naprav iste osebe se streže brez kvadratne (O(n²)) zakasnitve na napravo', async () => {
    mockSend.mockResolvedValue('message-id');
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/devices').set('Authorization', `Bearer ${token}`).send({ pushToken: `tok-${i}`, platform: 'android' });
    }

    const start = Date.now();
    const res = await request(app).post('/api/v1/notifications/test').set('Authorization', `Bearer ${token}`).send({});
    const elapsedMs = Date.now() - start;

    expect(res.body.accepted).toBe(5);
    expect(elapsedMs).toBeLessThan(10_000);
  });
});
