import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { loadEnv } from '../config/env.js';
import { requireScopes } from '../auth/scopes.js';
import { resolveAutomationOwnerUserId } from '../auth/automation-owner.js';
import { badRequest, forbidden, notFound } from '../errors/problem.js';
import { ScannerDefinitionModel } from './models/scanner-definition.model.js';
import { ScannerRunModel } from './models/scanner-run.model.js';
import {
  definitionCreateSchema,
  definitionPatchSchema,
  listQuerySchema,
  resultsQuerySchema,
  runsQuerySchema,
  type ScheduleInput,
} from './domain/definition-input.js';
import { isValidTimezone, listSchedulePresets, presetFor, presetForExpression, validateCron } from './domain/schedule-slots.js';
import { listScannerTypes } from './registry.js';
import { auditDefinitionCreated, auditDefinitionDeleted, auditDefinitionUpdated } from './scanner.audit.js';
import { SCANNER_SCOPES } from './scopes.js';
import { toRunResponse, toRunSummary } from './admin.router.js';
import {
  assertGenericDefinitions,
  assertRoomForDefinition,
  requireOwnDefinition,
  requireRegisteredEnabledType,
  validateConfigWithType,
  type DefinitionLean,
} from './services/definition-access.service.js';
import { findSummaryForUser, listSummariesForUser, toGenericSummary, toSummaryResponse } from './services/definition-listing.service.js';
import { deleteResultsOfDefinition, genericResultReader } from './services/result-store.service.js';
import { executeRun } from './services/run-executor.service.js';
import { requestManualRun, type RunLean } from './services/scheduler.service.js';
import { callerCovers, scopesOf, toTypeInfo } from './services/type-info.service.js';
import type { AnyScannerType, ResultDetailView, ResultView, ScheduleSpec } from './types.js';
import { readUserSummaries } from '../users/directory.service.js';

// Uporabniška polovica jedra skenerjev (016): referenčni seznam tipov, seznam skenerjev vseh
// tipov, generične definicije (CRUD), ročni zagon, zagoni in rezultati. Vse pod `requireScopes`
// (API ključ z ustreznimi obsegi pride skozi, člen III); administracija je v admin.router.ts.
//
// VRSTNI RED POTI JE POMEMBEN (ista opomba kot modules/flight-deals/router.ts): statične poti
// (`/scanners/types`) so deklarirane PRED `/scanners/:scannerId`.

export const scannersRouter = Router();

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

/** Obsegi TIPA (ali skupni): klicatelj mora pokriti pisanje tipa, da sme pisati njegove definicije. */
function requireTypeWrite(req: Request, type: AnyScannerType): void {
  const scopes = req.auth?.scopes ?? [];
  if (!callerCovers(scopes, scopesOf(type).write)) throw forbidden(`Manjkajo obsegi: ${scopesOf(type).write}.`);
}

function requireTypeRead(req: Request, type: AnyScannerType | null): void {
  if (!type) return;
  const scopes = req.auth?.scopes ?? [];
  if (!callerCovers(scopes, scopesOf(type).read)) throw forbidden(`Manjkajo obsegi: ${scopesOf(type).read}.`);
}

/** Urnik iz vnosa: preset prepiše izraz; custom zahteva izraz; oboje preverjeno (FR-015). */
function resolveSchedule(input: ScheduleInput | undefined, current: ScheduleSpec | null): ScheduleSpec {
  let preset = input?.preset ?? current?.preset ?? 'daily-06';
  let cronExpression = current?.cronExpression ?? presetFor('daily-06').cronExpression!;
  if (input?.preset && input.preset !== 'custom') {
    cronExpression = presetFor(input.preset).cronExpression ?? cronExpression;
  } else if (input?.cronExpression !== undefined) {
    cronExpression = input.cronExpression.trim().replace(/\s+/g, ' ');
    preset = presetForExpression(cronExpression);
  } else if (input?.preset === 'custom') {
    preset = 'custom';
  }
  const cronError = validateCron(cronExpression);
  if (cronError) throw badRequest(cronError);
  const timezone = input?.timezone ?? current?.timezone ?? 'Europe/Ljubljana';
  if (!isValidTimezone(timezone)) throw badRequest(`Časovni pas "${timezone}" ni veljaven (uporabi IANA ime, npr. Europe/Ljubljana).`);
  return { preset, cronExpression, timezone };
}

