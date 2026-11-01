import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { ExternalCacheModel } from '../../../src/platform/cache/model.js';
import { resetEbayTokenForTests } from '../../../src/platform/ebay/client.js';
import { ExternalSourceUsageModel } from '../../../src/platform/external-sources/models/external-source-usage.model.js';
import { usageDay } from '../../../src/platform/external-sources/usage.js';
import { registerCollectiblesScannerType } from '../../../src/modules/collectibles-scanner/index.js';
import type { CollectiblesResultData } from '../../../src/modules/collectibles-scanner/domain/types.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { resetScannerTypesForTests } from '../../../src/platform/scanner/registry.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { requestManualRun } from '../../../src/platform/scanner/services/scheduler.service.js';
import { seedDefinition, seedUser } from '../scanner/_helpers.js';

// 019 (FR-007 do FR-010, SC-008): pravi viri z MOCK odgovori — eBay (skupni odjemalec), TCGdex in PriceCharting
// prek `fetch`. Preveri zahteve (glave, filtri), predpomnilnik, skupno dnevno mejo eBay, izolacijo izpadov in da
// skrivnosti nikoli ne pristanejo v predpomnilniku, dnevniku ali rezultatih.

const KEYS = {
  COLLECTIBLES_FAKE_SOURCE_ENABLED: 'false',
  EBAY_CLIENT_ID: 'EB-ID',
  EBAY_CLIENT_SECRET: 'EB-CLIENT-SECRET',
  EBAY_MARKETPLACES: 'EBAY_DE,EBAY_IT',
  PRICECHARTING_API_KEY: '',
  COLLECTIBLES_EBAY_DAILY_LIMIT: '4000',
};
const SECRETS = ['EB-CLIENT-SECRET', 'tok-SECRET-1', 'PC-KEY-SECRET'];

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);

interface Call {
  url: string;
  headers: Record<string, string>;
}
let calls: Call[] = [];
let responses: Record<string, (url: string) => { status: number; body: unknown }> = {};
const realFetch = globalThis.fetch;

const listing = (itemId: string, title: string, amount: number, extra: Record<string, unknown> = {}) => ({
  itemId,
  title,
  price: { value: String(amount), currency: 'EUR' },
  buyingOptions: ['FIXED_PRICE'],
  itemWebUrl: `https://www.ebay.de/itm/${itemId}`,
  itemLocation: { country: 'DE' },
  shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '3.00', currency: 'EUR' } }],
  image: { imageUrl: `https://i.ebayimg.com/${itemId}.jpg` },
  ...extra,
});
const CARD_BODY = { total: 1, itemSummaries: [listing('v1|1|0', 'Pokemon Charizard ex 125/197 Obsidian Flames English', 9)] };
const RETRO_BODY = { total: 1, itemSummaries: [listing('v1|9|0', 'Super Mario Land Game Boy PAL CIB complete', 40, { conditionId: '3000' })] };
const TCG_LIST = [{ id: 'sv3-125', localId: '125', name: 'Charizard ex', image: 'https://assets.tcgdex.net/en/sv/sv3/125' }];
const TCG_DETAIL = {
  id: 'sv3-125',
  localId: '125',
  name: 'Charizard ex',
  rarity: 'Double Rare',
  image: 'https://assets.tcgdex.net/en/sv/sv3/125',
  set: { id: 'sv3', name: 'Obsidian Flames', cardCount: { official: 197, total: 230 } },
  variants: { firstEdition: false, holo: true, normal: false, reverse: false },
  pricing: { cardmarket: { updated: '2026-10-21T13:00:00.000Z', unit: 'EUR', avg: 13.5, low: 8, trend: 12, avg7: 12.4, avg30: 13 }, tcgplayer: null },
};
const PC_SEARCH = { status: 'success', products: [{ id: '777', 'product-name': 'Super Mario Land', 'console-name': 'PAL GameBoy' }] };
const PC_PRODUCT = { status: 'success', id: '777', 'product-name': 'Super Mario Land', 'console-name': 'PAL GameBoy', 'loose-price': 1450, 'cib-price': 7000, 'new-price': 20000 };

