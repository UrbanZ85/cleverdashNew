import { Types } from 'mongoose';
import type { Env } from '../../config/env.js';
import type { Logger } from '../../logging/logger.js';
import { ScannerDefinitionModel } from '../models/scanner-definition.model.js';
import { MAX_RUN_ERRORS, ScannerRunModel } from '../models/scanner-run.model.js';
import { statusFromOutcomes } from '../domain/run-status.js';
import { findScannerType } from '../registry.js';
import { auditRunFinished, auditRunStarted } from '../scanner.audit.js';
import type { DefinitionOutcomeRow, ExecutionContext, ExecutionOutcome, RunStatus, ScannerEvent, SingleDefinition } from '../types.js';
import { buildNotificationsForRun } from './notification-builder.service.js';
import { processNotificationOutbox } from './notification-sender.service.js';
import { genericResultStoreFor } from './result-store.service.js';
import { countFinishedRuns, type RunLean, type RunScope } from './scheduler.service.js';

// En zagon (FR-016 do FR-019, člen V): prevzem `queued → running`, kontekst, `type.execute`,
// dopisi, zaključek. Utrip (`heartbeatAt`) posodablja tip prek `ctx.heartbeat()`, da prekinjen
// zagon prepozna naslednji tik (FR-018). Preklic (`cancelRequested`) se preveri pred in po
// izvajanju ter prek `ctx.shouldCancel()` med koraki tipa; preklican zagon dopisov NE sestavi.
//
// Jedro ne ve, kaj tip počne: dobi `ExecutionOutcome` in ga zapiše. Napaka tipa (izjema) je
// `failed` z zapisom v `runErrors`; napaka ENEGA skenerja znotraj batch zagona je stvar tipa in
// pride nazaj kot `definitions[].outcome = 'failed'` (FR-017). Preseljeno iz 015
// `run-executor.service.ts`; letalsko telo je v `modules/flight-deals/scanner/execute.ts`.

export interface ExecuteOptions {
  /** Po koncu zagona takoj obdelaj outbox (privzeto da); testi, ki preverjajo `pending`, izklopijo. */
  processOutbox?: boolean;
  /** Možnosti za tip (testi); gre v `ctx.typeOptions`. */
  typeOptions?: unknown;
}

interface DefinitionLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: string;
  config: unknown;
  notifications: { enabled: boolean; mode: 'all-changes' };
}

function scopeOf(run: RunLean): RunScope {
  return run.scope.kind === 'type'
    ? { kind: 'type', type: run.scannerType }
    : { kind: 'definition', type: run.scannerType, definitionId: String(run.scope.definitionId), ownerId: String(run.scope.ownerId) };
}

