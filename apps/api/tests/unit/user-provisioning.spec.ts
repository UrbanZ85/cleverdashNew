import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { findOrCreateUser } from '../../src/modules/auth/services/user-provisioning.service.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';

// FR-003, FR-009: nov subjekt ustvari uporabnika; isti subjekt s spremenjeno e-pošto/imenom
// posodobi zapis, NE podvoji identitete.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('findOrCreateUser', () => {
  it('nov keycloakSubject ustvari uporabnika s podanimi privzetki', async () => {
    const user = await findOrCreateUser({
      keycloakSubject: 'kc-sub-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      scopes: [],
    });
    expect(user.keycloakSubject).toBe('kc-sub-1');
    expect(user.email).toBe('alice@example.com');
    expect(user.lastLoginAt).toBeTruthy();

    const count = await UserModel.countDocuments({});
    expect(count).toBe(1);
  });

  it('obstoječ subjekt s spremenjeno e-pošto/imenom posodobi zapis, ne ustvari podvojenega uporabnika', async () => {
    const first = await findOrCreateUser({
      keycloakSubject: 'kc-sub-2',
      email: 'old@example.com',
      displayName: 'Staro ime',
      scopes: [],
    });

    const second = await findOrCreateUser({
      keycloakSubject: 'kc-sub-2',
      email: 'new@example.com',
      displayName: 'Novo ime',
      scopes: ['admin'],
    });

    expect(String(second._id)).toBe(String(first._id));
    expect(second.email).toBe('new@example.com');
    expect(second.displayName).toBe('Novo ime');
    expect(second.scopes).toEqual(['admin']);

    const count = await UserModel.countDocuments({ keycloakSubject: 'kc-sub-2' });
    expect(count).toBe(1);
  });
});
