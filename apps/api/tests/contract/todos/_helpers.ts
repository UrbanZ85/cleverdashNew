import type { Express } from 'express';
import { TodoListModel } from '../../../src/modules/todos/models/todo-list.model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import type { MemberRole } from '../../../src/modules/todos/domain/capabilities.js';

// Skupni pomožniki za pogodbene teste 010 proti specs/010-todos/contracts/openapi.yaml —
// po vzoru tests/contract/notes/_helpers.ts.
//
// Prijava gre skozi PRAVI tok (fakeKeycloak → /auth/callback → /auth/refresh), ne skozi ročno
// ustvarjeno sejo: samo tako je `lastLoginAt` res nastavljen, kar je pogoj, da uporabnik sploh
// pride v imenik za deljenje (FR-070).

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
    roles: ['cleverdash-user'],
  });
  return { token: accessToken, userId };
}

/**
 * Dva prijavljena uporabnika — lastnik in nekdo drug.
 *
 * Vloga je `cleverdash-user`, ne `cleverdash-admin`: admin ima obseg `admin`, ki preskoči vse
 * preverbe obsegov, in test, ki teče kot admin, ne dokaže, da so obsegi v `BASE_USER_SCOPES`
 * res dodani.
 */
export async function loginTwo(app: Express): Promise<{ a: TestUser; b: TestUser }> {
  const a = await loginAs(app, 'a');
  const b = await loginAs(app, 'b');
  return { a, b };
}

export interface SeedTaskInput {
  title: string;
  done?: boolean;
  doneAt?: Date | null;
  doneBy?: string | null;
  dueDate?: Date | null;
  position?: number;
}

/** Ustvari seznam neposredno v bazi — hitreje in bolj nadzorovano od klicanja API-ja. */
export async function seedList(params: {
  ownerId: string;
  title?: string;
  locked?: boolean;
  members?: { userId: string; role: MemberRole; seenAt?: Date | null }[];
  tasks?: SeedTaskInput[];
}) {
  const now = new Date();
  return TodoListModel.create({
    ownerId: params.ownerId,
    title: params.title ?? 'Nakup',
    locked: params.locked ?? false,
    members: (params.members ?? []).map((m) => ({
      userId: m.userId,
      role: m.role,
      addedAt: now,
      seenAt: m.seenAt ?? null,
    })),
    tasks: (params.tasks ?? []).map((t, i) => ({
      title: t.title,
      done: t.done ?? false,
      doneAt: t.doneAt ?? null,
      doneBy: t.doneBy ?? null,
      dueDate: t.dueDate ?? null,
      position: t.position ?? (i + 1) * 1000,
      createdAt: now,
    })),
    lastModifiedBy: params.ownerId,
  });
}

export const AUTH = (token: string) => ({ Authorization: `Bearer ${token}` });
