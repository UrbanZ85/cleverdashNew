import type { Express } from 'express';
import { createHash } from 'node:crypto';
import { ApiKeyModel } from '../../../src/platform/apikeys/model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';

// Skupni pomožniki za pogodbene teste 014 proti
// specs/014-admin-analytics/contracts/openapi.yaml — po vzoru tests/contract/recipes/_helpers.ts.
//
// Prijava gre skozi PRAVI tok (fakeKeycloak → /auth/callback → /auth/refresh) in ne skozi ročno
// ustvarjeno sejo. Pri tej funkcionalnosti to ni le doslednost: prav ta tok je tisti, ki prijavo
// PREŠTEJE (platform/usage/recorder.service.ts, klican iz modules/auth/router.ts). Ročno ustvarjena
// seja bi vse teste o številu prijav naredila brezpredmetne.

export interface TestUser {
  token: string;
  userId: string;
}

export async function loginAsAdmin(app: Express, key = 'admin'): Promise<TestUser> {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-${key}`,
    email: `${key}@agenda.si`,
    name: 'Administrator Admin',
    roles: ['cleverdash-admin'],
  });
  return { token: accessToken, userId };
}

export async function loginAsUser(app: Express, key: string): Promise<TestUser> {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-${key}`,
    email: `${key}@agenda.si`,
    name: `Uporabnik ${key.toUpperCase()}`,
    roles: ['cleverdash-user'],
  });
  return { token: accessToken, userId };
}

/**
 * API ključ z obsegom `admin`, ustvarjen NEPOSREDNO V BAZI.
 *
 * Prek `POST /api-keys` tak ključ ne more nastati (platform/apikeys/router.ts obsega `admin` ne
 * dovoli dodeliti). Prav zato je tu sejan mimo tiste poti: test mora dokazati, da analitiko zapira
 * LASTEN pogoj v `admin-guard.ts`, in ne to, da je nekdo drugje nekaj pozabil dovoliti (FR-003).
 */
export async function seedAdminApiKey(secret = 'seed-admin-key-for-analytics'): Promise<string> {
  await ApiKeyModel.create({
    label: 'seed-analytics',
    keyHash: createHash('sha256').update(secret).digest('hex'),
    keyPrefix: secret.slice(0, 8),
    scopes: ['admin'],
  });
  return secret;
}

export const AUTH = (token: string) => ({ Authorization: `Bearer ${token}` });
