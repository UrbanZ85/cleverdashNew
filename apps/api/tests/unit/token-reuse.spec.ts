import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';
import { SessionFamilyModel } from '../../src/modules/auth/models/session-family.model.js';
import { RefreshTokenModel } from '../../src/modules/auth/models/refresh-token.model.js';
import { issueInitialRefreshToken, rotateRefreshToken } from '../../src/modules/auth/services/refresh-token.service.js';

// FR-012: zaznana ponovna uporaba že porabljenega obnovitvenega žetona MORA preklicati
// celotno družino. To je varovalka, ne poseben primer — research.md §13.
const ENV = { REFRESH_TOKEN_TTL: '30d' };

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedUserAndFamily() {
  const user = await UserModel.create({ email: 'u@example.com', passwordHash: 'x' });
  const family = await SessionFamilyModel.create({ userId: user._id, platform: 'web' });
  return { userId: String(user._id), familyId: String(family._id) };
}

describe('zaznava ponovne uporabe obnovitvenega žetona', () => {
  it('ponovna predložitev že porabljenega žetona prekliče celotno družino', async () => {
    const { userId, familyId } = await seedUserAndFamily();
    const t0 = await issueInitialRefreshToken(ENV, userId, familyId);
    await rotateRefreshToken(ENV, t0); // t0 je zdaj "used"

    await expect(rotateRefreshToken(ENV, t0)).rejects.toThrow(/ponovna uporaba/);

    const family = await SessionFamilyModel.findById(familyId).lean();
    expect(family?.state).toBe('revoked');
    expect(family?.revokedReason).toBe('reuseDetected');

    const tokens = await RefreshTokenModel.find({ familyId }).lean();
    expect(tokens.every((t) => t.state === 'revoked')).toBe(true);
  });

  it('po preklicu družine tudi zadnji (bil aktiven) žeton ne dela več', async () => {
    const { userId, familyId } = await seedUserAndFamily();
    const t0 = await issueInitialRefreshToken(ENV, userId, familyId);
    const r1 = await rotateRefreshToken(ENV, t0);
    await rotateRefreshToken(ENV, t0).catch(() => undefined); // sproži preklic družine

    await expect(rotateRefreshToken(ENV, r1.newSecret)).rejects.toThrow();
  });

  it('neveljaven (nikoli izdan) žeton vrne napako brez razkritja razloga', async () => {
    await expect(rotateRefreshToken(ENV, 'popolnoma-izmisljen-zeton')).rejects.toThrow(
      /ni veljaven/,
    );
  });
});
