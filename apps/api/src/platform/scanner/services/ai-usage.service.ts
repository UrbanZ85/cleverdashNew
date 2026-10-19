import { DateTime } from 'luxon';
import { AI_USAGE_RETENTION_DAYS, ScannerAiUsageModel } from '../models/scanner-ai-usage.model.js';

// Dnevni proračun klicev modela (017, FR-012). Rezervacija je ATOMARNA: `findOneAndUpdate` s pogojem
// `requests < limit` v filtru — dva izvoda API-ja ne moreta oba dobiti zadnjega klica. Dan je
// koledarski dan v coni Europe/Ljubljana (člen V.4), ne UTC: "300 na dan" pomeni dan, kot ga vidi
// lastnik namestitve.

export const AI_USAGE_ZONE = 'Europe/Ljubljana';

export function aiUsageDay(now: Date): string {
  return DateTime.fromJSDate(now, { zone: 'utc' }).setZone(AI_USAGE_ZONE).toFormat('yyyy-LL-dd');
}

/** `true` = klic rezerviran (šteje tudi, če potem spodleti); `false` = dnevna meja dosežena. */
export async function reserveAiRequest(now: Date, limit: number): Promise<boolean> {
  const day = aiUsageDay(now);
  await ScannerAiUsageModel.updateOne(
    { day },
    { $setOnInsert: { day, requests: 0, inputTokens: 0, outputTokens: 0, expiresAt: new Date(now.getTime() + AI_USAGE_RETENTION_DAYS * 86_400_000) } },
    { upsert: true },
  );
  const reserved = await ScannerAiUsageModel.findOneAndUpdate({ day, requests: { $lt: limit } }, { $inc: { requests: 1 } }, { new: true }).lean();
  return reserved !== null;
}

export async function recordAiUsage(now: Date, usage: { inputTokens: number; outputTokens: number }): Promise<void> {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return;
  await ScannerAiUsageModel.updateOne({ day: aiUsageDay(now) }, { $inc: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } }).catch(() => undefined);
}

export async function readAiUsage(now: Date): Promise<{ day: string; requests: number; inputTokens: number; outputTokens: number }> {
  const day = aiUsageDay(now);
  const doc = await ScannerAiUsageModel.findOne({ day }).lean<{ requests: number; inputTokens: number; outputTokens: number } | null>();
  return { day, requests: doc?.requests ?? 0, inputTokens: doc?.inputTokens ?? 0, outputTokens: doc?.outputTokens ?? 0 };
}
