import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { ScannerAiCacheModel } from '../../../src/platform/scanner/models/scanner-ai-cache.model.js';
import { ScannerAiUsageModel } from '../../../src/platform/scanner/models/scanner-ai-usage.model.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { ScannerNotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { resetScannerTypesForTests } from '../../../src/platform/scanner/registry.js';
import { setAiClientForTests, type AiClientResult } from '../../../src/platform/scanner/services/ai-client.service.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { requestManualRun } from '../../../src/platform/scanner/services/scheduler.service.js';
import type { AiRequestBody } from '../../../src/platform/scanner/domain/ai-analysis.js';
import type { AiAnalysis } from '../../../src/platform/scanner/types.js';
import { mockType, okOutcome, seedDefinition, seedUser, type MockTypeHandle } from './_helpers.js';

// 017 (US1–US3): analiza z umetno inteligenco kot korak zagona nad GENERIČNO shrambo — brez omrežja,
// s ponarejenim odjemalcem (`setAiClientForTests`). Mock tip ne poda `ai` kavljev: dokaz, da tip z
// generično shrambo analizo dobi brez dela (US4).

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);

let solo: MockTypeHandle;
const ACTOR = new Types.ObjectId().toString();
const env = () => loadEnv();
const logger = () => getLogger(loadEnv());
const KEYED = { OPENAI_API_KEY: 'sk-test', SCANNER_AI_MAX_ITEMS_PER_RUN: '25', SCANNER_AI_DAILY_REQUEST_LIMIT: '300' };

beforeEach(() => {
  setTestEnv(KEYED);
  resetScannerTypesForTests();
  solo = mockType('solo', 'single');
});
afterEach(async () => {
  setAiClientForTests(null);
  await clearTestDb();
});

interface Item {
  identity: string;
  title: string;
  amount: number;
  data?: Record<string, unknown>;
}

function reconcile(items: Item[]) {
  return async (ctx: Parameters<MockTypeHandle['behaviour']['execute']>[0]) => {
    const { events, counters } = await ctx.results!.reconcile(
      items.map((i) => ({ identity: i.identity, source: 'mock', title: i.title, price: { amount: i.amount, currency: 'EUR' }, data: i.data ?? { description: `Opis ${i.title}` } })),
      { sourceSucceeded: true },
    );
    return okOutcome({ counters, events, definitions: [{ definitionId: ctx.definition!.id, ownerId: ctx.definition!.userId, outcome: 'ok', message: null }] });
  };
}

function validText(body: AiRequestBody): string {
  const text = (body.input[0]?.content[0] as { text: string }).text;
  return JSON.stringify({
    summary: `Ocena: ${text.includes('Naslov 1') ? 'prvi' : 'drugi'}`,
    riskLevel: 'medium',
    explanation: 'Opis je kratek.',
    risks: ['Brez podrobnosti'],
    defects: [],
    opportunities: ['Ugodna cena'],
    attributes: [{ key: 'Source', value: 'mock' }],
    confidence: 'low',
  });
}

/** Ponarejen odjemalec: beleži zahteve; brez `impl` vrne veljaven odgovor. */
function fakeClient(impl?: (body: AiRequestBody, n: number) => AiClientResult | Promise<AiClientResult>) {
  const calls: AiRequestBody[] = [];
  setAiClientForTests({
    analyze: async (body) => {
      calls.push(body);
      if (impl) return impl(body, calls.length);
      return { ok: true, text: validText(body), usage: { inputTokens: 10, outputTokens: 5 } };
    },
  });
  return calls;
}

/** `lean()` vrne `Map` števcev kot navaden objekt. */
const countersOf = (run: { counters: unknown }) => run.counters as Record<string, number>;

async function runDefinition(definitionId: Types.ObjectId, ownerId: Types.ObjectId, now: Date) {
  const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'solo', definitionId: String(definitionId), ownerId: String(ownerId) }, ACTOR, now);
  await executeRun(runId, env(), logger(), now, { processOutbox: false });
  return (await ScannerRunModel.findById(runId).lean())!;
}

const items3: Item[] = [
  { identity: 'a', title: 'Naslov 1', amount: 100 },
  { identity: 'b', title: 'Naslov 2', amount: 200 },
  { identity: 'c', title: 'Naslov 3', amount: 300 },
];

