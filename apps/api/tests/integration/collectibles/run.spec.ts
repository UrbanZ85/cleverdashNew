import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { registerCollectiblesScannerType } from '../../../src/modules/collectibles-scanner/index.js';
import { ScannerNotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { resetScannerTypesForTests } from '../../../src/platform/scanner/registry.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { requestManualRun } from '../../../src/platform/scanner/services/scheduler.service.js';
import type { CollectiblesResultData } from '../../../src/modules/collectibles-scanner/domain/types.js';
import { seedDefinition, seedUser } from '../scanner/_helpers.js';

// 019 (US1 do US5): zbirateljski skener od konca do konca nad testnim virom z izmišljenimi podatki
// (sources/fake.ts): filtri po kategorijah, prepoznava različic, vrednotenje z ločenimi vrstami cen,
// priložnost, zgodovina in dogodki čez štiri zagone.

const ENV = { COLLECTIBLES_FAKE_SOURCE_ENABLED: 'true', EBAY_MARKETPLACES: 'EBAY_DE,EBAY_IT' };

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(() => {
  setTestEnv(ENV);
  resetScannerTypesForTests();
  registerCollectiblesScannerType();
});
afterEach(clearTestDb);

const ACTOR = new Types.ObjectId().toString();
const env = () => loadEnv();
const logger = () => getLogger(loadEnv());
const T0 = new Date('2026-10-21T10:00:00Z');
const at = (n: number) => new Date(T0.getTime() + n * 3_600_000);

const CARDS = { category: 'trading-cards', keywords: 'Charizard', maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinDiscountPct: 20 };
const RETRO = { category: 'retro-gaming', retro: { platform: 'gb' }, maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinProfit: 1 };

async function run(definitionId: Types.ObjectId, ownerId: Types.ObjectId, now: Date) {
  const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'collectibles', definitionId: String(definitionId), ownerId: String(ownerId) }, ACTOR, now);
  await executeRun(runId, env(), logger(), now, { processOutbox: false, typeOptions: { noPacing: true } });
  return (await ScannerRunModel.findById(runId).lean())!;
}

const counters = (r: { counters: unknown }) => r.counters as unknown as Record<string, number>;

function collectibles(userId: Types.ObjectId, config: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return seedDefinition(userId, 'collectibles', { name: 'Zbirateljski test', config, ...overrides });
}

type Row = { title: string; externalId: string; price: { amount: number } | null; availability: string; lastChangeType: string; data: CollectiblesResultData };
async function results(definitionId: Types.ObjectId) {
  const rows = await ScannerResultModel.find({ definitionId }).lean<Row[]>();
  return new Map(rows.map((r) => [r.externalId, r]));
}

async function notificationReasons(runId: unknown): Promise<string[][]> {
  const n = await ScannerNotificationModel.findOne({ runId }).lean<{ items: Array<{ payload: { reasons: string[] } }> } | null>();
  return n ? n.items.map((i) => i.payload.reasons) : [];
}

