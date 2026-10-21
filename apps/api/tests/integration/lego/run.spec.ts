import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { registerLegoScannerType } from '../../../src/modules/lego-scanner/index.js';
import { ScannerNotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { resetScannerTypesForTests } from '../../../src/platform/scanner/registry.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { requestManualRun } from '../../../src/platform/scanner/services/scheduler.service.js';
import type { LegoResultData } from '../../../src/modules/lego-scanner/domain/types.js';
import { seedDefinition, seedUser } from '../scanner/_helpers.js';

// 018 (US1, US2, US4, US5): LEGO skener od konca do konca nad testnim virom z izmišljenimi podatki
// (sources/fake.ts): filtri, identifikacija, vrednotenje, priložnost, zgodovina in dogodki čez štiri zagone.

const ENV = { LEGO_FAKE_SOURCE_ENABLED: 'true', LEGO_CONSERVATIVE_DISCOUNT_PCT: '10', LEGO_SELLING_FEE_PCT: '12', LEGO_RISK_RESERVE_PCT: '5' };

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(() => {
  setTestEnv(ENV);
  resetScannerTypesForTests();
  registerLegoScannerType();
});
afterEach(clearTestDb);

const ACTOR = new Types.ObjectId().toString();
const env = () => loadEnv();
const logger = () => getLogger(loadEnv());
const T0 = new Date('2026-10-21T10:00:00Z');
const at = (n: number) => new Date(T0.getTime() + n * 3_600_000);

const BASE_CONFIG = { maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinProfit: 30 };

async function run(definitionId: Types.ObjectId, ownerId: Types.ObjectId, now: Date) {
  const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'lego', definitionId: String(definitionId), ownerId: String(ownerId) }, ACTOR, now);
  await executeRun(runId, env(), logger(), now, { processOutbox: false, typeOptions: { noPacing: true } });
  return (await ScannerRunModel.findById(runId).lean())!;
}

const counters = (r: { counters: unknown }) => r.counters as unknown as Record<string, number>;

async function lego(userId: Types.ObjectId, config: Record<string, unknown> = BASE_CONFIG, overrides: Record<string, unknown> = {}) {
  return seedDefinition(userId, 'lego', { name: 'LEGO test', config, ...overrides });
}

async function results(definitionId: Types.ObjectId) {
  const rows = await ScannerResultModel.find({ definitionId }).sort({ title: 1 }).lean<Array<{ title: string; price: { amount: number } | null; availability: string; lastChangeType: string; data: LegoResultData }>>();
  return new Map(rows.map((r) => [r.title, r]));
}

const find = (map: Awaited<ReturnType<typeof results>>, part: string) => [...map.values()].find((r) => r.title.includes(part))!;

describe('prvi zagon: identifikacija, vrednotenje, priložnost', () => {
  it('shrani vse oglase z vrsto in zaupanjem; samo zanesljivo prepoznan set z znano vrednostjo dobi dobiček', async () => {
    const ana = await seedUser('ana');
    const def = await lego(ana._id);
    const r = await run(def._id, ana._id, at(0));
    expect(r.status).toBe('succeeded');
    expect(counters(r)).toMatchObject({ listings: 9, new: 9, identified: 5, notSets: 4, needsReview: 1 });
    const all = await results(def._id);
    expect(all.size).toBe(9);

    const falcon = find(all, '75192 Millennium Falcon NEU').data;
    expect(falcon.identification).toMatchObject({ kind: 'SET', confidence: 'high', needsReview: false });
    expect(falcon.lego).toMatchObject({ setNumber: '75192-1', setName: 'Millennium Falcon', theme: 'Star Wars', subtheme: 'Ultimate Collector Series', releaseYear: 2017, pieceCount: 7541, condition: 'NEW_SEALED', listingType: 'FIXED_PRICE', sellerCountry: 'DE', shippingCost: 20 });
    expect(falcon.valuation).toMatchObject({ basis: 'sold', newOrUsed: 'N', average: 550, salesCount: 14, confidence: 'high', comparable: true });
    expect(falcon.valuation?.active).toMatchObject({ count: 3 }); // aktivne ponudbe ločeno od prodaj
    expect(falcon.opportunity).toMatchObject({ illustrative: true, acquisitionCost: 370, conservativeValue: 495, sellingFees: 59.4, riskReserve: 18.5, profit: 47.1, missing: [] });
    expect(falcon.opportunity.score).toBeGreaterThan(0);

    // Rabljen z neznano kompletnostjo: stanje UNKNOWN, brez vrednosti kot za kompleten set, brez dobička.
    const used = find(all, '75192 Millennium Falcon gebraucht').data;
    expect(used.lego.condition).toBe('UNKNOWN');
    expect(used.lego.completenessVerified).toBeUndefined();
    expect(used.valuation).toBeNull();
    expect(used.opportunity.profit).toBeNull();
    expect(used.opportunity.missing).toContain('condition');

    // Kompleten rabljen Technic: vrednoten kot rabljen, ne kot nov.
    const lambo = find(all, 'komplett gebraucht').data;
    expect(lambo.lego).toMatchObject({ condition: 'USED_COMPLETE', completenessVerified: true });
    expect(lambo.valuation).toMatchObject({ newOrUsed: 'U', average: 280 });

    // Paket, deli, prazna škatla: svoja vrsta, brez identitete in brez dobička.
    for (const [part, kind] of [['Konvolut 10179', 'BUNDLE'], ['Teile Konvolut', 'PARTS'], ['Leere Box', 'EMPTY_BOX']] as const) {
      const d = find(all, part).data;
      expect(d.identification).toMatchObject({ kind, confidence: 'none' });
      expect(d.identification.catalog).toBeNull();
      expect(d.valuation).toBeNull();
      expect(d.opportunity.profit).toBeNull();
    }

    // Dvoumno ime brez številke: ročni pregled, brez dobička.
    const ambiguous = find(all, 'Millennium Falcon neu').data;
    expect(ambiguous.identification).toMatchObject({ kind: 'UNIDENTIFIED', needsReview: true });
    expect(ambiguous.opportunity.profit).toBeNull();
  });

  it('dražba: trenutna ponudba je cena (ne končna), čas izteka in število ponudb sta shranjena', async () => {
    const ana = await seedUser('ana');
    const def = await lego(ana._id);
    await run(def._id, ana._id, at(0));
    const row = (await ScannerResultModel.findOne({ definitionId: def._id, title: /Auktion|75257/ }).lean<{ price: { amount: number }; data: LegoResultData; url: string | null; source: string; externalId: string }>())!;
    expect(row.price.amount).toBe(60);
    expect(row.data.listing).toMatchObject({ listingType: 'AUCTION', bidCount: 2, shippingKnown: true });
    expect(row.data.listing.endsAt).toBe(at(3).toISOString());
    expect(row.source).toBe('fake');
    expect(row.externalId).toBe('F7');
    expect(row.url).toBe('https://www.ebay.de/itm/F7');
  });
});