async function analyses(definitionId: Types.ObjectId): Promise<Array<AiAnalysis | null>> {
  const rows = await ScannerResultModel.find({ definitionId }).sort({ title: 1 }).lean<Array<{ aiAnalysis: AiAnalysis | null }>>();
  return rows.map((r) => r.aiAnalysis ?? null);
}

describe('vklop na skener (US1, FR-004, FR-007)', () => {
  it('aiEnabled: analizira nove rezultate, shrani model/čas/hash/stopnjo; brez vklopa ni klica in ni analize', async () => {
    const ana = await seedUser('ana');
    const on = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    const off = await seedDefinition(ana._id, 'solo', { aiEnabled: false, name: 'Brez' });
    solo.behaviour.execute = reconcile(items3);
    const calls = fakeClient();
    const t0 = new Date('2026-10-19T10:00:00Z');

    const runOn = await runDefinition(on._id, ana._id, t0);
    expect(runOn.status).toBe('succeeded');
    expect(calls).toHaveLength(3);
    expect(countersOf(runOn)).toMatchObject({ new: 3, aiAnalyzed: 3, aiCached: 0, aiSkipped: 0, aiFailed: 0 });
    const stored = await analyses(on._id);
    expect(stored.every((a) => a !== null)).toBe(true);
    expect(stored[0]).toMatchObject({ version: 1, model: 'gpt-6.1-sol', cached: false, riskLevel: 'medium', confidence: 'low', summary: 'Ocena: prvi', attributes: { source: 'mock' } });
    expect(stored[0]?.analyzedAt.toISOString()).toBe(t0.toISOString());
    expect(stored[0]?.inputHash).toMatch(/^[0-9a-f]{32}$/);
    // Vhod modelu: naslov, opis iz `data`, cena, vir — nič o lastniku (FR-003).
    const texts = calls.map((c) => (c.input[0]!.content[0] as { text: string }).text);
    expect(texts.every((t) => t.includes('Opis Naslov'))).toBe(true);
    expect(texts.some((t) => t.includes('"amount": 100'))).toBe(true);
    expect(texts.every((t) => !t.includes(String(ana._id)) && !t.includes('ana@example.com'))).toBe(true);
    expect(calls[0]!.model).toBe('gpt-6.1-sol');
    expect(calls[0]!.store).toBe(false);

    const runOff = await runDefinition(off._id, ana._id, new Date('2026-10-19T10:01:00Z'));
    expect(runOff.status).toBe('succeeded');
    expect(calls).toHaveLength(3);
    expect((await analyses(off._id)).every((a) => a === null)).toBe(true);
    // Vrstica zagona ima števce analize (0), ker je bila analiza na voljo in tip jo podpira.
    expect(countersOf(runOff)).toMatchObject({ aiAnalyzed: 0, aiCached: 0 });
  });

  it('brez OPENAI_API_KEY: nič se ne kliče, zagon brez števcev analize (US2.2, SC-002)', async () => {
    setTestEnv({ OPENAI_API_KEY: '' });
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    solo.behaviour.execute = reconcile(items3);
    const calls = fakeClient();
    const run = await runDefinition(def._id, ana._id, new Date('2026-10-19T10:00:00Z'));
    expect(run.status).toBe('succeeded');
    expect(calls).toHaveLength(0);
    expect('aiAnalyzed' in countersOf(run)).toBe(false);
    expect((await analyses(def._id)).every((a) => a === null)).toBe(true);
  });

  it('izklop po analizi: obstoječe analize ostanejo, nove ne nastajajo (FR-015)', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    solo.behaviour.execute = reconcile(items3);
    const calls = fakeClient();
    await runDefinition(def._id, ana._id, new Date('2026-10-19T10:00:00Z'));
    expect(calls).toHaveLength(3);
    await ScannerDefinitionModel.updateOne({ _id: def._id }, { $set: { aiEnabled: false } });
    solo.behaviour.execute = reconcile([...items3, { identity: 'd', title: 'Naslov 4', amount: 400 }]);
    const run = await runDefinition(def._id, ana._id, new Date('2026-10-19T11:00:00Z'));
    expect(run.status).toBe('succeeded');
    expect(calls).toHaveLength(3);
    const stored = await analyses(def._id);
    expect(stored.filter((a) => a !== null)).toHaveLength(3);
    expect(stored[3]).toBeNull();
  });
});

