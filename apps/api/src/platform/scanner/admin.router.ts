import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { loadEnv } from '../config/env.js';
import { requireAdminUser } from '../auth/admin-guard.js';
import { ProblemError, badRequest, notFound } from '../errors/problem.js';
import { isEmailConfigured } from '../email/mailer.service.js';
import { readUserSummaries, type UserSummary } from '../users/directory.service.js';
import { ScannerDefinitionModel } from './models/scanner-definition.model.js';
import { ScannerNotificationModel } from './models/scanner-notification.model.js';
import { ScannerRunModel } from './models/scanner-run.model.js';
import { adminNotificationsQuerySchema, adminRunsQuerySchema, adminTriggerSchema, typeSchedulePutSchema } from './domain/definition-input.js';
import { findScannerType, listScannerTypes } from './registry.js';
import { auditRunCancelled, auditScheduleUpdated } from './scanner.audit.js';
import { executeRun } from './services/run-executor.service.js';
import { activeRuns, requestManualRun, type RunLean, type RunScope } from './services/scheduler.service.js';
import { toTypeInfo } from './services/type-info.service.js';
import { getOrCreateTypeSettings, toTypeScheduleResponse, updateTypeSchedule } from './services/type-settings.service.js';
import type { RunStatus } from './types.js';

// Administracija skenerjev (FR-014, FR-020, FR-045): urniki tipov, zagoni vseh tipov, outbox.
// Vse poti pod `requireAdminUser()`: prijavljen človek z obsegom `admin`; API ključ ne pride
// skozi. Dejanja se pripišejo `req.actor` (človek za tipkovnico), ker prevzem imena (012) nad
// administracijo nima pomena. Nasledila je `/flight-deals/admin/*` iz 015; stanje virov letov je
// zdaj `extras` tipa `flights` v `GET /scanners/admin/types`.

export const scannersAdminRouter = Router();
scannersAdminRouter.use('/scanners/admin', requireAdminUser());

function actorId(req: Request): string {
  return req.actor?.subjectId ?? req.auth?.subjectId ?? '';
}

function countersOf(run: RunLean): Record<string, number> {
  const raw = run.counters as unknown;
  if (raw instanceof Map) return Object.fromEntries(raw as Map<string, number>);
  return { ...(raw as Record<string, number> | null | undefined) };
}

export function toRunSummary(run: RunLean) {
  return {
    id: String(run._id),
    type: run.scannerType,
    trigger: run.trigger,
    status: run.status,
    scheduledFor: run.scheduledFor ? run.scheduledFor.toISOString() : null,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    counters: countersOf(run),
  };
}

export function toRunResponse(run: RunLean, users: Map<string, UserSummary>) {
  return {
    ...toRunSummary(run),
    scope: {
      kind: run.scope.kind,
      ...(run.scope.definitionId ? { scannerId: String(run.scope.definitionId) } : {}),
      owner: run.scope.ownerId ? (users.get(String(run.scope.ownerId)) ?? null) : null,
    },
    requestedBy: run.requestedBy ? (users.get(String(run.requestedBy)) ?? null) : null,
    cancelRequested: run.cancelRequested,
    definitions: (run.definitions ?? []).map((d) => ({
      scannerId: String(d.definitionId),
      outcome: d.outcome,
      message: d.message,
    })),
    extras: run.extras ?? null,
    errors: (run.runErrors ?? []).map((e) => ({
      at: e.at.toISOString(),
      ...(e.definitionId ? { scannerId: String(e.definitionId) } : {}),
      code: e.code,
      message: e.message,
    })),
    createdAt: run.createdAt.toISOString(),
  };
}

async function usersFor(runs: readonly RunLean[]): Promise<Map<string, UserSummary>> {
  const ids = new Set<string>();
  for (const r of runs) {
    if (r.requestedBy) ids.add(String(r.requestedBy));
    if (r.scope.ownerId) ids.add(String(r.scope.ownerId));
  }
  return readUserSummaries([...ids]);
}

