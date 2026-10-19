import { Types } from 'mongoose';
import type { ExecutionContext, ExecutionOutcome, ScannerEvent } from '../../../platform/scanner/types.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import { findAirport } from '../domain/airports.js';
import { computeWindows } from '../domain/date-window.js';
import { buildQueryPlan, type ProviderQuery } from '../domain/query-plan.js';
import type { ProviderId, ProviderOutcome } from '../domain/types.js';
import { FLIGHT_PROVIDERS, enabledProviders } from '../providers/index.js';
import { advanceFakeProviderRun } from '../providers/fake.provider.js';
import { runQueries, type RunnerOptions } from '../services/provider-runner.service.js';
import { reconcileRun, type RuleWithWindows } from '../services/reconcile.service.js';
import { ruleToInput, type RuleLean } from '../services/rule-access.service.js';
import { originTimezoneOf } from '../services/rule-response.service.js';

// Telo zagona tipa `flights` (016, research.md §7): vsa aktivna iskanja vseh uporabnikov v enem
// zagonu — načrt, viri, primerjava. Prevzem zagona, utrip, preklic, zaključek in dopisi so v
// jedru (`platform/scanner/services/run-executor.service.ts`); to je bilo do 016 telo
// `services/run-executor.service.ts` modula Leti, brez zapisov v zbirko zagonov.
//
// Vrne `ExecutionOutcome`: števce iz 015 (`rules`, `queries`, `providerRequests`, `offersSeen`,
// `newMatches`, `priceDrops`, `priceRises`, `unavailable`), izid na iskanje (FR-017 — napaka enega
// iskanja v primerjavi ne podre ostalih), dogodke za dopise (prejemnike določi modul: lastnik +
// prejemniki z vklopljenim obveščanjem) in `extras.providers` z izidi po virih za admin.

/** Možnosti, ki jih podajo testi (`ctx.typeOptions`): ničelni zamiki ponovitev. */
export interface FlightTypeOptions {
  runner?: RunnerOptions;
}

type CounterField = 'rules' | 'queries' | 'providerRequests' | 'offersSeen' | 'newMatches' | 'priceDrops' | 'priceRises' | 'unavailable';