async function scannerResponse(def: DefinitionLean, env: ReturnType<typeof loadEnv>, now: Date) {
  const type = listScannerTypes().find((t) => t.type === def.type) ?? null;
  const reader = type?.resultReader ?? genericResultReader;
  const counts = await reader.count([String(def._id)]);
  return {
    ...toSummaryResponse(toGenericSummary(def, type, env, now, counts.get(String(def._id)) ?? 0)),
    config: def.config,
    notifications: def.notifications,
  };
}

function toResultResponse(r: ResultView | ResultDetailView) {
  return {
    ...r,
    dataAt: r.dataAt.toISOString(),
    firstSeenAt: r.firstSeenAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    previousPrice: r.previousPrice ? { ...r.previousPrice, at: r.previousPrice.at.toISOString() } : null,
    ...('history' in r ? { history: r.history.map((h) => ({ ...h, checkedAt: h.checkedAt.toISOString() })) } : {}),
  };
}

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

scannersRouter.post('/scanners', requireScopes(SCANNER_SCOPES.write), async (req, res, next) => {
  try {
    const env = loadEnv();
    const userId = await actorUserId(req);
    const input = definitionCreateSchema.parse(req.body);
    const type = requireRegisteredEnabledType(input.type, env);
    assertGenericDefinitions(type);
    requireTypeWrite(req, type);
    if (type.execution !== 'single') throw badRequest(`Tip "${type.label}" se izvaja po urniku tipa in nima skenerjev z lastnim urnikom.`);
    const config = validateConfigWithType(type, input.config, env);
    const schedule = resolveSchedule(input.schedule, null);
    await assertRoomForDefinition(userId, type.type, env.SCANNER_MAX_DEFINITIONS_PER_USER);
    const now = new Date();
    const created = await ScannerDefinitionModel.create({
      userId: new Types.ObjectId(userId),
      name: input.name,
      type: type.type,
      enabled: input.enabled,
      // `lastScheduledSlotAt: now` — nov skener ne dohiteva terminov iz preteklosti; prvi termin je naslednji po urniku.
      schedule: { mode: 'own', ...schedule, lastScheduledSlotAt: now },
      notifications: { enabled: input.notifications.enabled ?? true, mode: 'all-changes' },
      config,
    });
    auditDefinitionCreated(req.log, { userId, definitionId: String(created._id), scannerType: type.type });
    res.status(201).json(await scannerResponse(await requireOwnDefinition(userId, String(created._id)), env, now));
  } catch (err) {
    next(err);
  }
});

scannersRouter.get('/scanners/:scannerId', requireScopes(SCANNER_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const def = await requireOwnDefinition(userId, String(req.params.scannerId));
    requireTypeRead(req, listScannerTypes().find((t) => t.type === def.type) ?? null);
    res.json(await scannerResponse(def, loadEnv(), new Date()));
  } catch (err) {
    next(err);
  }
});

scannersRouter.patch('/scanners/:scannerId', requireScopes(SCANNER_SCOPES.write), async (req, res, next) => {
  try {
    const env = loadEnv();
    const userId = await actorUserId(req);
    const existing = await requireOwnDefinition(userId, String(req.params.scannerId));
    const patch = definitionPatchSchema.parse(req.body);
    const type = listScannerTypes().find((t) => t.type === existing.type) ?? null;
    if (type) requireTypeWrite(req, type);
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.enabled !== undefined) set.enabled = patch.enabled;
    if (patch.notifications?.enabled !== undefined) set['notifications.enabled'] = patch.notifications.enabled;
    if (patch.config !== undefined) {
      // Delni vnos se zlije z obstoječim in preveri KOT CELOTA (tip, ki ga ni, ne more preveriti → 400).
      if (!type) throw badRequest(`Tip skenerja "${existing.type}" v tej namestitvi ni na voljo; nastavitev ni mogoče preveriti.`);
      set.config = validateConfigWithType(type, { ...existing.config, ...patch.config }, env);
    }
    if (patch.schedule) {
      const schedule = resolveSchedule(patch.schedule, existing.schedule);
      set['schedule.preset'] = schedule.preset;
      set['schedule.cronExpression'] = schedule.cronExpression;
      set['schedule.timezone'] = schedule.timezone;
      // Sprememba izraza ali cone premakne "pokrito do zdaj" (isti razlog kot pri urniku tipa).
      if (schedule.cronExpression !== existing.schedule.cronExpression || schedule.timezone !== existing.schedule.timezone) {
        set['schedule.lastScheduledSlotAt'] = new Date();
      }
    }
    await ScannerDefinitionModel.updateOne({ _id: existing._id, userId: existing.userId }, { $set: set });
    auditDefinitionUpdated(req.log, { userId, definitionId: String(existing._id), scannerType: existing.type, fields: Object.keys(patch) });
    res.json(await scannerResponse(await requireOwnDefinition(userId, String(existing._id)), env, new Date()));
  } catch (err) {
    next(err);
  }
});

