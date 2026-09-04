import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';
import { TrackingLocationModel } from '../../src/modules/time-tracking/models/tracking-location.model.js';
import { RemoteSessionModel } from '../../src/modules/time-tracking/models/remote-session.model.js';

// 005: meni mora pokazati, KATERI vir se uporablja za beleženje časa in ali ta vir živi.
// Podatek prispeva modul prek platform/tabs/extension.ts — člen I (platform ne uvaža modula).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedLocation(userId: string, opts: { status: string; name?: string; url?: string }) {
  const session = await RemoteSessionModel.create({
    userId,
    name: 'Seja',
    cookieName: 'ItcClientID',
    cookieValue: 'zelo-skrivna-vrednost-piskotka',
    cookieDomain: 'e-racuni.com',
    status: opts.status,
  });
  await TrackingLocationModel.create({
    userId,
    name: opts.name ?? 'Agenda',
    url: opts.url ?? 'https://e-racuni.com/S6a/Clockin-test',
    sessionId: session._id,
    coordinateTemplate: { latitude: '46.0629_6', longitude: '14.5602_1' },
  });
  return session;
}

function tabById(body: Array<{ id: string; detail?: unknown }>, id: string) {
  return body.find((t) => t.id === id);
}

describe('GET /tabs — dodatek zavihka "Beleženje časa"', () => {
  it('brez nastavljene lokacije pove, da vir ni nastavljen', async () => {
    const { app } = await createApp();
    const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-user'] });

    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(tabById(res.body, 'time-tracking')?.detail).toEqual({
      subtitle: 'Ni nastavljene lokacije',
      status: 'warning',
      statusLabel: 'ni nastavljeno',
    });
  });

  it('pokaže ime lokacije in gostitelja portala, brez piškotka', async () => {
    const { app } = await createApp();
    const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-user'] });
    await seedLocation(userId, { status: 'active' });

    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${accessToken}`);
    const detail = tabById(res.body, 'time-tracking')?.detail as { subtitle: string; status: string };
    expect(detail.subtitle).toBe('Agenda — e-racuni.com');
    expect(detail.status).toBe('ok');

    // FR-092: vrednost piškotka ne sme uiti v noben odgovor, tudi ne prek menija.
    expect(JSON.stringify(res.body)).not.toContain('zelo-skrivna-vrednost-piskotka');
  });

  it.each([
    ['expiring', 'warning', 'seji poteče'],
    ['expired', 'danger', 'seja potekla'],
    ['unknown', 'warning', 'ni preverjeno'],
  ])('stanje seje "%s" da značko %s', async (sessionStatus, expectedStatus, expectedLabel) => {
    const { app } = await createApp();
    const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-user'] });
    await seedLocation(userId, { status: sessionStatus });

    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${accessToken}`);
    expect(tabById(res.body, 'time-tracking')?.detail).toMatchObject({
      status: expectedStatus,
      statusLabel: expectedLabel,
    });
  });

  it('več lokacij: prva po imenu, ostale kot števec', async () => {
    const { app } = await createApp();
    const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-user'] });
    await seedLocation(userId, { status: 'active', name: 'Agenda' });
    await seedLocation(userId, { status: 'active', name: 'Terensko delo' });

    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${accessToken}`);
    const detail = tabById(res.body, 'time-tracking')?.detail as { subtitle: string };
    expect(detail.subtitle).toBe('Agenda — e-racuni.com +1');
  });

  it('dodatek je oseben — tuja lokacija se ne pojavi', async () => {
    const { app } = await createApp();
    const a = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-detail-a',
      email: 'detail-a@example.com',
      roles: ['cleverdash-user'],
    });
    const b = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-detail-b',
      email: 'detail-b@example.com',
      roles: ['cleverdash-user'],
    });
    await seedLocation(a.userId, { status: 'active', name: 'Samo moja' });

    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${b.accessToken}`);
    const detail = tabById(res.body, 'time-tracking')?.detail as { subtitle: string };
    expect(detail.subtitle).toBe('Ni nastavljene lokacije');
  });

  it('zavihki brez ponudnika nimajo dodatka', async () => {
    const { app } = await createApp();
    const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-user'] });
    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${accessToken}`);
    expect(tabById(res.body, 'dashboard')).not.toHaveProperty('detail');
    expect(tabById(res.body, 'cameras')).not.toHaveProperty('detail');
  });

  it('neveljaven URL lokacije ne podre menija', async () => {
    const { app } = await createApp();
    const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-user'] });
    await seedLocation(userId, { status: 'active', name: 'Čudna', url: 'ni-url' });

    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect((tabById(res.body, 'time-tracking')?.detail as { subtitle: string }).subtitle).toBe('Čudna');
  });
});
