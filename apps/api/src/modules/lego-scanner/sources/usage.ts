import { DateTime } from 'luxon';
import { LEGO_USAGE_RETENTION_DAYS, LegoSourceUsageModel, type LEGO_USAGE_SOURCES } from '../models/lego-source-usage.model.js';

export type UsageSource = (typeof LEGO_USAGE_SOURCES)[number];

export function usageDay(now: Date): string {
  return DateTime.fromJSDate(now, { zone: 'utc' }).setZone('Europe/Ljubljana').toFormat('yyyy-LL-dd');
}

/** `true` = zahteva rezervirana (šteje tudi, če spodleti); `false` = dnevna meja vira dosežena. */
export async function reserveSourceRequest(source: UsageSource, now: Date, limit: number): Promise<boolean> {
  const day = usageDay(now);
  await LegoSourceUsageModel.updateOne(
    { source, day },
    { $setOnInsert: { source, day, requests: 0, expiresAt: new Date(now.getTime() + LEGO_USAGE_RETENTION_DAYS * 86_400_000) } },
    { upsert: true },
  ).catch((err: { code?: number }) => {
    if (err?.code !== 11000) throw err; // dva izvoda hkrati: drugi je zapis že ustvaril
  });
  const reserved = await LegoSourceUsageModel.findOneAndUpdate({ source, day, requests: { $lt: limit } }, { $inc: { requests: 1 } }, { new: true }).lean();
  return reserved !== null;
}

export async function readSourceUsage(source: UsageSource, now: Date): Promise<number> {
  const doc = await LegoSourceUsageModel.findOne({ source, day: usageDay(now) }).lean<{ requests: number } | null>();
  return doc?.requests ?? 0;
}