describe('napaka analize ne prekine zagona (US2, FR-011, SC-003)', () => {
  it('odjemalec vrže, vrne napako ali neveljaven JSON → zagon succeeded, rezultati in dopis nedotaknjeni, aiFailed šteje, runErrors ai:*', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    solo.behaviour.execute = reconcile(items3);
    fakeClient(async (_body, n) => {
      if (n === 1) throw new Error('omrežje');
      if (n === 2) return { ok: false, reason: 'http-429', message: 'Storitev za analizo je vrnila napako 429.', usage: { inputTokens: 0, outputTokens: 0 } };
      return { ok: true, text: '{"summary": "brez ostalih polj"}', usage: { inputTokens: 1, outputTokens: 1 } };
    });
    const run = await runDefinition(def._id, ana._id, new Date('2026-10-19T10:00:00Z'));
    expect(run.status).toBe('succeeded');
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(3);
    expect(await ScannerNotificationModel.countDocuments({ runId: run._id })).toBe(1);
    expect(countersOf(run)).toMatchObject({ new: 3, aiAnalyzed: 0, aiFailed: 3, notificationsPending: 1 });
    expect(run.runErrors.map((e) => e.code).sort()).toEqual(['ai:http-429', 'ai:invalid-shape', 'ai:unexpected']);
    expect(run.runErrors.every((e) => String(e.definitionId) === String(def._id))).toBe(true);
    expect((await analyses(def._id)).every((a) => a === null)).toBe(true);
  });

  it('zavrnitev modela in nedokončan odgovor sta neuspeha brez delne analize', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    solo.behaviour.execute = reconcile(items3.slice(0, 2));
    fakeClient(async (_body, n) =>
      n === 1
        ? { ok: false, reason: 'refusal', message: 'Model je analizo zavrnil.', usage: { inputTokens: 0, outputTokens: 0 } }
        : { ok: false, reason: 'incomplete', message: 'Odgovor modela ni dokončan.', usage: { inputTokens: 0, outputTokens: 0 } },
    );
    const run = await runDefinition(def._id, ana._id, new Date('2026-10-19T10:00:00Z'));
    expect(run.status).toBe('succeeded');
    expect(run.runErrors.map((e) => e.code).sort()).toEqual(['ai:incomplete', 'ai:refusal']);
    expect((await analyses(def._id)).every((a) => a === null)).toBe(true);
  });
});