describe('filtri iskanja', () => {
  let userSeq = 0;
  const titlesFor = async (config: Record<string, unknown>) => {
    const ana = await seedUser(`u${(userSeq += 1)}`);
    const def = await lego(ana._id, { marketplaces: ['EBAY_DE'], ...config });
    await run(def._id, ana._id, at(0));
    return [...(await results(def._id)).values()].map((r) => r.title).sort();
  };

  it('številka seta: set, rabljen, paket in prazna škatla z isto številko (označeni), ne drugi', async () => {
    const t = await titlesFor({ setNumber: '75192' });
    expect(t).toHaveLength(4);
    expect(t.every((x) => /75192/.test(x))).toBe(true);
  });

  it('tema zahteva prepoznan set: Technic → samo Technic oglasa; neprepoznani oglasi ne ustrezajo', async () => {
    expect((await titlesFor({ theme: 'Technic' })).sort()).toEqual(['LEGO Technic 42115 Lamborghini Sián NEU OVP', 'LEGO Technic 42115 Lamborghini Sián komplett gebraucht']);
    // Iskalni niz vsebuje temo ("LEGO Star Wars"): oglas brez te besede v naslovu vir ne vrne; podtemo uveljavi katalog.
    expect(await titlesFor({ theme: 'Star Wars', subtheme: 'Ultimate Collector Series' })).toEqual(['LEGO Star Wars 75192 Millennium Falcon NEU OVP']);
  });

  it('letnik, stanje, vrsta ponudbe, poštnina', async () => {
    expect(await titlesFor({ minYear: 2019 })).toHaveLength(3); // 75257 (2019) in dva Technica (2020)
    expect(await titlesFor({ maxYear: 2010 })).toEqual([]); // 10179 je v paketu, ki ni set
    expect(await titlesFor({ conditions: ['USED_COMPLETE'] })).toEqual(['LEGO Technic 42115 Lamborghini Sián komplett gebraucht']);
    expect(await titlesFor({ listingTypes: ['AUCTION'] })).toHaveLength(1);
    expect(await titlesFor({ maxShipping: 10 })).toHaveLength(3); // deli (6 €), prazna škatla (9 €), Technic (0 €)
  });

  it('najmanjši dobiček in popust: oglas z neznanim dobičkom/popustom NE ustreza', async () => {
    const byProfit = await titlesFor({ minProfit: 30 });
    expect(byProfit).toHaveLength(2); // 75192 nov in dražba
    const byDiscount = await titlesFor({ minDiscountPct: 20 });
    expect(byDiscount).toHaveLength(2);
    expect(byDiscount.every((t) => /75192|75257/.test(t))).toBe(true);
  });

  it('cena: najvišja in najnižja', async () => {
    expect((await titlesFor({ maxPrice: 100 })).length).toBe(3); // dražba 60, deli 25, prazna škatla 30
    expect((await titlesFor({ minPrice: 200, maxPrice: 320 })).length).toBe(3); // rabljen 75192 (300), Technic nov (300), Technic rabljen (250)
  });
});