scannersRouter.delete('/scanners/:scannerId', requireScopes(SCANNER_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const existing = await requireOwnDefinition(userId, String(req.params.scannerId));
    await ScannerDefinitionModel.deleteOne({ _id: existing._id, userId: existing.userId });
    // Rezultati in zgodovina gredo s skenerjem (FR-009); zagoni ostanejo kot zgodovina namestitve.
    await deleteResultsOfDefinition(existing._id);
    auditDefinitionDeleted(req.log, { userId, definitionId: String(existing._id), scannerType: existing.type });
    // 200 s telesom in ne 204: shranjen odgovor za `Idempotency-Key` (isti razlog kot v 010/015).
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── zagoni ─────────────────────────────

scannersRouter.post('/scanners/:scannerId/run', requireScopes(SCANNER_SCOPES.write), async (req, res, next) => {
  try {
    const env = loadEnv();
    const userId = await actorUserId(req);
    const id = String(req.params.scannerId);
    const found = await findSummaryForUser(userId, id, req.auth?.scopes ?? [], env, new Date());
    if (!found) throw notFound('Skener ne obstaja.');
    if (!found.generic || !found.type) {
      // Tip z lastnimi definicijami (leti) teče kot batch: sproži ga administrator (FR-020).
      throw forbidden(`Skener tipa "${found.row.typeLabel}" se izvaja po urniku tipa — zagon sproži administrator.`);
    }
    requireTypeWrite(req, found.type);
    if (!found.type.isEnabled(env)) throw badRequest(`Tip skenerja "${found.type.label}" je v tej namestitvi izklopljen.`);
    const actor = req.actor?.subjectId ?? userId;
    const { runId } = await requestManualRun(env, { kind: 'definition', type: found.type.type, definitionId: id, ownerId: userId }, actor);
    void executeRun(runId, env, req.log, new Date()).catch((err) => req.log?.error({ err }, 'Ročni zagon skenerja je spodletel'));
    const run = await ScannerRunModel.findById(runId).lean<RunLean | null>();
    if (!run) throw notFound('Zagon ne obstaja.');
    res.status(202).json(toRunResponse(run, await readUserSummaries([userId])));
  } catch (err) {
    next(err);
  }
});

scannersRouter.get('/scanners/:scannerId/runs', requireScopes(SCANNER_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const userId = await actorUserId(req);
    const id = String(req.params.scannerId);
    const query = runsQuerySchema.parse(req.query);
    const found = await findSummaryForUser(userId, id, req.auth?.scopes ?? [], env, new Date());
    if (!found) throw notFound('Skener ne obstaja.');
    const filter = found.generic ? { 'scope.definitionId': new Types.ObjectId(id) } : { scannerType: found.row.type, 'scope.kind': 'type' };
    const runs = await ScannerRunModel.find(filter).sort({ createdAt: -1 }).limit(query.limit).lean<RunLean[]>();
    res.json({ runs: runs.map(toRunSummary) });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── rezultati ─────────────────────────────

scannersRouter.get('/scanners/:scannerId/results', requireScopes(SCANNER_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const userId = await actorUserId(req);
    const id = String(req.params.scannerId);
    const query = resultsQuerySchema.parse(req.query);
    const found = await findSummaryForUser(userId, id, req.auth?.scopes ?? [], env, new Date());
    if (!found) throw notFound('Skener ne obstaja.');
    const reader = found.type?.resultReader ?? genericResultReader;
    const { results, total } = await reader.list(id, userId, query, env);
    res.json({ results: results.map(toResultResponse), total });
  } catch (err) {
    next(err);
  }
});

scannersRouter.get('/scanners/:scannerId/results/:resultId', requireScopes(SCANNER_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const userId = await actorUserId(req);
    const id = String(req.params.scannerId);
    const found = await findSummaryForUser(userId, id, req.auth?.scopes ?? [], env, new Date());
    if (!found) throw notFound('Skener ne obstaja.');
    const reader = found.type?.resultReader ?? genericResultReader;
    const detail = await reader.get(id, String(req.params.resultId), userId, env);
    if (!detail) throw notFound('Rezultat ne obstaja.');
    res.json(toResultResponse(detail));
  } catch (err) {
    next(err);
  }
});
