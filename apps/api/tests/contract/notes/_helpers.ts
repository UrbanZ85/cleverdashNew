import type { Express } from 'express';
import { NoteModel } from '../../../src/modules/notes/models/note.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser, DEFAULT_IDENTITY } from '../../setup/login-as-test-user.js';

// Skupni pomožniki za pogodbene teste 007 proti specs/007-notes/contracts/openapi.yaml —
// po vzoru tests/contract/cameras/_helpers.ts.

export async function loginAndUnlock(app: Express): Promise<string> {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-admin'] });
  return accessToken;
}

async function defaultTestUserId(): Promise<string> {
  const user = await UserModel.findOneAndUpdate(
    { keycloakSubject: DEFAULT_IDENTITY.sub },
    { $setOnInsert: { email: DEFAULT_IDENTITY.email, displayName: DEFAULT_IDENTITY.name, scopes: [] } },
    { upsert: true, new: true },
  );
  return String(user._id);
}

export async function seedNoteFixture(overrides: Record<string, unknown> = {}) {
  const userId = overrides.userId ?? (await defaultTestUserId());
  return NoteModel.create({ userId, title: 'Testna beležka', body: 'Vsebina', ...overrides });
}

/** Najmanjši veljaven "posnetek": vsebina ni pravi zvok (strežnik je ne dekodira, glej
 * note-audio.model.ts), pomembna sta vrsta vsebine in to, da telo ni prazno. */
export const FAKE_AUDIO = Buffer.from('OggS-fake-audio-bytes');
