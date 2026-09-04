import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';
import { SettingsModel } from '../../src/modules/settings/model.js';
import { CameraModel } from '../../src/modules/cameras/models/camera.model.js';

// research.md §7, FR-013/FR-014, quickstart.md §6: pred 004 je bila aplikacija
// enouporabniška — obstoječi dokumenti nimajo `userId`. Ta test simulira tako stanje z
// neposrednim vpisom v zbirko (mimo Mongoose modela, ki `userId` zdaj zahteva) in preveri
// migration.service.ts, klican iz GET /auth/callback (router.ts).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Prevzem podedovanih podatkov brez userId ob prvi prijavi admina (FR-013/FR-014)', () => {
  it('prva prijava admina pripiše osirotele dokumente njemu; poznejši nov uporabnik jih NE podeduje', async () => {
    const { app } = await createApp();

    // Simulacija stanja pred 004: dokumenta brez `userId`, vpisana mimo Mongoose modela
    // (ta ga zdaj zahteva, zato `Model.create()` tu ne bi uspel).
    await SettingsModel.collection.insertOne({
      theme: 'dark',
      tiles: [],
      tabs: {},
      cameraDataSaverEnabled: true,
      updatedAt: new Date(),
    });
    await CameraModel.collection.insertOne({
      name: 'Stara kamera',
      url: 'https://example.test/legacy.jpg',
      order: 1,
      active: true,
    });

    const { accessToken: adminToken, agent: adminAgent } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-legacy-admin',
      email: 'legacy-admin@example.com',
      name: 'Prevzemni admin',
      roles: ['cleverdash-admin'],
    });
    const adminMe = await adminAgent.get('/api/v1/auth/me').set('Authorization', `Bearer ${adminToken}`);
    const adminUserId = adminMe.body.id as string;

    const settingsAfter = await SettingsModel.findOne({}).lean();
    expect(String(settingsAfter?.userId)).toBe(adminUserId);
    const cameraAfter = await CameraModel.findOne({}).lean();
    expect(String(cameraAfter?.userId)).toBe(adminUserId);

    const adminUser = await UserModel.findById(adminUserId).lean();
    expect(adminUser?.migratedLegacyDataAt).not.toBeNull();

    // Drugi, poznejši admin — podedovani podatki so že v lasti prvega admina, zato zanj ni
    // ničesar za prevzeti (FR-014).
    const { accessToken: secondToken, agent: secondAgent } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-legacy-admin-2',
      email: 'legacy-admin-2@example.com',
      name: 'Drugi admin',
      roles: ['cleverdash-admin'],
    });
    const secondMe = await secondAgent.get('/api/v1/auth/me').set('Authorization', `Bearer ${secondToken}`);
    const secondUserId = secondMe.body.id as string;

    const settingsStill = await SettingsModel.findOne({}).lean();
    expect(String(settingsStill?.userId)).toBe(adminUserId);
    expect(String(settingsStill?.userId)).not.toBe(secondUserId);
    const cameraStill = await CameraModel.findOne({}).lean();
    expect(String(cameraStill?.userId)).toBe(adminUserId);
  });

  it('prijava navadnega uporabnika (brez admin scope-a) ne sproži prevzema', async () => {
    const { app } = await createApp();
    await CameraModel.collection.insertOne({
      name: 'Stara kamera 2',
      url: 'https://example.test/legacy2.jpg',
      order: 1,
      active: true,
    });

    await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-legacy-plain-user',
      email: 'plain-user@example.com',
      name: 'Navaden uporabnik',
      roles: ['cleverdash-user'],
    });

    const cameraAfter = await CameraModel.findOne({}).lean();
    expect(cameraAfter?.userId).toBeUndefined();
  });
});