function defaultResponses() {
  responses = {
    token: () => ({ status: 200, body: { access_token: 'tok-SECRET-1', expires_in: 7200 } }),
    ebay: (url) => ({ status: 200, body: url.includes('Game') ? RETRO_BODY : CARD_BODY }),
    tcgList: () => ({ status: 200, body: TCG_LIST }),
    tcgDetail: () => ({ status: 200, body: TCG_DETAIL }),
    pcSearch: () => ({ status: 200, body: PC_SEARCH }),
    pcProduct: () => ({ status: 200, body: PC_PRODUCT }),
  };
}

function route(url: string): keyof typeof responses | null {
  if (url.includes('/identity/v1/oauth2/token')) return 'token';
  if (url.includes('/buy/browse/v1/item_summary/search')) return 'ebay';
  if (/api\.tcgdex\.net\/v2\/[a-z]{2}\/cards\?/.test(url)) return 'tcgList';
  if (/api\.tcgdex\.net\/v2\/[a-z]{2}\/cards\/[^?]+$/.test(url)) return 'tcgDetail';
  if (url.includes('/api/products?')) return 'pcSearch';
  if (url.includes('/api/product?')) return 'pcProduct';
  return null;
}

beforeEach(() => {
  setTestEnv(KEYS);
  resetScannerTypesForTests();
  registerCollectiblesScannerType();
  resetEbayTokenForTests();
  calls = [];
  defaultResponses();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('127.0.0.1')) return realFetch(input, init);
      const key = route(url);
      if (!key) throw new Error(`Nepričakovan fetch na ${url}`);
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      const r = responses[key]!(url);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await clearTestDb();
});

const ACTOR = new Types.ObjectId().toString();
const env = () => loadEnv();
const logger = () => getLogger(loadEnv());
const CARDS = { category: 'trading-cards', keywords: 'Charizard', marketplaces: ['EBAY_DE'], maxPrice: 100 };
const RETRO = { category: 'retro-gaming', retro: { platform: 'gb' }, marketplaces: ['EBAY_DE'], maxPrice: 100 };

async function run(definitionId: Types.ObjectId, ownerId: Types.ObjectId) {
  const now = new Date();
  const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'collectibles', definitionId: String(definitionId), ownerId: String(ownerId) }, ACTOR, now);
  await executeRun(runId, env(), logger(), now, { processOutbox: false, typeOptions: { noPacing: true } });
  return (await ScannerRunModel.findById(runId).lean())!;
}

async function setup(config: Record<string, unknown> = CARDS) {
  const ana = await seedUser('ana');
  const def = await seedDefinition(ana._id, 'collectibles', { name: 'Viri', config });
  return { ana, def };
}

const byRoute = (key: string) => calls.filter((c) => route(c.url) === key);
type Row = { source: string; externalId: string; price: { amount: number }; url: string; data: CollectiblesResultData };
const rows = (id: Types.ObjectId) => ScannerResultModel.find({ definitionId: id }).lean<Row[]>();

