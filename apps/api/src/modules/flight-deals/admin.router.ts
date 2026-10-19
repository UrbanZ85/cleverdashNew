import { Router } from 'express';
import { Types } from 'mongoose';
import { loadEnv } from '../../platform/config/env.js';
import { ProblemError, notFound } from '../../platform/errors/problem.js';
import { isEmailConfigured } from '../../platform/email/mailer.service.js';
import { readUserSummaries, type UserSummary } from '../../platform/users/directory.service.js';
import { requireFlightAdmin } from './admin-guard.js';
import { FlightNotificationModel } from './models/flight-notification.model.js';
import { FlightProviderStatusModel } from './models/flight-provider-status.model.js';
import { FlightSearchRunModel } from './models/flight-search-run.model.js';
import { notificationsQuerySchema, runsQuerySchema, schedulerPutSchema } from './domain/rule-input.js';
import type { ProviderOutcome, RunStatus } from './domain/types.js';
import { FLIGHT_PROVIDERS } from './providers/index.js';
import { getOrCreateSchedulerSettings, toSchedulerResponse, updateSchedulerSettings } from './services/scheduler-settings.service.js';
import { executeNextQueued, requestManualRun } from './services/tick.js';
import { auditRunCancelled, auditSchedulerUpdated } from './flight-deals.audit.js';
import { requireObjectId } from './services/rule-access.service.js';

// Administracija modula Leti (FR-045 do FR-053). Vse poti pod `requireFlightAdmin()`: prijavljen
// človek z obsegom `admin`; API ključ ne pride skozi. Dejanja se pripišejo `req.actor` (človek za
// tipkovnico), ker prevzem imena (012) nad administracijo nima pomena.

export const flightDealsAdminRouter = Router();
flightDealsAdminRouter.use('/flight-deals/admin', requireFlightAdmin());

interface RunLean {
  _id: Types.ObjectId;
  trigger: 'schedule' | 'manual';
  requestedBy: Types.ObjectId | null;
  status: RunStatus;
  scheduledFor: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  cancelRequested: boolean;
  counters: Record<string, number>;
  providers: Array<Record<string, unknown>>;
  runErrors: Array<{ at: Date; providerId?: string | null; ruleId?: Types.ObjectId | null; code: string; message: string }>;
  createdAt: Date;
}

function toRunResponse(run: RunLean, users: Map<string, UserSummary>) {
  return {
    id: String(run._id),
    trigger: run.trigger,
    status: run.status,
    scheduledFor: run.scheduledFor ? run.scheduledFor.toISOString() : null,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    requestedBy: run.requestedBy ? (users.get(String(run.requestedBy)) ?? null) : null,
    cancelRequested: run.cancelRequested,
    counters: run.counters,
    providers: run.providers,
    errors: (run.runErrors ?? []).map((e) => ({
      at: e.at.toISOString(),
      ...(e.providerId ? { providerId: e.providerId } : {}),
      ...(e.ruleId ? { searchId: String(e.ruleId) } : {}),
      code: e.code,
      message: e.message,
    })),
    createdAt: run.createdAt.toISOString(),
  };
}

async function usersFor(runs: readonly RunLean[]): Promise<Map<string, UserSummary>> {
  return readUserSummaries(runs.map((r) => (r.requestedBy ? String(r.requestedBy) : null)).filter((x): x is string => x !== null));
}

function actorId(req: import('express').Request): string {
  return req.actor?.subjectId ?? req.auth?.subjectId ?? '';
}

// ───────────────────────────── urnik ─────────────────────────────

flightDealsAdminRouter.get('/flight-deals/admin/scheduler', async (_req, res, next) => {
  try {
    res.json(await toSchedulerResponse(await getOrCreateSchedulerSettings()));
  } catch (err) {
    next(err);
  }
});