describe('stroški: predpomnilnik, nespremenjen vhod, meje (US3, FR-008, FR-012, FR-013)', () => {
  it('isti vhod pri drugem skenerju pride iz predpomnilnika; nespremenjen vhod ne kliče; sprememba cene kliče enkrat', async () => {
    const ana = await seedUser('ana');
    const bor = await seedUser('bor');
    const a = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    const b = await seedDefinition(bor._id, 'solo', { aiEnabled: true });
    solo.behaviour.execute = reconcile(items3);
    const calls = fakeClient();

    await runDefinition(a._id, ana._id, new Date('2026-10-19T10:00:00Z'));
    expect(calls).toHaveLength(3);
    expect(await ScannerAiCacheModel.countDocuments()).toBe(3);

    const runB = await runDefinition(b._id, bor._id, new Date('2026-10-19T10:05:00Z'));
    expect(calls).toHaveLength(3);
    expect(countersOf(runB)).toMatchObject({ aiAnalyzed: 0, aiCached: 3 });
    const borStored = await analyses(b._id);
    expect(borStored.every((x) => x?.cached === true)).toBe(true);
    expect(borStored[0]?.summary).toBe('Ocena: prvi');

    const again = await runDefinition(a._id, ana._id, new Date('2026-10-19T11:00:00Z'));
    expect(calls).toHaveLength(3);
    expect(countersOf(again)).toMatchObject({ aiAnalyzed: 0, aiCached: 0, aiSkipped: 0, aiFailed: 0 });

    solo.behaviour.execute = reconcile([{ ...items3[0]!, amount: 90 }, items3[1]!, items3[2]!]);
    const changed = await runDefinition(a._id, ana._id, new Date('2026-10-19T12:00:00Z'));
    expect(calls).toHaveLength(4);
    expect(countersOf(changed)).toMatchObject({ changed: 1, aiAnalyzed: 1 });
    const first = await ScannerResultModel.findOne({ definitionId: a._id, title: 'Naslov 1' }).lean<{ aiAnalysis: AiAnalysis }>();
    expect(first?.aiAnalysis.analyzedAt.toISOString()).toBe('2026-10-19T12:00:00.000Z');
    expect(first?.aiAnalysis.cached).toBe(false);
  });

  it('meja na zagon: presežek se preskoči brez napake in pride na vrsto v naslednjem zagonu', async () => {
    setTestEnv({ ...KEYED, SCANNER_AI_MAX_ITEMS_PER_RUN: '2' });
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    const five: Item[] = [1, 2, 3, 4, 5].map((n) => ({ identity: `i${n}`, title: `Naslov ${n}`, amount: n * 10 }));
    solo.behaviour.execute = reconcile(five);
    const calls = fakeClient();
    const run1 = await runDefinition(def._id, ana._id, new Date('2026-10-19T10:00:00Z'));
    expect(run1.status).toBe('succeeded');
    expect(calls).toHaveLength(2);
    expect(countersOf(run1)).toMatchObject({ aiAnalyzed: 2, aiSkipped: 3, aiFailed: 0 });
    expect(run1.runErrors).toHaveLength(0);

    const run2 = await runDefinition(def._id, ana._id, new Date('2026-10-19T11:00:00Z'));
    expect(calls).toHaveLength(4);
    expect(countersOf(run2)).toMatchObject({ aiAnalyzed: 2, aiSkipped: 1 });
    const run3 = await runDefinition(def._id, ana._id, new Date('2026-10-19T12:00:00Z'));
    expect(calls).toHaveLength(5);
    expect(countersOf(run3)).toMatchObject({ aiAnalyzed: 1, aiSkipped: 0 });
    expect((await analyses(def._id)).every((a) => a !== null)).toBe(true);
  });

  it('dnevna meja namestitve: rezervacija v bazi; presežek preskočen; neuspel klic šteje', async () => {
    setTestEnv({ ...KEYED, SCANNER_AI_DAILY_REQUEST_LIMIT: '2' });
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    solo.behaviour.execute = reconcile(items3);
    const calls = fakeClient(async (body, n) => (n === 1 ? { ok: false, reason: 'http-500', message: 'x', usage: { inputTokens: 0, outputTokens: 0 } } : { ok: true, text: validText(body), usage: { inputTokens: 7, outputTokens: 3 } }));
    const run = await runDefinition(def._id, ana._id, new Date('2026-10-19T10:00:00Z'));
    expect(calls).toHaveLength(2);
    expect(countersOf(run)).toMatchObject({ aiAnalyzed: 1, aiFailed: 1, aiSkipped: 1 });
    const usage = await ScannerAiUsageModel.findOne({ day: '2026-10-19' }).lean();
    expect(usage).toMatchObject({ requests: 2, inputTokens: 7, outputTokens: 3 });
  });

  it('nedosegljiv rezultat ni kandidat; rezultat brez analize z znanim vhodom pride iz predpomnilnika', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo', { aiEnabled: true });
    solo.behaviour.execute = reconcile(items3.slice(0, 2));
    const calls = fakeClient();
    await runDefinition(def._id, ana._id, new Date('2026-10-19T10:00:00Z'));
    expect(calls).toHaveLength(2);
    await ScannerResultModel.updateMany({ definitionId: def._id }, { $set: { aiAnalysis: null } });
    solo.behaviour.execute = reconcile([items3[0]!]); // Naslov 2 izgine → UNAVAILABLE
    const run = await runDefinition(def._id, ana._id, new Date('2026-10-19T11:00:00Z'));
    // Naslov 1 brez analize → kandidat; vhod je isti kot prej → zadetek v predpomnilniku, brez klica.
    expect(countersOf(run)).toMatchObject({ unavailable: 1, aiAnalyzed: 0, aiCached: 1 });
    expect(calls).toHaveLength(2);
    expect((await ScannerResultModel.findOne({ definitionId: def._id, title: 'Naslov 2' }).lean<{ aiAnalysis: unknown }>())?.aiAnalysis).toBeNull();
  });
});