describe('kartice — prvi zagon', () => {
  it('prepozna različice, loči vrste cen in ne izračuna dobička brez preverjenih prodaj', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, CARDS);
    const r = await run(def._id, ana._id, at(0));
    expect(r.status).toBe('succeeded');
    expect(counters(r)).toMatchObject({ listings: 10, new: 10, identified: 8, needsReview: 1, withProfit: 0 });
    const all = await results(def._id);

    // Neocenjena moderna kartica: katalogna ocena, popust označen kot ocena, dobiček neznan.
    const raw = all.get('C2')!.data;
    expect(raw.identification).toMatchObject({ kind: 'CARD', confidence: 'high', needsReview: false, variantKey: 'card|sv3-125|en|standard|holo|raw' });
    expect(raw.collectible).toMatchObject({ category: 'trading-cards', name: 'Charizard ex', catalogId: 'sv3-125', language: 'en', edition: 'standard', condition: 'UNKNOWN' });
    expect(raw.valuation).toMatchObject({ primary: 'estimate', confidence: 'low', comparable: true, sold: null });
    expect(raw.valuation?.estimate).toMatchObject({ value: 12, basis: 'estimate', currency: 'EUR' });
    expect(raw.valuation?.asking).toMatchObject({ median: 11, min: 10, count: 3 }); // zahtevane cene ločeno od ocene
    expect(raw.opportunity).toMatchObject({ discountPct: 25, discountBasis: 'estimate', profit: null, roi: null, score: null, profitBasis: null });
    // Stanje oglasa ni znano (eBay ga za karte ne pove nedvoumno) in preverjenih prodaj ni: dva razloga, ne en.
    expect(raw.opportunity.missing).toEqual(['condition', 'sold-prices']);

    // PSA 9 in PSA 10: druga različica, brez ocene (katalog ima cene samo za neocenjene), brez dobička.
    const psa9 = all.get('C3')!.data;
    const psa10 = all.get('C4')!.data;
    expect(psa9.identification.variantKey).toBe('card|sv3-125|en|standard|holo|PSA9');
    expect(psa10.identification.variantKey).toBe('card|sv3-125|en|standard|holo|PSA10');
    expect(psa9.collectible).toMatchObject({ gradingCompany: 'PSA', grade: '9' });
    for (const d of [psa9, psa10]) {
      expect(d.valuation).toMatchObject({ primary: null, confidence: 'insufficient', estimate: null });
      expect(d.opportunity).toMatchObject({ discountPct: null, profit: null });
    }

    // Base Set: kartica obstaja kot prva izdaja, zato katalogne ocene ni (card-level cena mešajo izdaje).
    const base = all.get('C1')!.data;
    expect(base.identification).toMatchObject({ confidence: 'high', variantKey: 'card|base1-4|en|unlimited|holo|raw' });
    expect(base.valuation).toMatchObject({ primary: null, confidence: 'insufficient' });
    expect(base.valuation?.note).toContain('izdaj');

    // Japonska: ni v angleškem katalogu → ročni pregled, brez ključa in brez vrednosti.
    const ja = all.get('C5')!.data;
    expect(ja.identification).toMatchObject({ kind: 'UNIDENTIFIED', needsReview: true, variantKey: null });
    expect(ja.valuation).toMatchObject({ primary: null, confidence: 'insufficient' });

    // Proxy: svoja vrsta, brez ocene.
    expect(all.get('C6')!.data.identification).toMatchObject({ kind: 'PROXY', variantKey: null });
    expect(all.get('C6')!.data.opportunity.discountPct).toBeNull();
  });

  it('dražba: cena je zadnja ponudba (ne končna), konec in število ponudb sta shranjena', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, CARDS);
    await run(def._id, ana._id, at(0));
    const row = (await ScannerResultModel.findOne({ definitionId: def._id, externalId: 'C7' }).lean<Row & { url: string | null; source: string }>())!;
    expect(row.price?.amount).toBe(6);
    expect(row.data.listing).toMatchObject({ listingType: 'AUCTION', bidCount: 2, shippingKnown: true, endsAt: at(3).toISOString() });
    expect(row.source).toBe('fake');
    expect(row.url).toBe('https://www.ebay.de/itm/C7');
  });
});

describe('retro — prvi zagon', () => {
  it('loose ≠ CIB, PAL ≠ NTSC; vrednost s preverjenimi prodajami da dobiček z vsemi postavkami', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, RETRO);
    const r = await run(def._id, ana._id, at(0));
    expect(r.status).toBe('succeeded');
    // R5 je Game Boy Color: druga platforma, filter "gb" ga izloči.
    expect(counters(r)).toMatchObject({ listings: 6, identified: 3, withProfit: 3 }); // dobiček je znan pri treh (dve izgubi, en dobiček)
    const all = await results(def._id);
    expect(all.has('R5')).toBe(false);

    const loosePal = all.get('R1')!.data;
    const cibPal = all.get('R2')!.data;
    const looseNtsc = all.get('R3')!.data;
    expect(loosePal.identification.variantKey).toBe('retro|gb|land-mario-super|PAL|loose|-');
    expect(cibPal.identification.variantKey).toBe('retro|gb|land-mario-super|PAL|cib|-');
    expect(looseNtsc.identification.variantKey).toBe('retro|gb|land-mario-super|NTSC-U|loose|-');
    expect(new Set([loosePal, cibPal, looseNtsc].map((d) => d.identification.variantKey)).size).toBe(3);
    expect(loosePal.identification).toMatchObject({ kind: 'GAME', confidence: 'high', catalog: { id: 'rp1' } });
    expect(looseNtsc.identification.catalog?.id).toBe('rp2');

    // Vsaka različica dobi SVOJO ceno iz cenika (loose PAL 14, CIB PAL 70, loose NTSC 9).
    expect(loosePal.valuation?.sold).toMatchObject({ average: 14, count: 8, periodMonths: 6 });
    expect(cibPal.valuation?.sold).toMatchObject({ average: 70 });
    expect(looseNtsc.valuation?.sold).toMatchObject({ average: 9 });
    expect(cibPal.valuation).toMatchObject({ primary: 'sold', confidence: 'medium', estimate: null });

    // CIB PAL: cena 40, poštnina 3 → strošek 43; konservativno 63; provizije 8,19; rezerva 6 % (CIB brez dodatka).
    expect(cibPal.opportunity).toMatchObject({ acquisitionCost: 43, conservativeValue: 63, sellingFees: 8.19, riskReserve: 2.58, profit: 9.23, profitBasis: 'sold', discountBasis: 'sold', missing: [] });
    // Loose ima višjo rezervo (reprodukcije so pogoste pri kartušah brez škatle): 6 % + 5 %.
    expect(loosePal.opportunity.riskReserve).toBe(1.65);
    expect(loosePal.opportunity.profit).toBeLessThan(0);

    // Reprodukcija in okvarjena konzola: brez ključa in brez ocene.
    expect(all.get('R4')!.data.identification).toMatchObject({ kind: 'REPRODUCTION', variantKey: null });
    const broken = all.get('R6')!.data;
    expect(broken.identification).toMatchObject({ kind: 'CONSOLE', variantKey: null });
    expect(broken.collectible.retro).toMatchObject({ working: 'not-working', platform: 'gb' });
    expect(broken.collectible.condition).toBe('FOR_PARTS');
    expect(broken.opportunity.profit).toBeNull();
  });
});

