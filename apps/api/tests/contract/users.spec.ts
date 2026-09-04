import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';

// FR-070 do FR-075: imenik uporabnikov za izbiro osebe.
//
// Ta endpoint živi v platform/users/, ne v modulu opravil — izbira osebe ni pojem opravil in
// mora preživeti odstranitev katerega koli modula (člen I). Zato tudi ne zahteva obsega
// `todos:*`, ampak samo veljavno avtentikacijo.
//
// Najpomembnejši test v datoteki je projekcija: če vanjo kdaj uide cel e-poštni naslov ali
// `keycloakSubject`, dobi vsak prijavljen uporabnik podatke, ki mu ne pripadajo.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function login(app: Parameters<typeof loginAsTestUser>[0], key: string) {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-${key}`,
    email: `${key}.priimek@agenda.si`,
    name: `Ime ${key.toUpperCase()}`,
    roles: ['cleverdash-user'],
  });
  return { token: accessToken, userId };
}

describe('GET /users — imenik za deljenje', () => {
  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/users')).status).toBe(401);
  });

  it('vrne druge uporabnike z imenom in začetnicami', async () => {
    const { app } = await createApp();
    await login(app, 'b');
    const a = await login(app, 'a');

    const res = await request(app).get('/api/v1/users').set({ Authorization: `Bearer ${a.token}` });

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].displayName).toBe('Ime B');
    expect(res.body.users[0].initials).toBe('IB');
    expect(res.body.users[0].id).toBeTruthy();
  });

  it('e-pošta je ZAMASKIRANA — cel naslov se ne vrne nikoli (FR-072)', async () => {
    const { app } = await createApp();
    await login(app, 'b');
    const a = await login(app, 'a');

    const res = await request(app).get('/api/v1/users').set({ Authorization: `Bearer ${a.token}` });

    const vnos = res.body.users[0];
    // Lokalni del je `b.priimek`: prva črka `b`, zadnja `k`.
    expect(vnos.emailHint).toBe('b…k@agenda.si');
    // Cel naslov ne sme biti nikjer v odgovoru, niti v kakem drugem polju.
    expect(JSON.stringify(res.body)).not.toContain('b.priimek@agenda.si');
  });

  it('odgovor NE vsebuje keycloakSubject, scopes ne migratedLegacyDataAt (FR-073)', async () => {
    const { app } = await createApp();
    await login(app, 'b');
    const a = await login(app, 'a');

    const res = await request(app).get('/api/v1/users').set({ Authorization: `Bearer ${a.token}` });

    const telo = JSON.stringify(res.body);
    expect(telo).not.toContain('keycloakSubject');
    expect(telo).not.toContain('kc-sub-b');
    expect(telo).not.toContain('scopes');
    expect(telo).not.toContain('migratedLegacyDataAt');
    // Preverjeno tudi po ključih, ne samo po nizu.
    expect(Object.keys(res.body.users[0]).sort()).toEqual([
      'displayName',
      'emailHint',
      'id',
      'initials',
    ]);
  });

  it('privzeto izpusti klicatelja — sebi seznama ni smiselno deliti', async () => {
    const { app } = await createApp();
    await login(app, 'b');
    const a = await login(app, 'a');

    const res = await request(app).get('/api/v1/users').set({ Authorization: `Bearer ${a.token}` });
    expect(res.body.users.map((u: { id: string }) => u.id)).not.toContain(a.userId);

    const zSabo = await request(app)
      .get('/api/v1/users?excludeSelf=false')
      .set({ Authorization: `Bearer ${a.token}` });
    expect(zSabo.body.users.map((u: { id: string }) => u.id)).toContain(a.userId);
  });

  it('uporabnik, ki se še NI prijavil, ni v imeniku (FR-070)', async () => {
    const { app } = await createApp();
    const a = await login(app, 'a');

    // Zapis lahko nastane tudi mimo prijave (npr. prevzem podedovanih podatkov). Ponuditi
    // človeka, ki se ne more prijaviti, je obljuba, ki je ni mogoče izpolniti.
    await UserModel.create({
      keycloakSubject: 'kc-sub-nikoli',
      email: 'nikoli@agenda.si',
      displayName: 'Nikoli Prijavljen',
      scopes: [],
      lastLoginAt: null,
    });

    const res = await request(app).get('/api/v1/users').set({ Authorization: `Bearer ${a.token}` });
    expect(res.body.users.map((u: { displayName: string }) => u.displayName)).not.toContain(
      'Nikoli Prijavljen',
    );
  });

  it('iskanje filtrira po imenu, neobčutljivo na velike črke', async () => {
    const { app } = await createApp();
    await login(app, 'b');
    await login(app, 'c');
    const a = await login(app, 'a');

    const res = await request(app)
      .get('/api/v1/users?query=ime%20b')
      .set({ Authorization: `Bearer ${a.token}` });

    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].displayName).toBe('Ime B');
  });
});
