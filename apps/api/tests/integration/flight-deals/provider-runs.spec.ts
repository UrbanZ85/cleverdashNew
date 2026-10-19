import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightOfferModel } from '../../../src/modules/flight-deals/models/flight-offer.model.js';
import { FlightSearchMatchModel } from '../../../src/modules/flight-deals/models/flight-search-match.model.js';
import { FlightSearchRuleModel } from '../../../src/modules/flight-deals/models/flight-search-rule.model.js';
import { FlightSearchRunModel } from '../../../src/modules/flight-deals/models/flight-search-run.model.js';
import { FlightNotificationModel } from '../../../src/modules/flight-deals/models/flight-notification.model.js';
import { FlightProviderStatusModel } from '../../../src/modules/flight-deals/models/flight-provider-status.model.js';
import { ExternalCacheModel } from '../../../src/platform/cache/model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { seedRule } from '../../contract/flight-deals/_helpers.js';
import { runOnce, stubTravelpayouts, tpRow } from './_run.js';

// US2 z resničnim virom (mockan fetch): deduplikacija poizvedb prek predpomnilnika (FR-024, SC-007),
// izpad vira (FR-017, FR-018, SC-008), UNAVAILABLE samo ob uspehu (FR-028), ponovitev po 503,
// 429 brez ponovitve, žeton ni v URL (člen IV).

beforeAll(async () => {
  setTestEnv({ FLIGHT_TRAVELPAYOUTS_TOKEN: 'secret-token-xyz', FLIGHT_PROVIDER_CACHE_SECONDS: '3600' });
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(() => vi.unstubAllGlobals());
afterEach(async () => {
  vi.unstubAllGlobals();
  await clearTestDb();
});

async function user(name: string) {
  return UserModel.create({ keycloakSubject: `kc-${name}`, email: `${name}@example.com`, displayName: name, lastLoginAt: new Date() });
}

/** Iskanje, ki ustreza vrstici tpRow: LJU → kamor koli, kateri koli dan, 2 noči. */
const ANY_DAY = { outbound: { weekdays: [], earliest: null, latest: null }, inbound: { weekdays: [], earliest: null, latest: null }, price: { maxPerPerson: null, maxTotal: null, currency: 'EUR' } };

describe('deduplikacija poizvedb', () => {
  it('dve iskanji dveh uporabnikov za isto kombinacijo → en klic vira; drugi zagon v TTL → nič klicev (SC-007)', async () => {
    const ana = await user('ana');
    const bor = await user('bor');
    await seedRule(String(ana._id), ANY_DAY);
    await seedRule(String(bor._id), { ...ANY_DAY, price: { maxPerPerson: 50, maxTotal: null, currency: 'EUR' } });
    const { calls } = stubTravelpayouts({ responses: [{ status: 200, body: { success: true, data: [tpRow({ price: 59 })] } }] });

    const first = await runOnce();
    expect(first.run?.status).toBe('succeeded');
    // 2 iskanji × 1 letališče × meseci okna, a vsak ključ enkrat: število klicev = število RAZLIČNIH mesecev.
    const run1 = await FlightSearchRunModel.findById(first.runId).lean();
    expect(run1?.counters?.queries).toBe(calls.length * 2);
    expect(run1?.counters?.providerRequests).toBe(calls.length);
    expect(calls.length).toBeGreaterThan(0);

    // Vsak dobi SAMO ponudbe po svojih pravilih: Bor ima mejo 50 €/osebo, ponudba je 59 × 2 = 118 → 59/osebo > 50.
    const anaMatches = await FlightSearchMatchModel.countDocuments({ ruleOwnerId: ana._id, status: 'active' });
    const borMatches = await FlightSearchMatchModel.countDocuments({ ruleOwnerId: bor._id, status: 'active' });
    expect(anaMatches).toBe(1);
    expect(borMatches).toBe(0);
    // Analiza zadnjega preverjanja (19. 10. 2026): koliko je vir vrnil in zakaj je bilo kaj zavrnjeno.
    const anaRule = await FlightSearchRuleModel.findOne({ userId: ana._id }).lean();
    expect(anaRule?.lastCheck?.analysis).toMatchObject({ returned: 1, matched: 1, rejected: [] });
    const borRule = await FlightSearchRuleModel.findOne({ userId: bor._id }).lean();
    expect(borRule?.lastCheck?.analysis).toMatchObject({ returned: 1, matched: 0, rejected: [{ reason: 'pricePerPerson', label: 'cena na osebo nad mejo', count: 1 }] });

    const before = calls.length;
    const second = await runOnce(new Date(Date.now() + 1000));
    expect(second.run?.status).toBe('succeeded');
    expect(calls.length).toBe(before);
    const run2 = await FlightSearchRunModel.findById(second.runId).lean();
    expect(run2?.counters?.providerRequests).toBe(0);
  });

  it('žeton ni v URL predpomnilnika niti v napakah zagona (člen IV)', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id), ANY_DAY);
    const { calls } = stubTravelpayouts({ responses: [{ status: 200, body: { success: true, data: [] } }] });
    await runOnce();
    const cached = await ExternalCacheModel.find().lean();
    expect(cached.length).toBeGreaterThan(0);
    for (const c of cached) expect(c.sourceUrl).not.toContain('secret-token-xyz');
    for (const url of calls) expect(url).not.toContain('secret-token-xyz');
  });
});

