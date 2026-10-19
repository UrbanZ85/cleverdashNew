import { Types } from 'mongoose';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import { FlightSearchRunModel, MAX_RUN_ERRORS } from '../models/flight-search-run.model.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import { findAirport } from '../domain/airports.js';
import { computeWindows } from '../domain/date-window.js';
import { buildQueryPlan, type ProviderQuery } from '../domain/query-plan.js';
import type { ProviderId, ProviderOutcome, RunStatus } from '../domain/types.js';
import { FLIGHT_PROVIDERS, enabledProviders } from '../providers/index.js';
import { advanceFakeProviderRun } from '../providers/fake.provider.js';
import { auditRunFinished, auditRunStarted } from '../flight-deals.audit.js';
import { buildNotificationsForRun } from './notification-builder.service.js';
import { processNotificationOutbox } from './notification-sender.service.js';
import { runQueries, type RunnerOptions } from './provider-runner.service.js';
import { reconcileRun, type RuleWithWindows } from './reconcile.service.js';
import { ruleToInput, type RuleLean } from './rule-access.service.js';
import { originTimezoneOf } from './rule-response.service.js';

// En zagon preverjanja (FR-050 do FR-052, člen V): prevzem `queued → running`, načrt, viri,
// primerjava, dopisi, zaključek. Utrip (`heartbeatAt`) se posodablja med delom, da prekinjen
// zagon prepozna naslednji tik (FR-051). Preklic (`cancelRequested`) se preveri med koraki in med
// iskanji; preklican zagon dopisov NE sestavi.

export interface ExecuteOptions {
  runner?: RunnerOptions;
  /** Po koncu zagona takoj obdelaj outbox (privzeto da); testi, ki preverjajo `pending`, izklopijo. */
  processOutbox?: boolean;
}

interface RunLean {
  _id: Types.ObjectId;
  status: RunStatus;
  trigger: 'schedule' | 'manual';
  slotKey: string;
  cancelRequested: boolean;
}

type CounterField = 'rules' | 'queries' | 'providerRequests' | 'offersSeen' | 'newMatches' | 'priceDrops' | 'priceRises' | 'unavailable';

