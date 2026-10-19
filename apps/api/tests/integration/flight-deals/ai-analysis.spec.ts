import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { FlightOfferModel } from '../../../src/modules/flight-deals/models/flight-offer.model.js';
import { resetFakeProviderForTests } from '../../../src/modules/flight-deals/providers/fake.provider.js';
import { flightResultReader } from '../../../src/modules/flight-deals/scanner/results.js';
import { listOffersForRule } from '../../../src/modules/flight-deals/services/offer-query.service.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { setAiClientForTests, type AiClientResult } from '../../../src/platform/scanner/services/ai-client.service.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import type { AiRequestBody } from '../../../src/platform/scanner/domain/ai-analysis.js';
import type { AiAnalysis } from '../../../src/platform/scanner/types.js';
import { seedRule } from '../../contract/flight-deals/_helpers.js';
import { runOnce } from './_run.js';

// 017 nad tipom `flights` (lastna shramba, kavlja `candidates`/`store`): analiza ponudb iskanja z
// `aiEnabled`, shranjena NA PONUDBI, vidna v odgovorih 015 (`Offer.aiAnalysis`) in v generičnem bralniku
// 016. Testni vir z izmišljenimi podatki; ponarejen odjemalec OpenAI.

const BASE = { FLIGHT_FAKE_PROVIDER_ENABLED: 'true', OPENAI_API_KEY: 'sk-test' };

beforeAll(async () => {
  setTestEnv(BASE);
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(() => setTestEnv(BASE));
afterEach(async () => {
  setAiClientForTests(null);
  resetFakeProviderForTests();
  await clearTestDb();
});

async function user(name: string) {
  return UserModel.create({ keycloakSubject: `kc-${name}`, email: `${name}@example.com`, displayName: `Oseba ${name}`, lastLoginAt: new Date() });
}

function fakeClient(impl?: (body: AiRequestBody, n: number) => AiClientResult) {
  const calls: AiRequestBody[] = [];
  setAiClientForTests({
    analyze: async (body) => {
      calls.push(body);
      if (impl) return impl(body, calls.length);
      return {
        ok: true,
        text: JSON.stringify({
          summary: 'Ugoden direktni let.',
          riskLevel: 'low',
          explanation: 'Uradni vir, direktno, cena brez prtljage.',
          risks: ['Prtljaga ni vključena'],
          defects: [],
          opportunities: ['Vikend termin'],
          attributes: [{ key: 'stops', value: '0' }],
          confidence: 'medium',
        }),
        usage: { inputTokens: 20, outputTokens: 8 },
      };
    },
  });
  return calls;
}

/** `lean()` vrne `Map` števcev kot navaden objekt. */
const counters = async (runId: unknown) => (await ScannerRunModel.findById(runId).lean())!.counters as unknown as Record<string, number>;

describe('analiza ponudb letov (017 nad 015)', () => {
  it('iskanje z aiEnabled: nova ujemanja dobijo analizo na ponudbi; vhod brez osebnih podatkov; brez vklopa ni klica', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id), { aiEnabled: true, passengers: { adults: 1, childrenAges: [] } });
    const calls = fakeClient();
    const { runId } = await runOnce(new Date());
    expect(await counters(runId)).toMatchObject({ newMatches: 2, aiAnalyzed: 2, aiFailed: 0 });
    expect(calls).toHaveLength(2);
    const text = (calls[0]!.input[0]!.content[0] as { text: string }).text;
    expect(text).toContain('LJU');
    expect(text).toContain('"provider_official"');
    expect(text).not.toContain('ana@example.com');
    expect(text).not.toContain(String(ana._id));
    expect(calls[0]!.instructions).toContain('letalsko ponudbo');

    const offers = await FlightOfferModel.find({ availability: 'available' }).lean<Array<{ aiAnalysis: AiAnalysis | null }>>();
    expect(offers.filter((o) => o.aiAnalysis !== null)).toHaveLength(2);
    expect(offers.find((o) => o.aiAnalysis)?.aiAnalysis).toMatchObject({ model: 'gpt-6.1-sol', riskLevel: 'low', cached: false, attributes: { stops: '0' } });

    // Odgovor 015: `aiAnalysis` z ISO časom; generični bralnik 016: `aiAnalysis` kot Date.
    const rule = (await import('../../../src/modules/flight-deals/models/flight-search-rule.model.js')).FlightSearchRuleModel;
    const r = await rule.findOne({ userId: ana._id }).lean();
    const list = await listOffersForRule(String(ana._id), String(r!._id), { sort: 'price', includeUnavailable: false, limit: 10 });
    const first = list.offers[0] as { aiAnalysis: { analyzedAt: string; summary: string } | null };
    expect(first.aiAnalysis).toMatchObject({ summary: 'Ugoden direktni let.' });
    expect(typeof first.aiAnalysis?.analyzedAt).toBe('string');
    const generic = await flightResultReader.list(String(r!._id), String(ana._id), { sort: 'seen', includeUnavailable: false, limit: 10 }, loadEnv());
    expect(generic.results[0]?.aiAnalysis?.analyzedAt).toBeInstanceOf(Date);
  });

  it('brez aiEnabled (privzeto) ni klica; dve iskanji z istimi ponudbami = en klic na ponudbo', async () => {
    const ana = await user('ana');
    const bor = await user('bor');
    await seedRule(String(ana._id), { passengers: { adults: 1, childrenAges: [] } });
    const calls = fakeClient();
    const first = await runOnce(new Date());
    expect(calls).toHaveLength(0);
    expect(await counters(first.runId)).toMatchObject({ aiAnalyzed: 0 });

    await seedRule(String(ana._id), { name: 'Z analizo', aiEnabled: true, passengers: { adults: 1, childrenAges: [] } });
    await seedRule(String(bor._id), { name: 'Borova', aiEnabled: true, passengers: { adults: 1, childrenAges: [] } });
    const second = await runOnce(new Date(Date.now() + 1000));
    expect(calls).toHaveLength(2);
    expect(await counters(second.runId)).toMatchObject({ aiAnalyzed: 2 });
  });

  it('pocenitev spremeni vhod → ena ponovna analiza; nespremenjena ponudba ostane brez klica; napaka ne spremeni izida', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id), { aiEnabled: true, passengers: { adults: 1, childrenAges: [] } });
    const calls = fakeClient();
    await runOnce(new Date());
    expect(calls).toHaveLength(2);

    setAiClientForTests({ analyze: async () => ({ ok: false, reason: 'http-500', message: 'Storitev za analizo je vrnila napako 500.', usage: { inputTokens: 0, outputTokens: 0 } }) });
    const second = await runOnce(new Date(Date.now() + 1000)); // zagon 2 testnega vira: 120 € → 89 € (POCENITEV ene ponudbe)
    const run = await ScannerRunModel.findById(second.runId).lean();
    expect(run?.status).toBe('succeeded');
    expect(run!.counters as unknown as Record<string, number>).toMatchObject({ priceDrops: 1, aiAnalyzed: 0, aiFailed: 1 });
    expect(run?.runErrors.map((e) => e.code)).toEqual(['ai:http-500']);
    // Prejšnja analiza pocenjene ponudbe OSTANE (neuspeh je ne briše).
    const offers = await FlightOfferModel.find({ availability: 'available' }).lean<Array<{ aiAnalysis: AiAnalysis | null }>>();
    expect(offers.filter((o) => o.aiAnalysis !== null)).toHaveLength(2);
  });
});