export async function executeFlightBatch(ctx: ExecutionContext<never>): Promise<ExecutionOutcome> {
  const { env, logger, now } = ctx;
  const runId = new Types.ObjectId(ctx.runId);
  const typeOptions = (ctx.typeOptions ?? {}) as FlightTypeOptions;

  const errors: ExecutionOutcome['errors'] = [];
  const pushError = (e: { providerId?: ProviderId; ruleId?: Types.ObjectId | string; code: string; message: string }) => {
    errors.push({
      ...(e.ruleId ? { definitionId: String(e.ruleId) } : {}),
      code: e.providerId ? `${e.providerId}:${e.code}` : e.code,
      message: e.message,
    });
  };

  const providers = enabledProviders(env);
  const allProviderIds = FLIGHT_PROVIDERS.map((p) => p.id);
  const enabledIds = providers.map((p) => p.id);
  if (providers.some((p) => p.id === 'fake')) advanceFakeProviderRun();

  const rules = await FlightSearchRuleModel.find({ active: true }).lean<RuleLean[]>();

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
  let status: ExecutionOutcome['status'] = 'succeeded';
  const ruleFailures = new Map<string, string>();
  const events: ScannerEvent[] = [];
  const providerTallies = new Map<ProviderId, Record<Exclude<ProviderOutcome, 'disabled'>, number>>();
  for (const p of FLIGHT_PROVIDERS) providerTallies.set(p.id, { ok: 0, noFlights: 0, unsupported: 0, unreachable: 0, rateLimited: 0, incomplete: 0 });

  if (providers.length === 0) {
    pushError({ code: 'no-providers', message: 'Noben vir letov ni vklopljen v tej namestitvi.' });
  }

  const withWindows: RuleWithWindows[] = [];
  const perRuleQueries: Array<{ ruleId: string; queries: ProviderQuery[] }> = [];
  for (const rule of rules) {
    const input = ruleToInput(rule);
    const windows = computeWindows(input, now, originTimezoneOf(rule));
    withWindows.push({ rule, windows });
    const queryCtx = { rule: { ...input, id: String(rule._id) }, windows, airports: findAirport };
    const queries = providers.flatMap((p) => {
      try {
        return p.buildQueries(queryCtx);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'napaka pri načrtu';
        pushError({ providerId: p.id, ruleId: rule._id, code: 'build-queries', message });
        ruleFailures.set(String(rule._id), message);
        return [];
      }
    });
    perRuleQueries.push({ ruleId: String(rule._id), queries });
  }

  const plan = buildQueryPlan(perRuleQueries, { maxQueriesPerRule: env.FLIGHT_MAX_QUERIES_PER_RULE });
  counters.queries = plan.requestedCount;
  await ctx.heartbeat();

  if (await ctx.shouldCancel()) {
    return { status: 'cancelled', counters, definitions: [], events: [], errors };
  }

  const summary = await runQueries(plan, providers, env, logger, now, {
    ...typeOptions.runner,
    onProgress: async (done, total) => {
      if (done % 5 === 0 || done === total) await ctx.heartbeat();
      await typeOptions.runner?.onProgress?.(done, total);
    },
    shouldCancel: ctx.shouldCancel,
  });
  counters.providerRequests = summary.providerRequests;
  for (const exec of summary.executions.values()) {
    const tally = providerTallies.get(exec.query.providerId);
    if (tally && exec.result.outcome !== 'disabled') tally[exec.result.outcome] += 1;
    if (exec.result.outcome === 'unreachable' || exec.result.outcome === 'rateLimited' || exec.result.outcome === 'incomplete') {
      pushError({ providerId: exec.query.providerId, code: exec.result.outcome, message: exec.result.message ?? exec.result.outcome });
    }
  }

  if (await ctx.shouldCancel()) {
    return { status: 'cancelled', counters, definitions: [], events: [], errors };
  }

  const outcome = await reconcileRun({
    runId,
    plan,
    executions: summary.executions,
    rules: withWindows,
    enabledProviderIds: enabledIds,
    allProviderIds,
    now,
    env,
    logger,
    shouldCancel: ctx.shouldCancel,
    onRuleDone: ctx.heartbeat,
    onRuleError: (ruleId, err) => {
      const message = err instanceof Error ? err.message : 'napaka pri primerjavi';
      pushError({ ruleId, code: 'reconcile', message });
      ruleFailures.set(ruleId, message);
      logger?.error({ err, ruleId, runId: ctx.runId }, 'Primerjava za iskanje je spodletela; ostala iskanja tečejo naprej');
    },
  });
  Object.assign(counters, {
    offersSeen: outcome.counters.offersSeen,
    newMatches: outcome.counters.newMatches,
    priceDrops: outcome.counters.priceDrops,
    priceRises: outcome.counters.priceRises,
    unavailable: outcome.counters.unavailable,
  });

  if (await ctx.shouldCancel()) {
    return { status: 'cancelled', counters, definitions: [], events: [], errors };
  }

  // Dogodki za dopise: prejemnike določi MODUL (lastnik + prejemniki z vklopljenim obveščanjem,
  // FR-035); jedro deljenja ne pozna.
  const rulesById = new Map(rules.map((r) => [String(r._id), r]));
  for (const event of outcome.events) {
    const rule = rulesById.get(event.ruleId);
    const change = outcome.offerChanges.get(event.offerId);
    if (!rule || !change) continue;
    events.push({
      definitionId: event.ruleId,
      definitionName: rule.name,
      ownerId: event.ruleOwnerId,
      recipients: [String(rule.userId), ...rule.recipients.filter((r) => r.notify).map((r) => String(r.userId))],
      resultRef: event.offerId,
      changeType: event.changeType === 'NEW' || event.changeType === 'PRICE_DOWN' || event.changeType === 'PRICE_UP' ? event.changeType : 'CHANGED',
      payload: {
        offerId: event.offerId,
        price: change.price,
        previousPrice: event.changeType === 'NEW' ? null : change.previousPrice,
      },
    });
  }

  const anyFailure = [...summary.executions.values()].some(
    (e) => e.result.outcome === 'unreachable' || e.result.outcome === 'rateLimited' || e.result.outcome === 'incomplete',
  );
  const anySuccess = [...summary.executions.values()].some((e) => e.result.outcome === 'ok' || e.result.outcome === 'noFlights');
  if (anyFailure && !anySuccess && summary.executions.size > 0) status = 'failed';
  else if (anyFailure) status = 'partial';
  else status = 'succeeded';

  return {
    status,
    counters,
    definitions: rules.map((rule) => {
      const failure = ruleFailures.get(String(rule._id));
      return { definitionId: String(rule._id), ownerId: String(rule.userId), outcome: failure ? 'failed' : 'ok', message: failure ?? null };
    }),
    events,
    extras: {
      providers: FLIGHT_PROVIDERS.map((p) => ({ providerId: p.id, enabled: enabledIds.includes(p.id), ...providerTallies.get(p.id)! })),
    },
    errors,
  };
}