function requireType(type: string) {
  const found = findScannerType(type);
  if (!found) throw notFound(`Tip skenerja "${type}" ne obstaja.`);
  return found;
}

// ───────────────────────────── tipi in urniki ─────────────────────────────

scannersAdminRouter.get('/scanners/admin/types', async (req, res, next) => {
  try {
    const env = loadEnv();
    const now = new Date();
    const scopes = req.auth?.scopes ?? [];
    const types = await Promise.all(
      listScannerTypes().map(async (type) => {
        const schedule = type.execution === 'batch' ? await toTypeScheduleResponse(await getOrCreateTypeSettings(type, now), now) : null;
        const definitionCount = type.definitions ? await type.definitions.countAll() : await ScannerDefinitionModel.countDocuments({ type: type.type });
        let extras: unknown = null;
        if (type.admin) {
          try {
            extras = await type.admin.extras(env);
          } catch (err) {
            req.log?.warn({ err, scannerType: type.type }, 'Dodatek tipa za administracijo je spodletel');
          }
        }
        return { ...toTypeInfo(type, env, scopes), schedule, definitionCount, extras };
      }),
    );
    res.json({ types, email: { configured: isEmailConfigured(env) } });
  } catch (err) {
    next(err);
  }
});

scannersAdminRouter.get('/scanners/admin/types/:type/schedule', async (req, res, next) => {
  try {
    const type = requireType(String(req.params.type));
    if (type.execution !== 'batch') throw badRequest(`Tip "${type.type}" nima urnika tipa — urnik ima vsak skener zase.`);
    res.json(await toTypeScheduleResponse(await getOrCreateTypeSettings(type)));
  } catch (err) {
    next(err);
  }
});