export async function executeRun(runId: Types.ObjectId | string, env: Env, logger: Logger | undefined, now = new Date(), options: ExecuteOptions = {}): Promise<RunLean | null> {
  const id = new Types.ObjectId(runId);
  const claimed = await ScannerRunModel.findOneAndUpdate(
    { _id: id, status: 'queued' },
    { $set: { status: 'running', startedAt: now, heartbeatAt: now } },
    { new: true },
  ).lean<RunLean | null>();
  if (!claimed) return null; // drug izvod ga je že prevzel ali ni več `queued`

  const scope = scopeOf(claimed);
  const errors: Array<{ at: Date; definitionId?: Types.ObjectId | null; code: string; message: string }> = [];
  const pushError = (e: { definitionId?: string; code: string; message: string }) => {
    if (errors.length < MAX_RUN_ERRORS) {
      errors.push({
        at: new Date(),
        definitionId: e.definitionId && Types.ObjectId.isValid(e.definitionId) ? new Types.ObjectId(e.definitionId) : null,
        code: e.code,
        message: e.message.slice(0, 300),
      });
    }
  };
  const heartbeat = async () => {
    await ScannerRunModel.updateOne({ _id: id }, { $set: { heartbeatAt: new Date() } }).catch(() => undefined);
  };
  const shouldCancel = async (): Promise<boolean> => {
    const doc = await ScannerRunModel.findById(id).select('cancelRequested').lean<{ cancelRequested: boolean } | null>();
    return doc?.cancelRequested === true;
  };

  auditRunStarted(logger, {
    runId: String(id),
    scannerType: claimed.scannerType,
    scope: scope.kind === 'type' ? `type:${scope.type}` : `def:${scope.definitionId}`,
    trigger: claimed.trigger,
    slotKey: claimed.slotKey,
  });

  let status: RunStatus = 'succeeded';
  let counters: Record<string, number> = {};
  let definitionRows: DefinitionOutcomeRow[] = [];
  let extras: unknown = null;
  let events: ScannerEvent[] = [];
  let singleDefinition: SingleDefinition | null = null;

  const type = findScannerType(claimed.scannerType);
  try {
    if (!type) {
      status = 'failed';
      pushError({ code: 'type-unavailable', message: `Tip "${claimed.scannerType}" v tej namestitvi ni registriran.` });
    } else {
      let definitionGone = false;
      if (scope.kind === 'definition') {
        const def = await ScannerDefinitionModel.findById(scope.definitionId).lean<DefinitionLean | null>();
        if (!def) {
          definitionGone = true;
        } else {
          singleDefinition = {
            id: String(def._id),
            userId: String(def.userId),
            name: def.name,
            config: def.config,
            notifications: def.notifications,
          };
        }
      }

      if (definitionGone) {
        // Skener je bil izbrisan med čakanjem: ni kaj izvesti in ni komu pisati (edge case).
        status = 'cancelled';
        pushError({ code: 'definition-missing', message: 'Skener je bil izbrisan, preden se je zagon začel.' });
      } else if (await shouldCancel()) {
        status = 'cancelled';
      } else {
        const results =
          singleDefinition && type.results === 'generic'
            ? genericResultStoreFor(
                { definition: { id: singleDefinition.id, userId: singleDefinition.userId, name: singleDefinition.name }, runId: id, scannerType: type.type, now, env },
                type.allowedResultHosts,
              )
            : null;
        const ctx: ExecutionContext<never> = {
          runId: String(id),
          now,
          env,
          logger,
          definition: singleDefinition as SingleDefinition<never> | null,
          previousRunCount: await countFinishedRuns(scope),
          results,
          typeOptions: options.typeOptions,
          heartbeat,
          shouldCancel,
        };
        const outcome: ExecutionOutcome = await type.execute(ctx);
        if (outcome.status === 'cancelled' || (await shouldCancel())) {
          status = 'cancelled';
        } else {
          counters = { ...outcome.counters };
          definitionRows = outcome.definitions;
          extras = outcome.extras ?? null;
          events = outcome.events;
          for (const e of outcome.errors) pushError(e);
          // Tip pozna svoje vire in sme reči `partial`/`failed`; `succeeded` pa ne sme skriti
          // neuspelega skenerja (FR-017).
          status = outcome.status === 'succeeded' ? statusFromOutcomes(definitionRows, false) : outcome.status;
        }
      }
    }
  } catch (err) {
    status = 'failed';
    pushError({ code: 'unexpected', message: err instanceof Error ? err.message : 'nepričakovana napaka' });
    logger?.error({ err, runId: String(id), scannerType: claimed.scannerType }, 'Zagon skenerja je spodletel');
  }

  let notificationsPending = 0;
  if (status !== 'cancelled' && events.length > 0) {
    try {
      const built = await buildNotificationsForRun({ runId: id, scannerType: claimed.scannerType, events, now, env, logger });
      notificationsPending = built.created;
    } catch (err) {
      pushError({ code: 'notifications', message: err instanceof Error ? err.message : 'dopisov ni bilo mogoče sestaviti' });
      if (status === 'succeeded') status = 'partial';
      logger?.error({ err, runId: String(id) }, 'Sestavljanje dopisov je spodletelo');
    }
  }

  const finishedAt = new Date();
  await ScannerRunModel.updateOne(
    { _id: id },
    {
      $set: {
        status,
        finishedAt,
        heartbeatAt: finishedAt,
        counters: {
          ...counters,
          definitions: definitionRows.length,
          notificationsPending,
          notificationsSent: 0,
          notificationsSuppressed: 0,
          notificationsFailed: 0,
        },
        definitions: definitionRows.map((d) => ({
          definitionId: new Types.ObjectId(d.definitionId),
          ownerId: new Types.ObjectId(d.ownerId),
          outcome: d.outcome,
          message: d.message,
        })),
        extras,
        runErrors: errors,
      },
    },
  );

  if (singleDefinition) {
    const row = definitionRows.find((d) => d.definitionId === singleDefinition!.id);
    const outcome = status === 'cancelled' ? 'skipped' : (row?.outcome ?? (status === 'failed' ? 'failed' : 'ok'));
    const message = row?.message ?? errors[0]?.message ?? null;
    await ScannerDefinitionModel.updateOne(
      { _id: new Types.ObjectId(singleDefinition.id) },
      {
        $set: {
          'status.lastRunId': id,
          'status.lastRunAt': finishedAt,
          'status.lastOutcome': outcome,
          'status.message': message,
          ...(outcome === 'ok' ? { 'status.lastSuccessAt': finishedAt } : {}),
        },
      },
      { timestamps: false },
    ).catch(() => undefined);
  }

  auditRunFinished(logger, {
    runId: String(id),
    scannerType: claimed.scannerType,
    status,
    durationMs: finishedAt.getTime() - now.getTime(),
    counters: { ...counters, notificationsPending },
  });

  if (options.processOutbox !== false && status !== 'cancelled') {
    // Logični čas zagona (`now`) je lahko pred ali za uro (testi, dohitevanje); outbox dobi poznejšega,
    // da dopisi, sestavljeni z `nextAttemptAt: now`, ne ostanejo čakati na uro.
    await processNotificationOutbox(env, logger, now.getTime() > finishedAt.getTime() ? now : finishedAt);
  }

  return ScannerRunModel.findById(id).lean<RunLean | null>();
}
