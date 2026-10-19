import type { Env } from '../../config/env.js';
import type { Logger } from '../../logging/logger.js';
import { ScannerAiCacheModel } from '../models/scanner-ai-cache.model.js';
import { aiInputHash, buildAiRequest, canonicalAiInput, parseAiOutput, toAnalysis, truncateAiInput } from '../domain/ai-analysis.js';
import { auditAiAnalysisFinished, auditAiAnalysisSkipped } from '../scanner.audit.js';
import type { AiAnalysis, AiCandidate, AiCandidatesContext, AnyScannerType } from '../types.js';
import { aiClient } from './ai-client.service.js';
import { genericAiCandidates, genericAiStore } from './ai-candidates.service.js';
import { recordAiUsage, reserveAiRequest } from './ai-usage.service.js';

// Korak analize z umetno inteligenco v zagonu skenerja (017, FR-006 do FR-014). Kliče ga
// `run-executor.service.ts` PO izvajanju tipa in po sestavljanju dopisov, v lastnem `try/catch`:
// nič, kar se zgodi tu, ne spremeni izida zagona, rezultatov ali dopisov (FR-011, SC-003).
//
// Za vsakega kandidata, po vrsti:
//   1. kanonični vhod → odrez → hash; enak hash kot obstoječa analiza = nič (FR-008, brez poizvedbe);
//   2. predpomnilnik po hashu = analiza brez klica (`cached: true`, FR-013);
//   3. meja na zagon in dnevna rezervacija (FR-012) = sicer `skipped`;
//   4. klic → preverba odgovora → shramba + predpomnilnik; neuspeh = `failed` + `runErrors` (`ai:*`).
// Utrip po vsakem kandidatu, preklic zagona ustavi zanko (že shranjene analize ostanejo).

export interface AiRunCounters extends Record<string, number> {
  aiAnalyzed: number;
  aiCached: number;
  aiSkipped: number;
  aiFailed: number;
}

export interface RunAiAnalysisParams {
  runId: string;
  type: AnyScannerType;
  definitionId: string | null;
  env: Env;
  logger: Logger | undefined;
  now: Date;
  heartbeat(): Promise<void>;
  shouldCancel(): Promise<boolean>;
  pushError(e: { definitionId?: string; code: string; message: string }): void;
}

export function aiAvailable(env: Pick<Env, 'OPENAI_API_KEY'>): boolean {
  return typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim().length > 0;
}

interface ResolvedHooks {
  subject: string | undefined;
  candidates(ctx: AiCandidatesContext): Promise<AiCandidate[]>;
  store(ref: string, analysis: AiAnalysis, ctx: AiCandidatesContext): Promise<boolean>;
}

function resolveHooks(type: AnyScannerType): ResolvedHooks | null {
  const ai = type.ai;
  if (ai?.candidates && ai.store) return { subject: ai.subject, candidates: ai.candidates.bind(ai), store: ai.store.bind(ai) };
  if (type.results === 'generic') {
    return {
      subject: ai?.subject,
      candidates: (ctx) => genericAiCandidates(ctx, ai?.describe?.bind(ai)),
      store: (ref, analysis) => genericAiStore(ref, analysis),
    };
  }
  return null;
}