describe('kartice: eBay → TCGdex', () => {
  it('rezultat z ocenjeno vrednostjo; zahteve imajo prave glave in filtre', async () => {
    const { ana, def } = await setup();
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('succeeded');
    const [row] = await rows(def._id);
    expect(row).toMatchObject({ source: 'ebay:EBAY_DE', externalId: 'v1|1|0', price: { amount: 9 }, url: 'https://www.ebay.de/itm/v1|1|0' });
    expect(row!.data.identification).toMatchObject({ kind: 'CARD', confidence: 'high', variantKey: 'card|sv3-125|en|standard|holo|raw' });
    expect(row!.data.valuation).toMatchObject({ primary: 'estimate', confidence: 'low' });
    expect(row!.data.valuation?.estimate).toMatchObject({ value: 12, source: 'Cardmarket (TCGdex)', basis: 'estimate' });
    expect(row!.data.opportunity).toMatchObject({ discountPct: 25, discountBasis: 'estimate', profit: null });

    expect(byRoute('token')).toHaveLength(1);
    expect(byRoute('token')[0]!.headers['Authorization']).toBe(`Basic ${Buffer.from('EB-ID:EB-CLIENT-SECRET').toString('base64')}`);
    const search = byRoute('ebay')[0]!;
    expect(search.headers['Authorization']).toBe('Bearer tok-SECRET-1');
    expect(search.headers['X-EBAY-C-MARKETPLACE-ID']).toBe('EBAY_DE');
    const url = new URL(search.url);
    expect(url.searchParams.get('q')).toBe('pokemon Charizard');
    expect(url.searchParams.has('category_ids')).toBe(false); // ID-ji kategorij še niso potrjeni (research §7)
    expect(url.searchParams.get('filter')).toContain('deliveryCountry:SI');
    expect(url.searchParams.get('filter')).toContain('price:[..100]');

    const list = new URL(byRoute('tcgList')[0]!.url);
    expect(list.pathname).toBe('/v2/en/cards');
    expect(list.searchParams.get('name')).toBe('charizard');
    expect(list.searchParams.get('localId')).toBe('125');
    expect(byRoute('tcgDetail')[0]!.url).toBe('https://api.tcgdex.net/v2/en/cards/sv3-125');
  });

  it('skrivnosti nikoli v predpomnilniku, rezultatih, zagonu ali števcih', async () => {
    const { ana, def } = await setup();
    const r = await run(def._id, ana._id);
    const dump = JSON.stringify({ cache: await ExternalCacheModel.find().lean(), results: await rows(def._id), run: r, usage: await ExternalSourceUsageModel.find().lean() });
    for (const secret of SECRETS) expect(dump).not.toContain(secret);
    expect(await ExternalCacheModel.countDocuments()).toBeGreaterThanOrEqual(3);
  });

  it('dnevna poraba po viru; drugi zagon je v celoti iz predpomnilnika', async () => {
    const { ana, def } = await setup();
    await run(def._id, ana._id);
    expect(calls).toHaveLength(4); // žeton, oglasi, seznam, podrobnosti
    const usage = Object.fromEntries((await ExternalSourceUsageModel.find({ day: usageDay(new Date()) }).lean<Array<{ source: string; requests: number }>>()).map((u) => [u.source, u.requests]));
    expect(usage).toEqual({ ebay: 1, tcgdex: 2 });
    calls = [];
    const r2 = await run(def._id, ana._id);
    expect(r2.status).toBe('succeeded');
    expect(calls).toHaveLength(0);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(1);
  });
});

describe('izpadi virov', () => {
  it('katalog ne odgovori (500): zagon je delen, oglas ostane brez potrditve (ročni pregled, brez vrednosti)', async () => {
    responses.tcgList = () => ({ status: 500, body: {} });
    const { ana, def } = await setup();
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('partial');
    expect(JSON.stringify(r.runErrors)).toContain('collectibles:unreachable:tcgdex');
    const [row] = await rows(def._id);
    expect(row!.data.identification).toMatchObject({ needsReview: true, variantKey: null });
    expect(row!.data.valuation).toMatchObject({ primary: null, confidence: 'insufficient' });
    expect(row!.data.opportunity).toMatchObject({ profit: null, discountPct: null });
  });

  it('katalog vrne 429: nadaljnjih poizvedb ni, zagon je delen', async () => {
    responses.tcgList = () => ({ status: 429, body: {} });
    const { ana, def } = await setup({ ...CARDS, keywords: 'Charizard Obsidian' });
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('partial');
    expect(JSON.stringify(r.runErrors)).toContain('collectibles:rate-limited:tcgdex');
    expect(byRoute('tcgList').length).toBeLessThanOrEqual(1);
  });

  it('eBay ne odgovori: zagon neuspešen, obstoječi rezultati NISO označeni kot nedosegljivi', async () => {
    const { ana, def } = await setup();
    await run(def._id, ana._id);
    // Naslednji zagon: predpomnilnik oglasov je potekel (nov ključ iskanja), eBay vrne 503.
    responses.ebay = () => ({ status: 503, body: {} });
    await ExternalCacheModel.deleteMany({ key: /ebay/ });
    const r2 = await run(def._id, ana._id);
    expect(r2.status).toBe('failed');
    expect(JSON.stringify(r2.runErrors)).toContain('collectibles:unreachable:ebay');
    const [row] = await rows(def._id);
    expect(row).toBeDefined();
    expect((await ScannerResultModel.findOne({ definitionId: def._id }).lean<{ availability: string }>())!.availability).toBe('available');
  });

  it('eBay zavrne ključ (401): jasna koda', async () => {
    responses.token = () => ({ status: 401, body: {} });
    const { ana, def } = await setup();
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('failed');
    expect(JSON.stringify(r.runErrors)).toContain('collectibles:unauthorized:ebay');
  });

  it('skupna dnevna meja eBay: druga tržnica po doseženi meji; prva ostane', async () => {
    setTestEnv({ ...KEYS, COLLECTIBLES_EBAY_DAILY_LIMIT: '1' });
    const { ana, def } = await setup({ ...CARDS, marketplaces: ['EBAY_DE', 'EBAY_IT'] });
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('partial');
    expect(JSON.stringify(r.runErrors)).toContain('collectibles:daily-limit:ebay');
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(1);
  });

  it('brez ključev eBay: zagon pove, kaj manjka', async () => {
    setTestEnv({ ...KEYS, EBAY_CLIENT_ID: '', EBAY_CLIENT_SECRET: '' });
    const { ana, def } = await setup();
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('failed');
    expect(JSON.stringify(r.runErrors)).toContain('collectibles:no-listing-source');
    expect(calls).toHaveLength(0);
  });
});