describe('neodvisna iskanja', () => {
  it('dve iskanji različnih kategorij imata ločene rezultate, zgodovino in dopise', async () => {
    const ana = await seedUser('ana');
    const cards = await collectibles(ana._id, CARDS, { name: 'Kartice' });
    const retro = await collectibles(ana._id, RETRO, { name: 'Retro' });
    await run(cards._id, ana._id, at(0));
    await run(retro._id, ana._id, at(0));
    expect((await results(cards._id)).size).toBe(10);
    expect((await results(retro._id)).size).toBe(5);
    expect([...(await results(cards._id)).keys()].every((k) => k.startsWith('C'))).toBe(true);
    expect([...(await results(retro._id)).keys()].every((k) => k.startsWith('R'))).toBe(true);
  });
});

describe('filtri iskanja', () => {
  const cards = (extra: Record<string, unknown>) => ({ ...CARDS, notifyMinDiscountPct: undefined, ...extra });

  it('izključena beseda', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, cards({ excludedKeywords: ['proxy'] }));
    await run(def._id, ana._id, at(0));
    expect((await results(def._id)).has('C6')).toBe(false);
  });

  it('filtri kartic: samo PSA 9', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, cards({ cards: { gradeStatus: 'graded', gradingCompany: 'PSA', grade: '9' } }));
    await run(def._id, ana._id, at(0));
    expect([...(await results(def._id)).keys()]).toEqual(['C3']);
  });

  it('filtri kartic: samo neocenjene z znanim jezikom', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, cards({ cards: { gradeStatus: 'raw', language: 'en' } }));
    await run(def._id, ana._id, at(0));
    expect([...(await results(def._id)).keys()].sort()).toEqual(['C1', 'C2', 'C2a', 'C2c', 'C2d', 'C7']);
  });

  it('filter japonščine: oglas z neprepoznano kartico ustreza jeziku, a brez ključa', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, cards({ cards: { language: 'ja' } }));
    await run(def._id, ana._id, at(0));
    const all = await results(def._id);
    expect([...all.keys()]).toEqual(['C5']);
    expect(all.get('C5')!.data.identification.variantKey).toBeNull();
  });

  it('najvišja cena, vrsta ponudbe, minimalni popust', async () => {
    const ana = await seedUser('ana');
    const cheap = await collectibles(ana._id, cards({ maxPrice: 10 }));
    await run(cheap._id, ana._id, at(0));
    expect([...(await results(cheap._id)).keys()].sort()).toEqual(['C2', 'C2d', 'C6', 'C7']);
    const auctions = await collectibles(ana._id, cards({ listingTypes: ['AUCTION'] }), { name: 'dražbe' });
    await run(auctions._id, ana._id, at(0));
    expect([...(await results(auctions._id)).keys()]).toEqual(['C7']);
    const discount = await collectibles(ana._id, cards({ minDiscountPct: 40 }), { name: 'popust' });
    await run(discount._id, ana._id, at(0));
    expect([...(await results(discount._id)).keys()]).toEqual(['C7']); // 6 € proti oceni 12 € = 50 %
  });

  it('minimalni dobiček izloči oglase brez znanega dobička', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, cards({ minProfit: 0 }));
    const r = await run(def._id, ana._id, at(0));
    expect((await results(def._id)).size).toBe(0);
    expect(r.status).toBe('succeeded');
  });

  it('filter retro: samo CIB in regija PAL', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, { ...RETRO, retro: { platform: 'gb', completeness: 'cib', region: 'PAL' } });
    await run(def._id, ana._id, at(0));
    expect([...(await results(def._id)).keys()]).toEqual(['R2']);
  });
});