describe('izpad vira', () => {
  it('503 → unreachable, ponudbe ostanejo, zagon failed, lastCheck pove (FR-018, SC-008)', async () => {
    const ana = await user('ana');
    const rule = await seedRule(String(ana._id), ANY_DAY);
    stubTravelpayouts({ responses: [{ status: 200, body: { success: true, data: [tpRow()] } }] });
    const first = await runOnce();
    expect(first.run?.status).toBe('succeeded');
    expect(await FlightOfferModel.countDocuments({ availability: 'available' })).toBe(1);

    vi.unstubAllGlobals();
    stubTravelpayouts({ responses: [{ status: 503 }] });
    // Predpomnilnik je še svež (TTL 3600) — da bi vir res poklicali, ga postaramo.
    await ExternalCacheModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const second = await runOnce(new Date(Date.now() + 2000));
    // Edini vir je v celoti odpovedal → `failed` (nobeno iskanje ni dobilo podatkov); `partial` bi bilo ob
    // delnem uspehu. Ponudbe kljub temu ostanejo.
    expect(second.run?.status).toBe('failed');
    expect(await FlightOfferModel.countDocuments({ availability: 'available' })).toBe(1);
    expect(await FlightSearchMatchModel.countDocuments({ ruleId: rule._id, status: 'active' })).toBe(1);
    const fresh = await FlightSearchRuleModel.findById(rule._id).lean();
    const tp = fresh?.lastCheck?.outcomes.find((o) => o.providerId === 'travelpayouts');
    expect(tp?.outcome).toBe('unreachable');
    expect(fresh?.lastSuccessfulCheckAt?.getTime()).toBe(first.run ? (await FlightSearchRunModel.findById(first.runId).lean())?.startedAt?.getTime() : 0);
    expect(await FlightNotificationModel.countDocuments()).toBe(1); // samo iz prvega zagona (NOVO)
    const status = await FlightProviderStatusModel.findOne({ providerId: 'travelpayouts' }).lean();
    expect(status?.lastOutcome).toBe('unreachable');
    expect(status?.lastError).toBeTruthy();
  });

  it('503, nato 200 → ponovitev uspe, izid ok, ponudbe primerjane enkrat', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id), ANY_DAY);
    const { calls } = stubTravelpayouts({ responses: [{ status: 503 }, { status: 200, body: { success: true, data: [tpRow()] } }] });
    const { run, runId } = await runOnce();
    expect(run?.status).toBe('succeeded');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const doc = await FlightSearchRunModel.findById(runId).lean();
    expect(doc?.counters?.newMatches).toBe(1);
    expect(await FlightOfferModel.countDocuments()).toBe(1);
  });

  it('429 se v istem zagonu NE ponovi in da rateLimited', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id), ANY_DAY);
    const { calls } = stubTravelpayouts({ responses: [{ status: 429 }] });
    const { run, runId } = await runOnce();
    expect(run?.status).toBe('failed');
    const months = (await FlightSearchRunModel.findById(runId).lean())?.counters?.queries ?? 0;
    expect(calls.length).toBe(months); // ena zahteva na poizvedbo, brez ponovitev
    const fresh = await FlightSearchRuleModel.findOne().lean();
    expect(fresh?.lastCheck?.outcomes.find((o) => o.providerId === 'travelpayouts')?.outcome).toBe('rateLimited');
  });

  it('UNAVAILABLE samo ob USPEŠNEM odgovoru brez ponudbe (FR-028)', async () => {
    const ana = await user('ana');
    const rule = await seedRule(String(ana._id), ANY_DAY);
    stubTravelpayouts({ responses: [{ status: 200, body: { success: true, data: [tpRow(), tpRow({ destination: 'BGY', flight: '5678' })] } }] });
    await runOnce();
    expect(await FlightOfferModel.countDocuments({ availability: 'available' })).toBe(2);

    vi.unstubAllGlobals();
    stubTravelpayouts({ responses: [{ status: 200, body: { success: true, data: [tpRow()] } }] });
    await ExternalCacheModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const { runId } = await runOnce(new Date(Date.now() + 2000));
    const gone = await FlightOfferModel.findOne({ destination: 'BGY' }).lean();
    expect(gone?.availability).toBe('unavailable');
    expect(gone?.lastChangeType).toBe('UNAVAILABLE');
    expect(await FlightSearchMatchModel.countDocuments({ ruleId: rule._id, status: 'unavailable' })).toBe(1);
    expect(await FlightSearchMatchModel.countDocuments({ ruleId: rule._id, status: 'active' })).toBe(1);
    expect((await FlightSearchRunModel.findById(runId).lean())?.counters?.unavailable).toBe(1);
  });

  it('brez vklopljenih virov zagon konča succeeded z napako "no-providers"', async () => {
    setTestEnv({ FLIGHT_TRAVELPAYOUTS_TOKEN: '' });
    const ana = await user('ana');
    await seedRule(String(ana._id), ANY_DAY);
    const { run, runId } = await runOnce();
    expect(run?.status).toBe('succeeded');
    const doc = await FlightSearchRunModel.findById(runId).lean();
    expect(doc?.runErrors.map((e) => e.code)).toContain('no-providers');
    const fresh = await FlightSearchRuleModel.findOne().lean();
    expect(fresh?.lastCheck?.outcomes.every((o) => o.outcome === 'disabled')).toBe(true);
    setTestEnv({ FLIGHT_TRAVELPAYOUTS_TOKEN: 'secret-token-xyz', FLIGHT_PROVIDER_CACHE_SECONDS: '3600' });
  });
});
