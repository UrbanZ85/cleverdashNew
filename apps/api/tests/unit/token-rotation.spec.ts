import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';
import { SessionFamilyModel } from '../../src/modules/auth/models/session-family.model.js';
import { RefreshTokenModel } from '../../src/modules/auth/models/refresh-token.model.js';
import { issueInitialRefreshToken, rotateRefreshToken } from '../../src/modules/auth/services/refresh-token.service.js';

// research.md §13, §7: obnovitveni žeton je naključna vrednost; vsaka uporaba ga zavrti.
const ENV = { REFRESH_TOKEN_TTL: '30d' };

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedUserAndFamily() {
  const user = await UserModel.create({
    email: 'u@example.com',
    passwordHash: 'x',
    scopes: ['admin'],
  });
  const family = await SessionFamilyModel.create({
    userId: user._id,
    platform: 'web',
  });
  return { userId: String(user._id), familyId: String(family._id) };
}

describe('rotateRefreshToken', () => {
  it('vsaka rotacija izda nov žeton in stari označi kot used', async () => {
    const { userId, familyId } = await seedUserAndFamily();
    const first = await issueInitialRefreshToken(ENV, userId, familyId);

    const rotated = await rotateRefreshToken(ENV, first);
    expect(rotated.newSecret).not.toBe(first);
    expect(rotated.userId).toBe(userId);
    expect(rotated.familyId).toBe(familyId);

    const tokens = await RefreshTokenModel.find({ familyId }).lean();
    expect(tokens).toHaveLength(2);
    expect(tokens.find((t) => t.state === 'used')).toBeTruthy();
    expect(tokens.find((t) => t.state === 'active')).toBeTruthy();
  });

  it('v družini je vedno kvečjemu en aktiven žeton (delni unikatni indeks)', async () => {
    const { userId, familyId } = await seedUserAndFamily();
    const first = await issueInitialRefreshToken(ENV, userId, familyId);
    await rotateRefreshToken(ENV, first);

    const activeCount = await RefreshTokenModel.countDocuments({ familyId, state: 'active' });
    expect(activeCount).toBe(1);
  });

  it('nov žeton deluje za nadaljnjo rotacijo (veriga)', async () => {
    const { userId, familyId } = await seedUserAndFamily();
    const t1 = await issueInitialRefreshToken(ENV, userId, familyId);
    const r1 = await rotateRefreshToken(ENV, t1);
    const r2 = await rotateRefreshToken(ENV, r1.newSecret);
    expect(r2.newSecret).not.toBe(r1.newSecret);
  });
});
