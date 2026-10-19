import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerResultHistoryModel } from '../../../src/platform/scanner/models/scanner-result-history.model.js';
import { genericResultReader, reconcileResults, sanitizeResultUrl } from '../../../src/platform/scanner/services/result-store.service.js';
import type { NormalizedResult } from '../../../src/platform/scanner/types.js';

// FR-022 do FR-025 (US5): generična shramba — dedup, spremembe s ceno in brez, nedosegljivo samo ob
// uspehu vira, zgodovina s točkami, dogodki za dopis, povezave samo z dovoljenih gostiteljev.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

const definition = { id: new Types.ObjectId().toString(), userId: new Types.ObjectId().toString(), name: 'Mock' };
const item = (i: number, overrides: Partial<NormalizedResult> = {}): NormalizedResult => ({
  identity: `k:${i}`,
  source: 'mock',
  title: `Naslov ${i}`,
  price: { amount: 100 + i, currency: 'EUR' },
  data: { i },
  url: `https://example.test/x/${i}`,
  ...overrides,
});

async function run(items: NormalizedResult[], sourceSucceeded = true, now = new Date()) {
  return reconcileResults({ definition, runId: new Types.ObjectId(), scannerType: 'mock', items, sourceSucceeded, now, env: loadEnv(), allowedHosts: ['example.test'] });
}

describe('reconcileResults', () => {
  it('prvi zagon: N novih, N vrstic zgodovine, N dogodkov z lastnikom kot prejemnikom', async () => {
    const r = await run([item(1), item(2), item(3)]);
    expect(r.counters).toEqual({ seen: 3, new: 3, changed: 0, unavailable: 0, incomplete: 0 });
    expect(r.events).toHaveLength(3);
    expect(r.events[0]).toMatchObject({ definitionId: definition.id, ownerId: definition.userId, recipients: [definition.userId], changeType: 'NEW', payload: { title: 'Naslov 1', url: 'https://example.test/x/1' } });
    expect(await ScannerResultModel.countDocuments()).toBe(3);
    expect(await ScannerResultHistoryModel.countDocuments()).toBe(3);
  });

  it('isti rezultati → UNCHANGED brez dogodkov, brez podvojitve, lastSeenAt posodobljen, zgodovina dobi točko', async () => {
    const t0 = new Date('2026-10-19T10:00:00Z');
    await run([item(1)], true, t0);
    const t1 = new Date('2026-10-19T11:00:00Z');
    const r = await run([item(1), item(1)], true, t1); // dvojnik znotraj zagona se zlije
    expect(r.counters).toMatchObject({ seen: 1, new: 0, changed: 0 });
    expect(r.events).toEqual([]);
    const docs = await ScannerResultModel.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ lastChangeType: 'UNCHANGED', availability: 'available' });
    expect(docs[0]?.lastSeenAt.toISOString()).toBe(t1.toISOString());
    expect(await ScannerResultHistoryModel.countDocuments()).toBe(2);
  });

  it('druga cena → PRICE_DOWN/PRICE_UP s previousPrice in dogodkom; brez cene drug comparable → CHANGED', async () => {
    await run([item(1), item(2, { price: null, comparable: { v: 1 } })]);
    const r = await run([item(1, { price: { amount: 90, currency: 'EUR' } }), item(2, { price: null, comparable: { v: 2 } })]);
    expect(r.counters).toMatchObject({ changed: 2, new: 0 });
    expect(r.events.map((e) => e.changeType).sort()).toEqual(['CHANGED', 'PRICE_DOWN']);
    const down = await ScannerResultModel.findOne({ identityKey: { $exists: true }, 'price.amount': 90 }).lean();
    expect(down).toMatchObject({ lastChangeType: 'PRICE_DOWN', previousPrice: { amount: 101, currency: 'EUR' } });
    const history = await ScannerResultHistoryModel.find({ resultId: down!._id }).sort({ checkedAt: 1 }).lean();
    expect(history.map((h) => h.changeType)).toEqual(['NEW', 'PRICE_DOWN']);
    expect(history[1]?.previousPrice).toMatchObject({ amount: 101 });
    const up = await run([item(1, { price: { amount: 120, currency: 'EUR' } }), item(2, { price: null, comparable: { v: 2 } })]);
    expect(up.events.map((e) => e.changeType)).toEqual(['PRICE_UP']);
  });

  it('manjkajoč rezultat → UNAVAILABLE samo ob uspešnem viru; ob napaki vira ostane; vrnitev ni dopis', async () => {
    await run([item(1), item(2)]);
    const failed = await run([item(1)], false);
    expect(failed.counters.unavailable).toBe(0);
    expect((await ScannerResultModel.findOne({ title: 'Naslov 2' }).lean())?.availability).toBe('available');
    const ok = await run([item(1)], true);
    expect(ok.counters.unavailable).toBe(1);
    expect(ok.events).toEqual([]);
    const gone = await ScannerResultModel.findOne({ title: 'Naslov 2' }).lean();
    expect(gone).toMatchObject({ availability: 'unavailable', lastChangeType: 'UNAVAILABLE' });
    expect((await ScannerResultHistoryModel.find({ resultId: gone!._id }).lean()).map((h) => h.changeType)).toEqual(['NEW', 'UNAVAILABLE']);
    const back = await run([item(1), item(2)], true);
    expect(back.events).toEqual([]);
    expect((await ScannerResultModel.findOne({ title: 'Naslov 2' }).lean())).toMatchObject({ availability: 'available', lastChangeType: 'UNCHANGED' });
  });

  it('brez identitete ali naslova se zavrže in šteje kot incomplete; tuj gostitelj → url null', async () => {
    const r = await run([item(1, { identity: '' }), item(2, { title: '' }), item(3, { url: 'https://evil.example/x' }), item(4, { url: 'javascript:alert(1)' })]);
    expect(r.counters).toMatchObject({ seen: 2, incomplete: 2 });
    const docs = await ScannerResultModel.find().lean();
    expect(docs.every((d) => d.url === null)).toBe(true);
    expect(sanitizeResultUrl('https://sub.example.test/a?b=1', ['example.test'])).toBe('https://sub.example.test/a?b=1');
    expect(sanitizeResultUrl('https://example.test/a', undefined)).toBeNull();
  });

  it('bralnik: list po seen/price/change, includeUnavailable, count, get z zgodovino; tuj lastnik ne vidi', async () => {
    await run([item(1), item(2), item(3)]);
    await run([item(1, { price: { amount: 50, currency: 'EUR' } }), item(2)]);
    const byPrice = await genericResultReader.list(definition.id, definition.userId, { sort: 'price', includeUnavailable: false, limit: 10 }, loadEnv());
    expect(byPrice.total).toBe(2);
    expect(byPrice.results.map((r) => r.price?.amount)).toEqual([50, 102]);
    const byChange = await genericResultReader.list(definition.id, definition.userId, { sort: 'change', includeUnavailable: true, limit: 10 }, loadEnv());
    expect(byChange.total).toBe(3);
    expect(byChange.results[0]).toMatchObject({ price: { amount: 50 }, change: { type: 'PRICE_DOWN', absolute: -51 } });
    const counts = await genericResultReader.count([definition.id]);
    expect(counts.get(definition.id)).toBe(2);
    const detail = await genericResultReader.get(definition.id, byChange.results[0]!.id, definition.userId, loadEnv());
    expect(detail?.history.map((h) => h.changeType)).toEqual(['NEW', 'PRICE_DOWN']);
    expect(await genericResultReader.get(definition.id, byChange.results[0]!.id, new Types.ObjectId().toString(), loadEnv())).toBeNull();
  });
});
