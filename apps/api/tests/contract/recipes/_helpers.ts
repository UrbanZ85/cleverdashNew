import type { Express } from 'express';
import { RecipeModel } from '../../../src/modules/recipes/models/recipe.model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import type { MemberRole } from '../../../src/modules/recipes/domain/capabilities.js';

// Skupni pomožniki za pogodbene teste 013 proti specs/013-recipes/contracts/openapi.yaml — po
// vzoru tests/contract/todos/_helpers.ts.
//
// Prijava gre skozi PRAVI tok (fakeKeycloak → /auth/callback → /auth/refresh), ne skozi ročno
// ustvarjeno sejo: samo tako je `lastLoginAt` res nastavljen, kar je pogoj, da uporabnik sploh
// pride v imenik za deljenje (FR-036).

export interface TestUser {
  token: string;
  userId: string;
}

/** Prijavi uporabnika z lastno identiteto. Vsak `key` da svojega uporabnika. */
export async function loginAs(app: Express, key: string): Promise<TestUser> {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-${key}`,
    email: `${key}@example.com`,
    name: `Uporabnik ${key.toUpperCase()}`,
    // Vloga je `cleverdash-user`, ne `cleverdash-admin`: admin ima obseg `admin`, ki preskoči vse
    // preverbe obsegov, in test, ki teče kot admin, ne dokaže, da so obsegi v `BASE_USER_SCOPES`
    // res dodani (docs/adding-a-tab.md, korak 5).
    roles: ['cleverdash-user'],
  });
  return { token: accessToken, userId };
}

/** Dva prijavljena uporabnika — lastnik in nekdo drug. */
export async function loginTwo(app: Express): Promise<{ a: TestUser; b: TestUser }> {
  const a = await loginAs(app, 'a');
  const b = await loginAs(app, 'b');
  return { a, b };
}

/** Ustvari recept neposredno v bazi — hitreje in bolj nadzorovano od klicanja API-ja, predvsem pa
 * brez odhodnega klica, ki bi ga sprožil uvoz s strani. */
export async function seedRecipe(params: {
  ownerId: string;
  title?: string;
  url?: string | null;
  description?: string | null;
  ingredients?: string[];
  steps?: string[];
  tags?: string[];
  tagKeys?: string[];
  rating?: number | null;
  lastCookedAt?: Date | null;
  members?: { userId: string; role: MemberRole; seenAt?: Date | null }[];
  publicShare?: { token: string; revokedAt?: Date | null } | null;
  searchText?: string;
}) {
  const now = new Date();
  return RecipeModel.create({
    ownerId: params.ownerId,
    title: params.title ?? 'Bučna juha',
    url: params.url ?? null,
    description: params.description ?? null,
    ingredients: params.ingredients ?? [],
    steps: params.steps ?? [],
    tags: params.tags ?? [],
    tagKeys: params.tagKeys ?? (params.tags ?? []).map((t) => t.toLowerCase()),
    rating: params.rating ?? null,
    lastCookedAt: params.lastCookedAt ?? null,
    members: (params.members ?? []).map((m) => ({
      userId: m.userId,
      role: m.role,
      addedAt: now,
      seenAt: m.seenAt ?? null,
    })),
    publicShare: params.publicShare
      ? {
          token: params.publicShare.token,
          createdAt: now,
          revokedAt: params.publicShare.revokedAt ?? null,
        }
      : null,
    searchText: params.searchText ?? (params.title ?? 'Bučna juha').toLowerCase(),
    lastModifiedBy: params.ownerId,
  });
}

/** Najmanjši veljaven JPEG za preverbo podpisa — vsebina za nami ni pomembna, ker strežnik slike
 * ne dekodira, podpis pa mora biti pravi (FR-021). */
export function jpegBytes(size = 64): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size)]);
}

export function pngBytes(size = 64): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(size),
  ]);
}

export const AUTH = (token: string) => ({ Authorization: `Bearer ${token}` });