flightDealsAdminRouter.put('/flight-deals/admin/scheduler', async (req, res, next) => {
  try {
    const patch = schedulerPutSchema.parse(req.body);
    const updated = await updateSchedulerSettings(patch, actorId(req));
    auditSchedulerUpdated(req.log, {
      actorUserId: actorId(req),
      enabled: updated.enabled,
      cronExpression: updated.cronExpression,
      timezone: updated.timezone,
    });
    res.json(await toSchedulerResponse(updated));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── zagoni ─────────────────────────────

flightDealsAdminRouter.get('/flight-deals/admin/runs', async (req, res, next) => {
  try {
    const query = runsQuerySchema.parse(req.query);
    const [runs, active] = await Promise.all([
      FlightSearchRunModel.find().sort({ createdAt: -1 }).limit(query.limit).lean<RunLean[]>(),
      FlightSearchRunModel.findOne({ status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 }).lean<RunLean | null>(),
    ]);
    const users = await usersFor(active ? [...runs, active] : runs);
    res.json({ runs: runs.map((r) => toRunResponse(r, users)), active: active ? toRunResponse(active, users) : null });
  } catch (err) {
    next(err);
  }
});

flightDealsAdminRouter.post('/flight-deals/admin/runs', async (req, res, next) => {
  try {
    const env = loadEnv();
    const { runId } = await requestManualRun(env, actorId(req));
    // Takoj, ne čez minuto: admin čaka. Napaka izvedbe se zabeleži na zagonu, ne tu.
    void executeNextQueued(env, req.log, new Date()).catch((err) => req.log?.error({ err }, 'Ročni zagon je spodletel'));
    const run = await FlightSearchRunModel.findById(runId).lean<RunLean | null>();
    if (!run) throw notFound('Zagon ne obstaja.');
    res.status(202).json(toRunResponse(run, await usersFor([run])));
  } catch (err) {
    next(err);
  }
});

flightDealsAdminRouter.get('/flight-deals/admin/runs/:runId', async (req, res, next) => {
  try {
    const run = await FlightSearchRunModel.findById(requireObjectId(String(req.params.runId), 'Zagon')).lean<RunLean | null>();
    if (!run) throw notFound('Zagon ne obstaja.');
    res.json(toRunResponse(run, await usersFor([run])));
  } catch (err) {
    next(err);
  }
});

flightDealsAdminRouter.post('/flight-deals/admin/runs/:runId/cancel', async (req, res, next) => {
  try {
    const id = requireObjectId(String(req.params.runId), 'Zagon');
    const run = await FlightSearchRunModel.findById(id).lean<RunLean | null>();
    if (!run) throw notFound('Zagon ne obstaja.');
    if (run.status !== 'queued' && run.status !== 'running') {
      throw new ProblemError(409, 'Zagon je že končan', `Zagon je v stanju "${run.status}" in ga ni mogoče prekiniti.`);
    }
    if (run.status === 'queued') {
      await FlightSearchRunModel.updateOne({ _id: run._id, status: 'queued' }, { $set: { status: 'cancelled', cancelRequested: true, finishedAt: new Date() } });
    } else {
      await FlightSearchRunModel.updateOne({ _id: run._id }, { $set: { cancelRequested: true } });
    }
    auditRunCancelled(req.log, { runId: String(run._id), actorUserId: actorId(req) });
    const fresh = await FlightSearchRunModel.findById(id).lean<RunLean | null>();
    res.json(toRunResponse(fresh!, await usersFor([fresh!])));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── viri in outbox ─────────────────────────────

flightDealsAdminRouter.get('/flight-deals/admin/providers', async (_req, res, next) => {
  try {
    const env = loadEnv();
    const statuses = await FlightProviderStatusModel.find().lean<
      Array<{
        providerId: string;
        lastSuccessAt: Date | null;
        lastErrorAt: Date | null;
        lastError: string | null;
        lastOutcome: ProviderOutcome | null;
        requestsToday: { day: string | null; count: number };
      }>
    >();
    const byId = new Map(statuses.map((s) => [s.providerId, s]));
    res.json({
      providers: FLIGHT_PROVIDERS.map((p) => {
        const s = byId.get(p.id);
        return {
          id: p.id,
          label: p.label,
          official: p.official,
          enabled: p.isEnabled(env),
          lastSuccessAt: s?.lastSuccessAt?.toISOString() ?? null,
          notice: p.notice,
          lastErrorAt: s?.lastErrorAt?.toISOString() ?? null,
          lastError: s?.lastError ?? null,
          lastOutcome: s?.lastOutcome ?? null,
          requestsToday: s?.requestsToday?.count ?? 0,
          dailyLimit: p.dailyRunLimit,
        };
      }),
      email: { configured: isEmailConfigured(env) },
    });
  } catch (err) {
    next(err);
  }
});

flightDealsAdminRouter.get('/flight-deals/admin/notifications', async (req, res, next) => {
  try {
    const query = notificationsQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.runId && Types.ObjectId.isValid(query.runId)) filter.runId = new Types.ObjectId(query.runId);
    const rows = await FlightNotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit)
      .lean<
        Array<{
          _id: Types.ObjectId;
          runId: Types.ObjectId;
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
