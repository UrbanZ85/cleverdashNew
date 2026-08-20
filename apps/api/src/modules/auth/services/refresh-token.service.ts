import { randomBytes, createHash } from 'node:crypto';
import ms from 'ms';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { SessionFamilyModel } from '../models/session-family.model.js';
import { unauthorized } from '../../../platform/errors/problem.js';
import type { Env } from '../../../platform/config/env.js';

// research.md §7: obnovitveni žeton je naključna vrednost, ne JWT, shranjena samo kot
// zgoščen zapis. Vsaka uporaba ga zavrti; uporaba že porabljenega prekliče CELOTNO
// družino (FR-012) — to je edini pravi preklic v sistemu, JWT-ja ni mogoče preklicati.

function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

export async function issueInitialRefreshToken(
  env: Pick<Env, 'REFRESH_TOKEN_TTL'>,
  userId: string,
  familyId: string,
): Promise<string> {
  const secret = generateSecret();
  const expiresAt = new Date(Date.now() + ms(env.REFRESH_TOKEN_TTL));
  await RefreshTokenModel.create({
    familyId,
    userId,
    tokenHash: hashToken(secret),
    state: 'active',
    expiresAt,
  });
  return secret;
}

/** Prekliče celotno družino: vsi žetoni razen že preklicanih preidejo v `revoked`, družina
 * sama pa v `revoked` s podanim razlogom. Preklic ene družine NE vpliva na druge (FR-017). */
export async function revokeFamily(
  familyId: string,
  reason: 'logout' | 'reuseDetected' | 'expired',
): Promise<void> {
  await Promise.all([
    SessionFamilyModel.updateOne({ _id: familyId }, { state: 'revoked', revokedReason: reason }),
    RefreshTokenModel.updateMany(
      { familyId, state: { $ne: 'revoked' } },
      { state: 'revoked' },
    ),
  ]);
}

export interface RotationResult {
  userId: string;
  familyId: string;
  newSecret: string;
}

/** Zavrti obnovitveni žeton. Predložen že porabljen ali preklican žeton prekliče celotno
 * družino in vrže napako — to JE varovalka, ne poseben primer. */
export async function rotateRefreshToken(
  env: Pick<Env, 'REFRESH_TOKEN_TTL'>,
  presentedSecret: string,
): Promise<RotationResult> {
  const tokenHash = hashToken(presentedSecret);
  const existing = await RefreshTokenModel.findOne({ tokenHash });

  if (!existing) {
    throw unauthorized('Obnovitveni žeton ni veljaven.');
  }

  if (existing.state !== 'active') {
    // Ponovna uporaba že porabljenega ali preklicanega žetona — zaznana zloraba (FR-012).
    await revokeFamily(String(existing.familyId), 'reuseDetected');
    throw unauthorized(
      'Zaznana ponovna uporaba obnovitvenega žetona. Seja te naprave je preklicana.',
    );
  }

  if (existing.expiresAt < new Date()) {
    await revokeFamily(String(existing.familyId), 'expired');
    throw unauthorized('Obnovitveni žeton je potekel.');
  }

  // Vrstni red je pomemben: stari žeton MORA preiti v "used", preden nastane nov
  // "active" — delni unikatni indeks (familyId, state="active") dovoljuje kvečjemu en
  // aktiven žeton na družino, zato bi obraten vrstni red trčil ob ta indeks.
  existing.state = 'used';
  existing.usedAt = new Date();
  await existing.save();

  const newSecret = generateSecret();
  const newExpiresAt = new Date(Date.now() + ms(env.REFRESH_TOKEN_TTL));
  const created = await RefreshTokenModel.create({
    familyId: existing.familyId,
    userId: existing.userId,
    tokenHash: hashToken(newSecret),
    state: 'active',
    expiresAt: newExpiresAt,
  });

  existing.replacedBy = created._id;
  await existing.save();

  await SessionFamilyModel.updateOne(
    { _id: existing.familyId },
    { lastUsedAt: new Date() },
  );

  return {
    userId: String(existing.userId),
    familyId: String(existing.familyId),
    newSecret,
  };
}
