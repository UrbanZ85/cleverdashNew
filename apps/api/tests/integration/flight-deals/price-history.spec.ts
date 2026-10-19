import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightOfferModel } from '../../../src/modules/flight-deals/models/flight-offer.model.js';
import { FlightOfferHistoryModel } from '../../../src/modules/flight-deals/models/flight-offer-history.model.js';
import { FlightSearchMatchModel } from '../../../src/modules/flight-deals/models/flight-search-match.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { resetFakeProviderForTests } from '../../../src/modules/flight-deals/providers/fake.provider.js';
import { seedRule } from '../../contract/flight-deals/_helpers.js';
import { runOnce } from './_run.js';

// US3 s testnim virom (quickstart.md §5): 120 → 89 → 110; zgodovina s točkami; NOVO brez prejšnje
// cene; UNAVAILABLE, ko ponudba izgine ob uspešnem odgovoru; več iskanj z isto ponudbo.

beforeAll(async () => {
  setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  resetFakeProviderForTests();
  await clearTestDb();
});

async function user(name: string) {
  return UserModel.create({ keycloakSubject: `kc-${name}`, email: `${name}@example.com`, displayName: name, lastLoginAt: new Date() });
}

describe('zgodovina cen', () => {
  it('trije zagoni: NOVO → POCENITEV (−31, −25,8 %) → PODRAŽITEV (+21, +23,6 %), zgodovina s tremi točkami', async () => {
    const ana = await user('ana');
    const rule = await seedRule(String(ana._id), { passengers: { adults: 1, childrenAges: [] } });
    const t0 = Date.now();

    const r1 = await runOnce(new Date(t0));
    expect(r1.run?.status).toBe('succeeded');
    const offer1 = await FlightOfferModel.findOne({ destination: 'STN', 'outbound.flightNumbers': 'FR1234' }).lean();
    expect(offer1).toMatchObject({ price: { amount: 120, currency: 'EUR' }, lastChangeType: 'NEW', previousPrice: null });
    const m1 = await FlightSearchMatchModel.findOne({ ruleId: rule._id, offerId: offer1!._id }).lean();
    expect(m1?.lastChangeType).toBe('NEW');
    expect((await ScannerRunModel.findById(r1.runId).lean())?.counters).toMatchObject({ newMatches: 2, priceDrops: 0 });

    const r2 = await runOnce(new Date(t0 + 60_000));
    const offer2 = await FlightOfferModel.findById(offer1!._id).lean();
    expect(offer2?.price.amount).toBe(89);
    expect(offer2?.lastChangeType).toBe('PRICE_DOWN');
    expect(offer2?.previousPrice).toMatchObject({ amount: 120, currency: 'EUR' });
    expect((await FlightSearchMatchModel.findOne({ ruleId: rule._id, offerId: offer1!._id }).lean())?.lastChangeType).toBe('PRICE_DOWN');
    expect((await ScannerRunModel.findById(r2.runId).lean())?.counters).toMatchObject({ newMatches: 0, priceDrops: 1, priceRises: 0 });

    const r3 = await runOnce(new Date(t0 + 120_000));
    const offer3 = await FlightOfferModel.findById(offer1!._id).lean();
    expect(offer3?.price.amount).toBe(110);
    expect(offer3?.lastChangeType).toBe('PRICE_UP');
    expect(offer3?.previousPrice).toMatchObject({ amount: 89 });
    expect((await ScannerRunModel.findById(r3.runId).lean())?.counters).toMatchObject({ priceRises: 1, unavailable: 1 });

    const history = await FlightOfferHistoryModel.find({ offerId: offer1!._id }).sort({ checkedAt: 1 }).lean();
    expect(history.map((h) => h.changeType)).toEqual(['NEW', 'PRICE_DOWN', 'PRICE_UP']);
    expect(history.map((h) => h.price?.amount)).toEqual([120, 89, 110]);
    expect(history[0]?.previousPrice).toBeNull();
    expect(history[1]?.previousPrice?.amount).toBe(120);
    expect(history[0]?.expiresAt.getTime()).toBeGreaterThan(t0 + 179 * 86_400_000);

    // BGY ponudba od tretjega zagona izgine → UNAVAILABLE ob uspešnem odgovoru.
    const bgy = await FlightOfferModel.findOne({ destination: 'BGY' }).lean();
    expect(bgy?.availability).toBe('unavailable');
    const bgyHistory = await FlightOfferHistoryModel.find({ offerId: bgy!._id }).sort({ checkedAt: 1 }).lean();
    expect(bgyHistory.map((h) => h.changeType)).toEqual(['NEW', 'UNCHANGED', 'UNAVAILABLE']);
    expect(bgyHistory[2]?.price).toBeNull();

    // Četrti zagon: enaka cena → UNCHANGED točka, brez spremembe na ujemanju.
    await runOnce(new Date(t0 + 180_000));
    const h4 = await FlightOfferHistoryModel.find({ offerId: offer1!._id }).sort({ checkedAt: 1 }).lean();
    expect(h4.at(-1)?.changeType).toBe('UNCHANGED');
    expect((await FlightOfferModel.findById(offer1!._id).lean())?.previousPrice?.amount).toBe(89);
  });

  it('let ob 14:30 ne ustreza "po 15:00" in ni med ujemanji; "stale" ko se pravila zožijo', async () => {
    const ana = await user('ana');
    const rule = await seedRule(String(ana._id));
    await runOnce();
    const early = await FlightOfferModel.findOne({ 'outbound.flightNumbers': 'FR1230' }).lean();
    expect(early).not.toBeNull();
    expect(await FlightSearchMatchModel.countDocuments({ ruleId: rule._id, offerId: early!._id })).toBe(0);
    expect(await FlightSearchMatchModel.countDocuments({ ruleId: rule._id, status: 'active' })).toBe(2);

    // Zožitev: največ 100 €/osebo → 120 € ponudba ne ustreza več (89 € v drugem zagonu bi, a cena v drugem zagonu je 89 — zato zožimo na 50).
    await rule.updateOne({ $set: { 'price.maxPerPerson': 50 } });
    await runOnce(new Date(Date.now() + 1000));
    expect(await FlightSearchMatchModel.countDocuments({ ruleId: rule._id, status: 'stale' })).toBe(2);
    expect(await FlightSearchMatchModel.countDocuments({ ruleId: rule._id, status: 'active' })).toBe(0);
  });

  it('več iskanj z isto ponudbo: ena ponudba, dve ujemanji, za vsako iskanje svoj NOVO (edge case)', async () => {
    const ana = await user('ana');
    const bor = await user('bor');
    await seedRule(String(ana._id));
    await runOnce();
    const offers = await FlightOfferModel.countDocuments();
    const rule2 = await seedRule(String(bor._id));
    await runOnce(new Date(Date.now() + 60_000));
    expect(await FlightOfferModel.countDocuments()).toBe(offers);
    const m2 = await FlightSearchMatchModel.find({ ruleId: rule2._id, status: 'active' }).lean();
    expect(m2.length).toBe(2);
    expect(m2.every((m) => m.lastChangeType === 'NEW')).toBe(true);
    const anaM = await FlightSearchMatchModel.find({ ruleOwnerId: ana._id, status: 'active' }).lean();
    expect(anaM.every((m) => m.lastChangeType === 'PRICE_DOWN' || m.lastChangeType === 'NEW')).toBe(true);
  });
});
