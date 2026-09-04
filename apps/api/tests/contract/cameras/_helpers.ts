import type { Express } from 'express';
import { CameraModel } from '../../../src/modules/cameras/models/camera.model.js';
import { CameraGroupModel } from '../../../src/modules/cameras/models/camera-group.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser, DEFAULT_IDENTITY } from '../../setup/login-as-test-user.js';

// Skupni pomožniki za pogodbene teste 003 proti
// specs/003-cameras/contracts/openapi.yaml — po vzoru 001/002.

// 004: nadomesti prejšnjo prijavo z e-pošto/geslom — glej tests/setup/login-as-test-user.ts.
// `cleverdash-admin` ohrani vedenje starega bootstrap uporabnika (edini, vedno admin).
export async function loginAndUnlock(app: Express): Promise<string> {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-admin'] });
  return accessToken;
}

/** 004: kamere so zdaj osebni podatek (`userId` obvezen, data-model.md). Klicna mesta v
 * testih sejejo kamere pred ALI po `loginAndUnlock(app)` (oba vrstna reda obstajata v
 * obstoječih testih) — `findOneAndUpdate upsert` je zato varen ne glede na vrstni red: če
 * uporabnik še ne obstaja, ga ustvari; če prijava steče kasneje, `/auth/callback`
 * (`findOrCreateUser`) najde isti zapis prek `keycloakSubject`, ne ustvari dvojnika. */
async function defaultTestUserId(): Promise<string> {
  const user = await UserModel.findOneAndUpdate(
    { keycloakSubject: DEFAULT_IDENTITY.sub },
    { $setOnInsert: { email: DEFAULT_IDENTITY.email, displayName: DEFAULT_IDENTITY.name, scopes: [] } },
    { upsert: true, new: true },
  );
  return String(user._id);
}

/** Zasadi eno minimalno veljavno kamero (vrsta `iframe`, dovoljen gostitelj `youtube.com`). */
export async function seedCameraFixture(overrides: Partial<Record<string, unknown>> = {}) {
  const userId = overrides.userId ?? (await defaultTestUserId());
  return CameraModel.create({
    userId,
    name: 'Testna kamera',
    type: 'iframe',
    previewUrl: 'https://www.youtube.com/embed/test',
    order: 0,
    ...overrides,
  });
}

export async function seedCameraGroupFixture(overrides: Partial<Record<string, unknown>> = {}) {
  const userId = overrides.userId ?? (await defaultTestUserId());
  return CameraGroupModel.create({ userId, name: 'Testna skupina', order: 0, ...overrides });
}
