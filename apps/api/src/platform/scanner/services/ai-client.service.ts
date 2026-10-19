import type { Env } from '../../config/env.js';
import type { Logger } from '../../logging/logger.js';
import { extractAiOutputText, type AiRequestBody, type AiUsage } from '../domain/ai-analysis.js';

// Odjemalec OpenAI Responses API (017, research.md §1). Namenoma `fetch` brez SDK-ja: en klic z eno
// shemo, naslov nastavljiv (`OPENAI_BASE_URL`), zamenljiv v testih (`setAiClientForTests`). Isti
// dogovor kot pri prepisu govora (`modules/notes/services/transcription.service.ts`).
//
// Ključ gre v glavo `Authorization` in nikamor drugam (člen IV). Telo napake se zabeleži skrajšano,
// uporabniku se nikoli ne vrne — v `runErrors` pride samo koda in slovenski stavek.

export type AiClientResult =
  | { ok: true; text: string; usage: AiUsage }
  | { ok: false; reason: string; message: string; usage: AiUsage };

export interface AiClient {
  analyze(body: AiRequestBody, env: Env, logger: Logger | undefined): Promise<AiClientResult>;
}

const RETRY_DELAY_MS = 1_500;
const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 };

function retryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

async function once(body: AiRequestBody, env: Env, logger: Logger | undefined): Promise<AiClientResult & { retry?: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OPENAI_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.OPENAI_BASE_URL.replace(/\/+$/, '')}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      logger?.warn({ event: 'scanner.ai.http', status: res.status, detail }, 'OpenAI je vrnil napako');
      return { ok: false, reason: `http-${res.status}`, message: `Storitev za analizo je vrnila napako ${res.status}.`, usage: NO_USAGE, retry: retryable(res.status) };
    }
    const json = (await res.json()) as unknown;
    const extracted = extractAiOutputText(json);
    if (!extracted.ok) return { ok: false, reason: extracted.reason, message: extracted.message, usage: extracted.usage };
    return { ok: true, text: extracted.text, usage: extracted.usage };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout', message: 'Storitev za analizo se ni odzvala pravočasno.', usage: NO_USAGE, retry: true };
    }
    logger?.warn({ event: 'scanner.ai.error', err }, 'Klic storitve za analizo je spodletel');
    return { ok: false, reason: 'unreachable', message: 'Storitve za analizo ni bilo mogoče doseči.', usage: NO_USAGE, retry: true };
  } finally {
    clearTimeout(timeout);
  }
}

/** Pravi odjemalec: en poskus in ENA ponovitev po kratkem premoru ob 429/5xx/časovni omejitvi (FR-014). */
export const openAiClient: AiClient = {
  async analyze(body, env, logger) {
    const first = await once(body, env, logger);
    if (first.ok || !first.retry) return first;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return once(body, env, logger);
  },
};

let current: AiClient = openAiClient;

export function aiClient(): AiClient {
  return current;
}

/** Samo za teste: ponarejen odjemalec (nobenega omrežja); `null` vrne pravega. */
export function setAiClientForTests(client: AiClient | null): void {
  current = client ?? openAiClient;
}