scannersAdminRouter.put('/scanners/admin/types/:type/schedule', async (req, res, next) => {
  try {
    const type = requireType(String(req.params.type));
    if (type.execution !== 'batch') throw badRequest(`Tip "${type.type}" nima urnika tipa — urnik ima vsak skener zase.`);
    const patch = typeSchedulePutSchema.parse(req.body);
    const updated = await updateTypeSchedule(type, patch, actorId(req));
    auditScheduleUpdated(req.log, {
      scannerType: type.type,
      actorUserId: actorId(req),
      enabled: updated.enabled,
      cronExpression: updated.cronExpression,
      timezone: updated.timezone,
    });
    res.json(await toTypeScheduleResponse(updated));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── zagoni ─────────────────────────────

scannersAdminRouter.get('/scanners/admin/runs', async (req, res, next) => {
  try {
    const query = adminRunsQuerySchema.parse(req.query);
    const filter = query.type ? { scannerType: query.type } : {};
    const [runs, active] = await Promise.all([
      ScannerRunModel.find(filter).sort({ createdAt: -1 }).limit(query.limit).lean<RunLean[]>(),
      activeRuns().then((rows) => (query.type ? rows.filter((r) => r.scannerType === query.type) : rows)),
    ]);
    const users = await usersFor([...runs, ...active]);
    res.json({ runs: runs.map((r) => toRunResponse(r, users)), active: active.map((r) => toRunResponse(r, users)) });
  } catch (err) {
    next(err);
  }
});

scannersAdminRouter.post('/scanners/admin/runs', async (req, res, next) => {
  try {
    const env = loadEnv();
    const input = adminTriggerSchema.parse(req.body ?? {});
    let scope: RunScope;
    if (input.type) {
      const type = requireType(input.type);
      if (type.execution !== 'batch') throw badRequest(`Tip "${type.type}" se izvaja na skener — navedi \`scannerId\`.`);
      scope = { kind: 'type', type: type.type };
    } else {
      const id = String(input.scannerId);
      if (!Types.ObjectId.isValid(id)) throw notFound('Skener ne obstaja.');
      const def = await ScannerDefinitionModel.findById(id).select('_id userId type').lean<{ _id: Types.ObjectId; userId: Types.ObjectId; type: string } | null>();
      if (!def) throw notFound('Skener ne obstaja.');
      scope = { kind: 'definition', type: def.type, definitionId: String(def._id), ownerId: String(def.userId) };
    }
    const { runId } = await requestManualRun(env, scope, actorId(req));
    // Takoj, ne čez minuto: admin čaka. Napaka izvedbe se zabeleži na zagonu, ne tu.
    void executeRun(runId, env, req.log, new Date()).catch((err) => req.log?.error({ err }, 'Ročni zagon je spodletel'));
    const run = await ScannerRunModel.findById(runId).lean<RunLean | null>();
    if (!run) throw notFound('Zagon ne obstaja.');
    res.status(202).json(toRunResponse(run, await usersFor([run])));
  } catch (err) {
    next(err);
  }
});

scannersAdminRouter.get('/scanners/admin/runs/:runId', async (req, res, next) => {
  try {
    const id = String(req.params.runId);
    if (!Types.ObjectId.isValid(id)) throw notFound('Zagon ne obstaja.');
    const run = await ScannerRunModel.findById(id).lean<RunLean | null>();
    if (!run) throw notFound('Zagon ne obstaja.');
    res.json(toRunResponse(run, await usersFor([run])));
  } catch (err) {
    next(err);
  }
});

scannersAdminRouter.post('/scanners/admin/runs/:runId/cancel', async (req, res, next) => {
  try {
    const id = String(req.params.runId);
    if (!Types.ObjectId.isValid(id)) throw notFound('Zagon ne obstaja.');
    const run = await ScannerRunModel.findById(id).lean<RunLean | null>();
    if (!run) throw notFound('Zagon ne obstaja.');
    if (run.status !== 'queued' && run.status !== 'running') {
      throw new ProblemError(409, 'Zagon je že končan', `Zagon je v stanju "${run.status}" in ga ni mogoče prekiniti.`);
    }
    if (run.status === 'queued') {
      await ScannerRunModel.updateOne({ _id: run._id, status: 'queued' }, { $set: { status: 'cancelled' satisfies RunStatus, cancelRequested: true, finishedAt: new Date() } });
    } else {
      await ScannerRunModel.updateOne({ _id: run._id }, { $set: { cancelRequested: true } });
    }
    auditRunCancelled(req.log, { runId: String(run._id), scannerType: run.scannerType, actorUserId: actorId(req) });
    const fresh = await ScannerRunModel.findById(id).lean<RunLean | null>();
    res.json(toRunResponse(fresh!, await usersFor([fresh!])));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── outbox ─────────────────────────────

scannersAdminRouter.get('/scanners/admin/notifications', async (req, res, next) => {
  try {
    const query = adminNotificationsQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.type) filter.scannerType = query.type;
    if (query.status) filter.status = query.status;
    if (query.runId && Types.ObjectId.isValid(query.runId)) filter.runId = new Types.ObjectId(query.runId);
    const rows = await ScannerNotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit)
      .lean<
        Array<{
          _id: Types.ObjectId;
          runId: Types.ObjectId;
          scannerType: string;
          recipientUserId: Types.ObjectId;
          status: string;
          suppressedReason: string | null;
          attemptCount: number;
          nextAttemptAt: Date | null;
          sentAt: Date | null;
          lastError: string | null;
          items: unknown[];
          createdAt: Date;
        }>
      >();
    const users = await readUserSummaries(rows.map((r) => String(r.recipientUserId)));
    res.json({
      notifications: rows.map((n) => ({
        id: String(n._id),
        type: n.scannerType,
        runId: String(n.runId),
        recipient: users.get(String(n.recipientUserId)) ?? {
          id: String(n.recipientUserId),
          displayName: 'Neznan uporabnik',
          initials: '?',
          emailHint: '—',
        },
        status: n.status,
        suppressedReason: n.suppressedReason,
        attemptCount: n.attemptCount,
        nextAttemptAt: n.nextAttemptAt ? n.nextAttemptAt.toISOString() : null,
        sentAt: n.sentAt ? n.sentAt.toISOString() : null,
        lastError: n.lastError,
        itemCount: n.items.length,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});