export async function executeRun(runId: Types.ObjectId | string, env: Env, logger: Logger | undefined, now = new Date(), options: ExecuteOptions = {}): Promise<RunLean | null> {
  const id = new Types.ObjectId(runId);
  const claimed = await FlightSearchRunModel.findOneAndUpdate(
    { _id: id, status: 'queued' },
    { $set: { status: 'running', startedAt: now, heartbeatAt: now } },
    { new: true },
  ).lean<RunLean | null>();
  if (!claimed) return null; // drug izvod ga je že prevzel ali ni več `queued`

  const errors: Array<{ at: Date; providerId?: ProviderId; ruleId?: Types.ObjectId; code: string; message: string }> = [];
  const pushError = (e: { providerId?: ProviderId; ruleId?: Types.ObjectId; code: string; message: string }) => {
    if (errors.length < MAX_RUN_ERRORS) errors.push({ at: new Date(), ...e });
  };
  const heartbeat = async () => {
    await FlightSearchRunModel.updateOne({ _id: id }, { $set: { heartbeatAt: new Date() } }).catch(() => undefined);
  };
  const shouldCancel = async (): Promise<boolean> => {
    const doc = await FlightSearchRunModel.findById(id).select('cancelRequested').lean<{ cancelRequested: boolean } | null>();
    return doc?.cancelRequested === true;
  };

  const providers = enabledProviders(env);
  const allProviderIds = FLIGHT_PROVIDERS.map((p) => p.id);
  const enabledIds = providers.map((p) => p.id);
  if (providers.some((p) => p.id === 'fake')) advanceFakeProviderRun();

  const rules = await FlightSearchRuleModel.find({ active: true }).lean<RuleLean[]>();
  auditRunStarted(logger, { runId: String(id), trigger: claimed.trigger, slotKey: claimed.slotKey, rules: rules.length });

  const counters: Record<CounterField, number> = {
    rules: rules.length,
    queries: 0,
    providerRequests: 0,
    offersSeen: 0,
    newMatches: 0,
    priceDrops: 0,
    priceRises: 0,
    unavailable: 0,
  };
  let status: RunStatus = 'succeeded';
  let notificationsPending = 0;
  const providerTallies = new Map<ProviderId, Record<Exclude<ProviderOutcome, 'disabled'>, number>>();
  for (const p of FLIGHT_PROVIDERS) providerTallies.set(p.id, { ok: 0, noFlights: 0, unsupported: 0, unreachable: 0, rateLimited: 0, incomplete: 0 });

  try {
    if (providers.length === 0) {
      pushError({ code: 'no-providers', message: 'Noben vir letov ni vklopljen v tej namestitvi.' });
    }

    const withWindows: RuleWithWindows[] = [];
    const perRuleQueries: Array<{ ruleId: string; queries: ProviderQuery[] }> = [];
    for (const rule of rules) {
      const input = ruleToInput(rule);
      const windows = computeWindows(input, now, originTimezoneOf(rule));
      withWindows.push({ rule, windows });
      const ctx = { rule: { ...input, id: String(rule._id) }, windows, airports: findAirport };
      const queries = providers.flatMap((p) => {
        try {
          return p.buildQueries(ctx);
        } catch (err) {
          pushError({ providerId: p.id, ruleId: rule._id, code: 'build-queries', message: err instanceof Error ? err.message : 'napaka pri načrtu' });
          return [];
        }
      });
      perRuleQueries.push({ ruleId: String(rule._id), queries });
    }

    const plan = buildQueryPlan(perRuleQueries, { maxQueriesPerRule: env.FLIGHT_MAX_QUERIES_PER_RULE });
    counters.queries = plan.requestedCount;
    await heartbeat();

    if (await shouldCancel()) {
      status = 'cancelled';
    } else {
      const summary = await runQueries(plan, providers, env, logger, now, {
        ...options.runner,
        onProgress: async (done, total) => {
          if (done % 5 === 0 || done === total) await heartbeat();
          await options.runner?.onProgress?.(done, total);
        },
        shouldCancel,
      });
      counters.providerRequests = summary.providerRequests;
      for (const exec of summary.executions.values()) {
        const tally = providerTallies.get(exec.query.providerId);
        if (tally && exec.result.outcome !== 'disabled') tally[exec.result.outcome] += 1;
        if (exec.result.outcome === 'unreachable' || exec.result.outcome === 'rateLimited' || exec.result.outcome === 'incomplete') {
          pushError({ providerId: exec.query.providerId, code: exec.result.outcome, message: exec.result.message ?? exec.result.outcome });
        }
      }

      if (await shouldCancel()) {
        status = 'cancelled';
      } else {
        const outcome = await reconcileRun({
          runId: id,
          plan,
          executions: summary.executions,
          rules: withWindows,
          enabledProviderIds: enabledIds,
          allProviderIds,
          now,
          env,
          logger,
          shouldCancel,
          onRuleDone: heartbeat,
        });
        Object.assign(counters, {
          offersSeen: outcome.counters.offersSeen,
          newMatches: outcome.counters.newMatches,
          priceDrops: outcome.counters.priceDrops,
          priceRises: outcome.counters.priceRises,
          unavailable: outcome.counters.unavailable,
        });

        if (await shouldCancel()) {
          status = 'cancelled';
        } else {
          const built = await buildNotificationsForRun({
            runId: id,
            events: outcome.events,
            offerChanges: outcome.offerChanges,
            rules,
            now,
            env,
            logger,
          });
          notificationsPending = built.created;

          const anyFailure = [...summary.executions.values()].some((e) =>
            e.result.outcome === 'unreachable' || e.result.outcome === 'rateLimited' || e.result.outcome === 'incomplete',
          );
          const anySuccess = [...summary.executions.values()].some((e) => e.result.outcome === 'ok' || e.result.outcome === 'noFlights');
          if (anyFailure && !anySuccess && summary.executions.size > 0) status = 'failed';
          else if (anyFailure) status = 'partial';
          else status = 'succeeded';
        }
      }
    }
  } catch (err) {
    status = 'failed';
    pushError({ code: 'unexpected', message: err instanceof Error ? err.message.slice(0, 300) : 'nepričakovana napaka' });
    logger?.error({ err, runId: String(id) }, 'Zagon preverjanja letov je spodletel');
  }

  const finishedAt = new Date();
  await FlightSearchRunModel.updateOne(
    { _id: id },
    {
      $set: {
        status,
        finishedAt,
        heartbeatAt: finishedAt,
        counters: { ...counters, notificationsPending, notificationsSent: 0, notificationsSuppressed: 0, notificationsFailed: 0 },
        providers: FLIGHT_PROVIDERS.map((p) => ({ providerId: p.id, enabled: enabledIds.includes(p.id), ...providerTallies.get(p.id)! })),
        runErrors: errors,
      },
    },
  );
  auditRunFinished(logger, { runId: String(id), status, durationMs: finishedAt.getTime() - now.getTime(), counters });

  if (options.processOutbox !== false && status !== 'cancelled') {
    // Logični čas zagona (`now`) je lahko pred ali za uro (testi, dohitevanje); outbox dobi poznejšega, da
    // dopisi, sestavljeni z `nextAttemptAt: now`, ne ostanejo čakati na uro.
    await processNotificationOutbox(env, logger, now.getTime() > finishedAt.getTime() ? now : finishedAt);
  }

  return FlightSearchRunModel.findById(id).lean<RunLean | null>();
}
