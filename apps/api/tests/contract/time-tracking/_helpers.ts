import type { Express } from 'express';
import { RemoteSessionModel } from '../../../src/modules/time-tracking/models/remote-session.model.js';
import { TrackingLocationModel } from '../../../src/modules/time-tracking/models/tracking-location.model.js';
import { TrackingProfileModel } from '../../../src/modules/time-tracking/models/tracking-profile.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser, DEFAULT_IDENTITY } from '../../setup/login-as-test-user.js';

// Skupni pomožniki za pogodbene teste 002 proti
// specs/002-time-tracking/contracts/openapi.yaml — enak namen kot ponavljajoča se
// `loginAndUnlock` v 001-ovih integracijskih testih, samo zbrana na enem mestu, ker jo
// potrebuje ~10 datotek pogodbenih testov te funkcionalnosti.
//
// 004: nadomesti prejšnjo prijavo z e-pošto/geslom (prijava + obvezna menjava gesla +
// ponovna prijava) — glej tests/setup/login-as-test-user.ts. `cleverdash-admin` ohrani
// vedenje starega bootstrap uporabnika (edini, vedno admin).
export async function loginAndUnlock(app: Express): Promise<string> {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-admin'] });
  return accessToken;
}

/** 004: beleženje časa je zdaj osebni podatek (`userId` obvezen, data-model.md). Enak vzorec
 * kot cameras/_helpers.ts `defaultTestUserId` — `upsert` je varen ne glede na to, ali je
 * `loginAndUnlock(app)` že steklo. */
export async function defaultTestUserId(): Promise<string> {
  const user = await UserModel.findOneAndUpdate(
    { keycloakSubject: DEFAULT_IDENTITY.sub },
    { $setOnInsert: { email: DEFAULT_IDENTITY.email, displayName: DEFAULT_IDENTITY.name, scopes: [] } },
    { upsert: true, new: true },
  );
  return String(user._id);
}

/** Zasadi minimalno verigo RemoteSession → TrackingLocation → TrackingProfile, ki jo
 * potrebuje večina endpointov 002. */
export async function seedProfileFixture(overrides: {
  userId?: string;
  profile?: Partial<Record<string, unknown>>;
  location?: Partial<Record<string, unknown>>;
} = {}) {
  const userId = overrides.userId ?? (await defaultTestUserId());
  const session = await RemoteSessionModel.create({
    userId,
    name: 'Testna seja',
    cookieName: 'ItcClientID',
    cookieValue: 'test-cookie-value',
    cookieDomain: 'e-racuni.com',
    status: 'active',
  });
  const location = await TrackingLocationModel.create({
    userId,
    name: 'Testna lokacija',
    url: 'https://e-racuni.com/S6a/Clockin-test',
    sessionId: session._id,
    coordinateTemplate: { latitude: '46.0629_6', longitude: '14.5602_9' },
    ...overrides.location,
  });
  const profile = await TrackingProfileModel.create({
    userId,
    name: 'Testni profil',
    daysOfWeek: [1, 2, 3, 4, 5],
    locationId: location._id,
    mode: 'AUTO',
    actions: [
      { actionName: 'Prijava na delo', localTime: '06:00:00', jitterSeconds: 0, order: 1 },
      { actionName: 'Konec dela', localTime: '14:00:00', jitterSeconds: 0, order: 2 },
    ],
    ...overrides.profile,
  });
  return { session, location, profile };
}
