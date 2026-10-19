import { Router, type Request } from 'express';
import { loadEnv } from '../config/env.js';
import { requireScopes } from '../auth/scopes.js';
import { resolveAutomationOwnerUserId } from '../auth/automation-owner.js';
import { notFound } from '../errors/problem.js';
import { listQuerySchema } from './domain/definition-input.js';
import { listSchedulePresets } from './domain/schedule-slots.js';
import { listScannerTypes } from './registry.js';
import { SCANNER_SCOPES } from './scopes.js';
import { listSummariesForUser, toSummaryResponse } from './services/definition-listing.service.js';
import { toTypeInfo } from './services/type-info.service.js';

/**
 * V čigavem imenu teče zahteva (isti vzorec kot modules/flight-deals/router.ts). Prijavljen človek
 * je `req.auth.subjectId` (po 012 že zamenjan, kadar admin dela v imenu drugega). API ključ nima
 * osebe: najprej lastnik ključa (`req.apiKey.ownerId`), sicer ugibanje kot pri 009/010/013.
 */
export async function actorUserId(req: Request): Promise<string> {
  if (req.auth?.subjectType === 'user') return req.auth.subjectId;
  if (req.apiKey?.ownerId) return req.apiKey.ownerId;
  const ownerId = await resolveAutomationOwnerUserId();
  if (!ownerId) {
    throw notFound('Avtomatizacija ne more ugotoviti, na katerega uporabnika se nanaša — ni podedovanih podatkov niti natanko enega uporabnika.');
  }
  return ownerId;
}

// Uporabniška polovica jedra skenerjev (016): referenčni seznam tipov, seznam skenerjev vseh
// tipov, generične definicije, rezultati. Vse pod `requireScopes` (API ključ z ustreznimi obsegi
// pride skozi, člen III); administracija je v admin.router.ts.
//
// VRSTNI RED POTI JE POMEMBEN (ista opomba kot modules/flight-deals/router.ts): statične poti
// (`/scanners/types`) so deklarirane PRED `/scanners/:scannerId`.

export const scannersRouter = Router();

// ───────────────────────────── referenčno ─────────────────────────────

scannersRouter.get('/scanners/types', requireScopes(), async (req, res, next) => {
  try {
    const env = loadEnv();
    const scopes = req.auth?.scopes ?? [];
    res.json({
      types: listScannerTypes().map((type) => toTypeInfo(type, env, scopes)),
      presets: listSchedulePresets(),
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── skenerji ─────────────────────────────

scannersRouter.get('/scanners', requireScopes(SCANNER_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const userId = await actorUserId(req);
    const query = listQuerySchema.parse(req.query);
    const rows = await listSummariesForUser(userId, req.auth?.scopes ?? [], env, new Date(), query.type);
    res.json({ scanners: rows.map(toSummaryResponse), limits: { maxPerUser: env.SCANNER_MAX_DEFINITIONS_PER_USER } });
  } catch (err) {
    next(err);
  }
});