describe('spremembe in dogodki čez štiri zagone', () => {
  it('NOVO → sprememba ponudbe → pocenitev → umik (ni "prodano"); dogodki po pravilih', async () => {
    const ana = await seedUser('ana');
    const def = await lego(ana._id);
    const events = async (runId: unknown) => {
      const n = await ScannerNotificationModel.findOne({ runId }).lean<{ items: Array<{ payload: { reasons: string[]; title: string }; changeType: string }> } | null>();
      return n?.items.map((i) => ({ title: i.payload.title.slice(0, 22), type: i.changeType, reasons: i.payload.reasons })) ?? [];
    };

    const r1 = await run(def._id, ana._id, at(0));
    expect(await events(r1._id)).toEqual(
      expect.arrayContaining([
        { title: 'LEGO Star Wars 75192 M', type: 'NEW', reasons: ['new'] },
        { title: 'LEGO Star Wars 75257 M', type: 'NEW', reasons: ['new', 'auction-ending'] },
      ]),
    );
    expect(counters(r1).events).toBe(2);

    const r2 = await run(def._id, ana._id, at(1));
    expect(counters(r2)).toMatchObject({ new: 0, changed: 1 });
    expect(await events(r2._id)).toEqual([{ title: 'LEGO Star Wars 75257 M', type: 'PRICE_UP', reasons: ['price-up'] }]);

    const r3 = await run(def._id, ana._id, at(2));
    expect(await events(r3._id)).toEqual([{ title: 'LEGO Star Wars 75192 M', type: 'PRICE_DOWN', reasons: ['price-down'] }]);
    const falcon = find(await results(def._id), '75192 Millennium Falcon NEU');
    expect(falcon.price?.amount).toBe(330);
    expect(falcon.lastChangeType).toBe('PRICE_DOWN');
    expect(falcon.data.alerts.profitNotified).toBe(true);

    const r4 = await run(def._id, ana._id, at(3));
    expect(counters(r4)).toMatchObject({ unavailable: 1, events: 0 });
    const gone = find(await results(def._id), 'Technic 42115 Lamborghini Sián NEU');
    expect(gone.availability).toBe('unavailable');
    expect(gone.lastChangeType).toBe('UNAVAILABLE');
    expect(await events(r4._id)).toEqual([]);
  });

  it('brez praga obvestil obvešča o vsakem novem oglasu; z izklopljenimi obvestili skenerja nikoli', async () => {
    const ana = await seedUser('ana');
    const noThreshold = await lego(ana._id, { maxPrice: 1000, marketplaces: ['EBAY_DE'] });
    const r = await run(noThreshold._id, ana._id, at(0));
    expect(counters(r).events).toBe(9);

    const bor = await seedUser('bor');
    const muted = await lego(bor._id, BASE_CONFIG, { notifications: { enabled: false, mode: 'all-changes' } });
    const r2 = await run(muted._id, bor._id, at(0));
    expect(counters(r2).events).toBe(0);
    expect(await ScannerNotificationModel.countDocuments({ runId: r2._id })).toBe(0);
    expect(await ScannerResultModel.countDocuments({ definitionId: muted._id })).toBe(9);
  });

  it('dva skenerja sta neodvisna: svoji rezultati, zgodovina in dopisi; lastnik je pogoj branja', async () => {
    const ana = await seedUser('ana');
    const bor = await seedUser('bor');
    const a = await lego(ana._id, { ...BASE_CONFIG, theme: 'Technic' });
    const b = await lego(bor._id, { ...BASE_CONFIG, listingTypes: ['AUCTION'] });
    await run(a._id, ana._id, at(0));
    await run(b._id, bor._id, at(0));
    expect(await ScannerResultModel.countDocuments({ definitionId: a._id })).toBe(2);
    expect(await ScannerResultModel.countDocuments({ definitionId: b._id })).toBe(1);
    expect(await ScannerResultModel.countDocuments({ definitionId: a._id, userId: bor._id })).toBe(0);
    const notifications = await ScannerNotificationModel.find().lean<Array<{ recipientUserId: Types.ObjectId }>>();
    expect(new Set(notifications.map((n) => String(n.recipientUserId)))).toEqual(new Set([String(bor._id)]));
  });
});

describe('viri niso vklopljeni', () => {
  it('brez ključev in brez testnega vira: zagon je failed z razlogom lego:no-listing-source, brez rezultatov', async () => {
    setTestEnv({ LEGO_FAKE_SOURCE_ENABLED: 'false', EBAY_CLIENT_ID: '', EBAY_CLIENT_SECRET: '' });
    const ana = await seedUser('ana');
    const def = await lego(ana._id);
    const r = await run(def._id, ana._id, at(0));
    expect(r.status).toBe('failed');
    expect(r.runErrors.map((e) => e.code)).toContain('lego:no-listing-source');
    expect(r.runErrors[0]!.message).toContain('EBAY_CLIENT_ID');
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(0);
  });
});
