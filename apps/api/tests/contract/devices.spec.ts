import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// `firebase-admin` zahteva prave poverilnice (montirana datoteka, člen IV), ki jih v
// testih ni — prevaramo ga, da ne kliče pravega omrežja. `vi.hoisted` je potreben, ker
// vitest dvigne `vi.mock` klice nad uvoze; mutable referenca omogoča, da vsak test
// nastavi svoj izid pošiljanja.
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

async function loginAndUnlock(app: import('express').Express) {
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@example.com', password: 'zacetno-geslo-12', platform: 'android' });
  await request(app)
    .post('/api/v1/auth/password')
    .set('Authorization', `Bearer ${login.body.accessToken}`)
    .send({ currentPassword: 'zacetno-geslo-12', newPassword: 'novo-mocno-geslo-123' });
  return login.body.accessToken as string;
}

describe('/devices', () => {
  it('POST registrira napravo, GET jo vrne', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const created = await request(app)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ pushToken: 'tok-abc', platform: 'android' });
    expect(created.status).toBe(201);
    expect(created.body.channels).toEqual(['system']);

    const list = await request(app).get('/api/v1/devices').set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(1);
  });

  it('ponovna registracija istega žetona posodobi zapis, ne podvoji ga (FR-030)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    await request(app).post('/api/v1/devices').set('Authorization', `Bearer ${token}`).send({ pushToken: 'tok-x', platform: 'web' });
    await request(app).post('/api/v1/devices').set('Authorization', `Bearer ${token}`).send({ pushToken: 'tok-x', platform: 'android' });

    const list = await request(app).get('/api/v1/devices').set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].platform).toBe('android');
  });

  it('DELETE odjavi napravo', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const created = await request(app)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ pushToken: 'tok-del', platform: 'web' });

    const res = await request(app).delete(`/api/v1/devices/${created.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(await request(app).get('/api/v1/devices').set('Authorization', `Bearer ${token}`)).toMatchObject({
      body: [],
    });
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/devices');
    expect(res.status).toBe(401);
  });
});

describe('/notifications/test', () => {
  it('uspešna dostava vrne accepted:1, removedTokens:0', async () => {
    mockSend.mockResolvedValue('message-id');
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app).post('/api/v1/devices').set('Authorization', `Bearer ${token}`).send({ pushToken: 'tok-ok', platform: 'android' });

    const res = await request(app).post('/api/v1/notifications/test').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: 1, removedTokens: 0 });
  });

  it('zavrnjen žeton se šteje v removedTokens in se dejansko odstrani (FR-034)', async () => {
    const err = Object.assign(new Error('not registered'), { code: 'messaging/registration-token-not-registered' });
    mockSend.mockRejectedValue(err);
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app).post('/api/v1/devices').set('Authorization', `Bearer ${token}`).send({ pushToken: 'tok-bad', platform: 'android' });

    const res = await request(app).post('/api/v1/notifications/test').set('Authorization', `Bearer ${token}`).send({});
    expect(res.body).toEqual({ accepted: 0, removedTokens: 1 });

    const list = await request(app).get('/api/v1/devices').set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(0);
  });
});