describe('retro: PriceCharting je izbiren', () => {
  it('brez ključa: oglas se prepozna iz besedila, vrednosti ni ("premalo podatkov"), zagon uspe, PriceCharting ni klican', async () => {
    const { ana, def } = await setup(RETRO);
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('succeeded');
    expect(byRoute('pcSearch')).toHaveLength(0);
    const [row] = await rows(def._id);
    expect(row!.data.identification).toMatchObject({ kind: 'GAME', confidence: 'medium', variantKey: 'retro|gb|land-mario-super|PAL|cib|-' });
    expect(row!.data.valuation).toMatchObject({ primary: null, confidence: 'insufficient', comparable: false });
    expect(row!.data.opportunity).toMatchObject({ profit: null, discountPct: null });
  });

  it('s ključem: žeton je v poizvedbi, a NE v predpomnilniku, rezultatih ali dnevniku; cene v USD niso primerljive z EUR', async () => {
    setTestEnv({ ...KEYS, PRICECHARTING_API_KEY: 'PC-KEY-SECRET' });
    const { ana, def } = await setup(RETRO);
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('succeeded');
    expect(byRoute('pcSearch')[0]!.url).toContain('t=PC-KEY-SECRET');
    expect(byRoute('pcProduct')[0]!.url).toContain('id=777');
    const dump = JSON.stringify({ cache: await ExternalCacheModel.find().lean(), results: await rows(def._id), run: r, usage: await ExternalSourceUsageModel.find().lean() });
    expect(dump).not.toContain('PC-KEY-SECRET');
    const [row] = await rows(def._id);
    expect(row!.data.identification).toMatchObject({ confidence: 'high', catalog: { id: '777' } });
    // Cenik je v USD, oglas v EUR: brez pretvorbe primerjave ni (FR-020), vrednost je označena kot nepoprimerljiva.
    expect(row!.data.valuation).toMatchObject({ primary: null, comparable: false, confidence: 'insufficient' });
    expect(row!.data.valuation?.note).toContain('USD');
    expect(row!.data.valuation?.estimate).toMatchObject({ value: 70, currency: 'USD', basis: 'guide' });
    expect(row!.data.opportunity.profit).toBeNull();
  });

  it('PriceCharting zavrne ključ (403): zagon je delen, oglas ostane', async () => {
    setTestEnv({ ...KEYS, PRICECHARTING_API_KEY: 'PC-KEY-SECRET' });
    responses.pcSearch = () => ({ status: 403, body: {} });
    const { ana, def } = await setup(RETRO);
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('partial');
    expect(JSON.stringify(r.runErrors)).toContain('collectibles:unauthorized:pricecharting');
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(1);
  });
});
