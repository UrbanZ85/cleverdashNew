import type { Express } from 'express';
import { SavedLinkModel } from '../../../src/modules/saved-links/models/saved-link.model.js';
import { SavedLinkGroupModel } from '../../../src/modules/saved-links/models/saved-link-group.model.js';
import { buildSearchText } from '../../../src/modules/saved-links/domain/search-text.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';

// Skupni pomožniki za pogodbene teste 008 proti specs/008-saved-links/contracts/openapi.yaml
// — po vzoru tests/contract/notes/_helpers.ts in tests/contract/todos/_helpers.ts.

export interface TestUser {
  token: string;
  userId: string;
}

/**
 * Prijavi uporabnika z lastno identiteto. Vsak `key` da svojega uporabnika.
 *
 * Vloga je `cleverdash-user` in NE `cleverdash-admin`: admin ima obseg `admin`, ki preskoči
 * vse preverbe obsegov, in test, ki teče kot admin, ne dokaže, da sta `saved-links:read` in
 * `saved-links:write` res dodana v `BASE_USER_SCOPES` (docs/adding-a-tab.md, korak 5).
 */
export async function loginAs(app: Express, key: string): Promise<TestUser> {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-${key}`,
    email: `${key}@example.com`,
    name: `Uporabnik ${key.toUpperCase()}`,
    roles: ['cleverdash-user'],
  });
  return { token: accessToken, userId };
}

/** Privzeti prijavljeni uporabnik za teste, ki drugega ne potrebujejo. */
export function loginAndUnlock(app: Express): Promise<TestUser> {
  return loginAs(app, 'a');
}

/** Dva prijavljena uporabnika — za preverjanje izolacije (FR-006). */
export async function loginTwo(app: Express): Promise<{ a: TestUser; b: TestUser }> {
  return { a: await loginAs(app, 'a'), b: await loginAs(app, 'b') };
}

/**
 * Zasadi zapis neposredno v bazo — hitreje in bolj nadzorovano od klicanja API-ja, ki bi ob
 * vsakem seme sprožil branje tuje strani.
 *
 * `searchText` se izpelje z ISTO funkcijo kot v routerju: zaseben zapis z ročno vpisanim
 * `searchText` bi test iskanja naredil brez vrednosti.
 */
export async function seedLinkFixture(
  userId: string,
  overrides: Partial<{
    url: string;
    title: string;
    comment: string | null;
    groupId: unknown;
    order: number;
    icon: string | null;
    faviconUrl: string | null;
    titleSource: 'manual' | 'auto';
    metadataStatus: 'ok' | 'skipped' | 'failed';
  }> = {},
) {
  const url = overrides.url ?? 'https://primer.si/stran';
  const title = overrides.title ?? 'Testni zapis';
  const comment = overrides.comment ?? null;
  return SavedLinkModel.create({
    userId,
    url,
    title,
    comment,
    searchText: buildSearchText({ title, url, comment }),
    order: 0,
    ...overrides,
  });
}

export async function seedGroupFixture(
  userId: string,
  overrides: Partial<{ name: string; order: number; collapsed: boolean }> = {},
) {
  return SavedLinkGroupModel.create({ userId, name: 'Delo', order: 0, ...overrides });
}