describe('štirje zagoni: zgodovina in obvestila', () => {
  it('nov oglas, sprememba ponudbe, pocenitev in umik; po en dopis na dogodek, brez dvojnikov', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, CARDS);

    // 1: nov — C2 (25 % do ocene) in dražba C7 (50 %, izteka čez 3 h). Ostali pod pragom popusta ali brez popusta.
    const r1 = await run(def._id, ana._id, at(0));
    expect(counters(r1)).toMatchObject({ events: 2 });
    const reasons1 = (await notificationReasons(r1._id)).map((r) => r.join('+')).sort();
    expect(reasons1).toEqual(['new', 'new+auction-ending']);

    // 2: dražba 6 → 8 €: sprememba ponudbe, ne končna cena; dražba se ne obvesti znova o izteku.
    const r2 = await run(def._id, ana._id, at(1));
    expect(counters(r2)).toMatchObject({ events: 1 });
    expect(await notificationReasons(r2._id)).toEqual([['price-up']]);
    expect((await results(def._id)).get('C7')!.price?.amount).toBe(8);
    expect((await results(def._id)).get('C7')!.lastChangeType).toBe('PRICE_UP');

    // 3: pocenitev C2 9 → 7: en dopis.
    const r3 = await run(def._id, ana._id, at(2));
    expect(await notificationReasons(r3._id)).toEqual([['price-down']]);
    expect((await results(def._id)).get('C2')!.lastChangeType).toBe('PRICE_DOWN');

    // 4: oglas C2a izgine ob uspešnem odgovoru vira: "ni več na voljo" (ne "prodano"), brez dopisa.
    const r4 = await run(def._id, ana._id, at(3));
    expect(counters(r4)).toMatchObject({ events: 0, unavailable: 1 });
    expect((await results(def._id)).get('C2a')).toMatchObject({ availability: 'unavailable', lastChangeType: 'UNAVAILABLE' });
    expect(await ScannerNotificationModel.countDocuments({ runId: r4._id })).toBe(0);
  });

  it('retro: prag dobička obvesti samo oglas z izračunanim dobičkom', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, RETRO);
    const r1 = await run(def._id, ana._id, at(0));
    expect(counters(r1)).toMatchObject({ events: 1 });
    expect(await notificationReasons(r1._id)).toEqual([['new']]);
    const r2 = await run(def._id, ana._id, at(1));
    expect(counters(r2)).toMatchObject({ events: 0 });
  });

  it('izklopljena obvestila: rezultati se shranijo, dopisov ni', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, CARDS, { notifications: { enabled: false, mode: 'all-changes' } });
    const r = await run(def._id, ana._id, at(0));
    expect(counters(r)).toMatchObject({ events: 0 });
    expect((await results(def._id)).size).toBe(10);
    expect(await ScannerNotificationModel.countDocuments({ runId: r._id })).toBe(0);
  });
});

describe('napake in neveljavna nastavitev', () => {
  it('neznana kategorija v shranjeni nastavitvi: zagon se ne začne, jasna napaka', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, { category: 'watches', keywords: 'seiko' });
    const r = await run(def._id, ana._id, at(0));
    expect(r.status).toBe('failed');
    expect(JSON.stringify(r.runErrors)).toContain('collectibles:invalid-config');
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(0);
  });

  it('brez vira oglasov: neuspešen zagon z navodilom, obstoječi rezultati ostanejo', async () => {
    const ana = await seedUser('ana');
    const def = await collectibles(ana._id, CARDS);
    await run(def._id, ana._id, at(0));
    setTestEnv({ COLLECTIBLES_FAKE_SOURCE_ENABLED: 'false', EBAY_CLIENT_ID: '', EBAY_CLIENT_SECRET: '' });
    const r = await run(def._id, ana._id, at(1));
    expect(r.status).toBe('failed');
    expect(JSON.stringify(r.runErrors)).toContain('collectibles:no-listing-source');
    const all = await results(def._id);
    expect(all.size).toBe(10);
    expect([...all.values()].every((x) => x.availability === 'available')).toBe(true);
  });
});