/** `null` = analiza ni tekla (ni na voljo ali tip je ne podpira) — števci se takrat ne zapišejo. */
export async function runAiAnalysis(params: RunAiAnalysisParams): Promise<AiRunCounters | null> {
  const { env, logger, now, type } = params;
  if (!aiAvailable(env)) return null;
  const hooks = resolveHooks(type);
  if (!hooks) {
    logger?.info({ event: 'scanner.ai.unsupported', runId: params.runId, scannerType: type.type }, 'Tip nima kavljev za analizo z umetno inteligenco');
    return null;
  }

  const counters: AiRunCounters = { aiAnalyzed: 0, aiCached: 0, aiSkipped: 0, aiFailed: 0 };
  const maxPerRun = env.SCANNER_AI_MAX_ITEMS_PER_RUN;
  const ctx: AiCandidatesContext = {
    runId: params.runId,
    scannerType: type.type,
    definitionId: params.definitionId,
    now,
    env,
    logger,
    limit: Math.min(maxPerRun * 4, 500),
  };
  const candidates = await hooks.candidates(ctx);
  if (candidates.length === 0) return counters;

  const model = env.OPENAI_MODEL;
  let calls = 0;
  let dailyExhausted = false;
  let perRunReported = false;

  for (const candidate of candidates) {
    if (await params.shouldCancel()) break;
    const canonical = truncateAiInput(canonicalAiInput(candidate.input, { images: env.SCANNER_AI_IMAGES }), env.SCANNER_AI_MAX_INPUT_CHARS);
    const hash = aiInputHash(model, canonical);
    if (candidate.previousInputHash === hash) continue; // nespremenjen vhod: nič (FR-008)

    try {
      const cached = await ScannerAiCacheModel.findOne({ key: hash }).lean<{ analysis: AiAnalysis } | null>();
      if (cached) {
        const analysis: AiAnalysis = { ...cached.analysis, cached: true, analyzedAt: now, inputHash: hash };
        if (await hooks.store(candidate.ref, analysis, ctx)) counters.aiCached += 1;
        continue;
      }

      if (calls >= maxPerRun) {
        counters.aiSkipped += 1;
        if (!perRunReported) {
          perRunReported = true;
          auditAiAnalysisSkipped(logger, { runId: params.runId, scannerType: type.type, reason: 'per-run-limit', limit: maxPerRun });
        }
        continue;
      }
      if (dailyExhausted || !(await reserveAiRequest(now, env.SCANNER_AI_DAILY_REQUEST_LIMIT))) {
        if (!dailyExhausted) auditAiAnalysisSkipped(logger, { runId: params.runId, scannerType: type.type, reason: 'daily-limit', limit: env.SCANNER_AI_DAILY_REQUEST_LIMIT });
        dailyExhausted = true;
        counters.aiSkipped += 1;
        continue;
      }

      calls += 1;
      const body = buildAiRequest({ model, input: canonical, subject: hooks.subject });
      const result = await aiClient().analyze(body, env, logger);
      await recordAiUsage(now, result.usage);
      if (!result.ok) {
        counters.aiFailed += 1;
        params.pushError({ definitionId: candidate.definitionId, code: `ai:${result.reason}`, message: result.message });
        continue;
      }
      const parsed = parseAiOutput(result.text);
      if (!parsed.ok) {
        counters.aiFailed += 1;
        params.pushError({ definitionId: candidate.definitionId, code: `ai:${parsed.reason}`, message: parsed.message });
        continue;
      }
      const analysis = toAnalysis(parsed.output, { model, analyzedAt: now, inputHash: hash, cached: false });
      await ScannerAiCacheModel.updateOne(
        { key: hash },
        { $setOnInsert: { key: hash, model, analysis, createdAt: now, expiresAt: new Date(now.getTime() + env.SCANNER_AI_CACHE_DAYS * 86_400_000) } },
        { upsert: true },
      ).catch(() => undefined);
      if (await hooks.store(candidate.ref, analysis, ctx)) counters.aiAnalyzed += 1;
    } catch (err) {
      counters.aiFailed += 1;
      params.pushError({ definitionId: candidate.definitionId, code: 'ai:unexpected', message: err instanceof Error ? err.message : 'nepričakovana napaka pri analizi' });
      logger?.error({ err, runId: params.runId, scannerType: type.type, ref: candidate.ref }, 'Analiza rezultata je spodletela; ostali tečejo naprej');
    } finally {
      await params.heartbeat();
    }
  }

  auditAiAnalysisFinished(logger, { runId: params.runId, scannerType: type.type, model, ...counters });
  return counters;
}
