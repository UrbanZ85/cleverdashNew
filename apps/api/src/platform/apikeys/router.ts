import { randomBytes, createHash } from 'node:crypto';
import { Router } from 'express';
import { ApiKeyModel } from './model.js';
import { requireScopes } from '../auth/scopes.js';
import { notFound } from '../errors/problem.js';

// Dosegljiv je šele po US1 (obstaja prijava, ki nastavi req.auth prek accessTokenGuard),
// koda pa spada v to fazo, ker gre za plast platform/ — glej tasks.md, "Naloge, ki
// prečkajo fazo". Vse tri poti zahtevajo obseg "admin"; sistem je enouporabniški (FR-016),
// zato je "admin" edini smiselni obseg za upravljanje ključev.
export const apiKeysRouter = Router();

function generateSecret(): { secret: string; keyHash: string; keyPrefix: string } {
  const secret = `cd_${randomBytes(24).toString('hex')}`;
  const keyHash = createHash('sha256').update(secret).digest('hex');
  return { secret, keyHash, keyPrefix: secret.slice(0, 8) };
}

apiKeysRouter.get('/api-keys', requireScopes('admin'), async (_req, res) => {
  const keys = await ApiKeyModel.find({}, { keyHash: 0 }).lean();
  res.json(
    keys.map((k) => ({
      id: String(k._id),
      label: k.label,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt ?? null,
      expiresAt: k.expiresAt ?? null,
    })),
  );
});

apiKeysRouter.post('/api-keys', requireScopes('admin'), async (req, res, next) => {
  try {
    const { label, scopes, expiresAt } = req.body as {
      label: string;
      scopes: string[];
      expiresAt?: string;
    };
    const { secret, keyHash, keyPrefix } = generateSecret();
    const created = await ApiKeyModel.create({
      label,
      scopes,
      keyHash,
      keyPrefix,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    // Čistopis se pokaže samo tukaj, samo enkrat, in ni obnovljiv.
    res.status(201).json({
      id: String(created._id),
      label: created.label,
      keyPrefix: created.keyPrefix,
      scopes: created.scopes,
      secret,
    });
  } catch (err) {
    next(err);
  }
});

apiKeysRouter.delete('/api-keys/:keyId', requireScopes('admin'), async (req, res, next) => {
  const result = await ApiKeyModel.updateOne(
    { _id: req.params.keyId, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (result.matchedCount === 0) {
    next(notFound('Ključ ne obstaja ali je že preklican.'));
    return;
  }
  res.status(204).end();
});
