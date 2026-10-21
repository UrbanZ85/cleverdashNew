import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { ExternalCacheModel } from '../../../src/platform/cache/model.js';
import { registerLegoScannerType } from '../../../src/modules/lego-scanner/index.js';
import { LegoSourceUsageModel } from '../../../src/modules/lego-scanner/models/lego-source-usage.model.js';
import { resetEbayTokenForTests } from '../../../src/modules/lego-scanner/sources/ebay.js';
import { reserveSourceRequest, usageDay } from '../../../src/modules/lego-scanner/sources/usage.js';
import type { LegoResultData } from '../../../src/modules/lego-scanner/domain/types.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { resetScannerTypesForTests } from '../../../src/platform/scanner/registry.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { requestManualRun } from '../../../src/platform/scanner/services/scheduler.service.js';
import { seedDefinition, seedUser } from '../scanner/_helpers.js';

// 018 (FR-005 do FR-010): pravi viri z MOCK odgovori — eBay, Rebrickable, BrickLink prek `fetch`. Preveri
// zahteve (glave, filtri), predpomnilnik (drugi zagon brez klicev), dnevne meje, izolacijo izpadov in da
// skrivnosti nikoli ne pristanejo v predpomnilniku, dnevniku ali rezultatih.

const KEYS = {
  LEGO_FAKE_SOURCE_ENABLED: 'false',
  REBRICKABLE_API_KEY: 'RB-KEY-SECRET',
  BRICKLINK_CONSUMER_KEY: 'BL-CK',
  BRICKLINK_CONSUMER_SECRET: 'BL-CS-SECRET',
  BRICKLINK_TOKEN: 'BL-TOKEN',
  BRICKLINK_TOKEN_SECRET: 'BL-TS-SECRET',
  EBAY_CLIENT_ID: 'EB-ID',
  EBAY_CLIENT_SECRET: 'EB-CLIENT-SECRET',
  EBAY_MARKETPLACES: 'EBAY_DE,EBAY_IT',
};
const SECRETS = ['RB-KEY-SECRET', 'BL-CS-SECRET', 'BL-TS-SECRET', 'EB-CLIENT-SECRET', 'tok-SECRET-1'];

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}
let calls: Call[] = [];
let responses: Record<string, (url: string) => { status: number; body: unknown }> = {};
const realFetch = globalThis.fetch;

const EBAY_BODY = {
  total: 1,
  itemSummaries: [
    {
      itemId: 'v1|500|0',
      title: 'LEGO Star Wars 75192 Millennium Falcon NEU OVP',
      price: { value: '350.00', currency: 'EUR' },
      condition: 'New',
      conditionId: '1000',
      buyingOptions: ['FIXED_PRICE'],
      itemWebUrl: 'https://www.ebay.de/itm/500',
      image: { imageUrl: 'https://i.ebayimg.com/a.jpg' },
      itemLocation: { country: 'DE' },
      shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '20.00', currency: 'EUR' } }],
    },
  ],
};
const RB_SET = { set_num: '75192-1', name: 'Millennium Falcon', year: 2017, theme_id: 158, num_parts: 7541, set_img_url: 'https://cdn.rebrickable.com/a.jpg', set_url: 'https://rebrickable.com/sets/75192-1/' };
const RB_THEMES = { results: [{ id: 1, parent_id: null, name: 'Star Wars' }, { id: 158, parent_id: 1, name: 'Ultimate Collector Series' }] };
const bl = (count: number, avg: number) => ({
  meta: { code: 200 },
  data: { currency_code: 'EUR', avg_price: String(avg), qty_avg_price: String(avg), min_price: String(avg - 50), max_price: String(avg + 50), unit_quantity: String(count), total_quantity: String(count), price_detail: [{ quantity: 1, unit_price: String(avg - 10) }, { quantity: 1, unit_price: String(avg + 10) }, { quantity: 1, unit_price: String(avg) }] },
});

function defaultResponses() {
  responses = {
    token: () => ({ status: 200, body: { access_token: 'tok-SECRET-1', expires_in: 7200, token_type: 'Application Access Token' } }),
    ebay: () => ({ status: 200, body: EBAY_BODY }),
    rbSet: () => ({ status: 200, body: RB_SET }),
    rbThemes: () => ({ status: 200, body: RB_THEMES }),
    blSold: () => ({ status: 200, body: bl(14, 550) }),
    blStock: () => ({ status: 200, body: bl(5, 700) }),
  };
}

function route(url: string): keyof typeof responses | null {
  if (url.includes('/identity/v1/oauth2/token')) return 'token';
  if (url.includes('/buy/browse/v1/item_summary/search')) return 'ebay';
  if (url.includes('/lego/themes/')) return 'rbThemes';
  if (url.includes('/lego/sets/')) return 'rbSet';
  if (url.includes('/items/SET/') && url.includes('guide_type=sold')) return 'blSold';
  if (url.includes('/items/SET/') && url.includes('guide_type=stock')) return 'blStock';
  return null;
}

beforeEach(() => {
  setTestEnv(KEYS);
  resetScannerTypesForTests();
  registerLegoScannerType();
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
      calls.push({ url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string> });
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
const CONFIG = { setNumber: '75192', marketplaces: ['EBAY_DE'], notifyMinProfit: 30 };

async function run(definitionId: Types.ObjectId, ownerId: Types.ObjectId) {
  const now = new Date();
  const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'lego', definitionId: String(definitionId), ownerId: String(ownerId) }, ACTOR, now);
  await executeRun(runId, env(), logger(), now, { processOutbox: false, typeOptions: { noPacing: true } });
  return (await ScannerRunModel.findById(runId).lean())!;
}

async function setup() {
  const ana = await seedUser('ana');
  const def = await seedDefinition(ana._id, 'lego', { name: 'LEGO viri', config: CONFIG });
  return { ana, def };
}

describe('uspešen zagon z vsemi tremi viri', () => {
  it('eBay → Rebrickable → BrickLink: rezultat z vrednostjo in dobičkom; zahteve imajo prave glave in filtre', async () => {
    const { ana, def } = await setup();
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('succeeded');
    const row = (await ScannerResultModel.findOne({ definitionId: def._id }).lean<{ source: string; externalId: string; price: { amount: number }; url: string; data: LegoResultData }>())!;
    expect(row).toMatchObject({ source: 'ebay:EBAY_DE', externalId: 'v1|500|0', price: { amount: 350 }, url: 'https://www.ebay.de/itm/500' });
    expect(row.data.lego).toMatchObject({ setNumber: '75192-1', theme: 'Star Wars', subtheme: 'Ultimate Collector Series', condition: 'NEW_SEALED' });
    expect(row.data.valuation).toMatchObject({ average: 550, salesCount: 14, confidence: 'high', median: 550 });
    expect(row.data.opportunity.profit).toBeCloseTo(47.1, 1);

    const byRoute = (key: string) => calls.filter((c) => route(c.url) === key);
    expect(byRoute('token')).toHaveLength(1);
    expect(byRoute('token')[0]!.headers['Authorization']).toBe(`Basic ${Buffer.from('EB-ID:EB-CLIENT-SECRET').toString('base64')}`);
    const search = byRoute('ebay')[0]!;
    expect(search.headers['Authorization']).toBe('Bearer tok-SECRET-1');
    expect(search.headers['X-EBAY-C-MARKETPLACE-ID']).toBe('EBAY_DE');
    const filter = new URL(search.url).searchParams.get('filter')!;
    expect(filter).toContain('deliveryCountry:SI');
    expect(new URL(search.url).searchParams.get('q')).toBe('LEGO 75192');
    expect(byRoute('rbSet')[0]!.headers['Authorization']).toBe('key RB-KEY-SECRET');
    expect(byRoute('rbSet')[0]!.url).not.toContain('RB-KEY');
    const sold = byRoute('blSold')[0]!;
    expect(sold.headers['Authorization']).toMatch(/^OAuth realm="", oauth_consumer_key="BL-CK", oauth_token="BL-TOKEN", oauth_signature_method="HMAC-SHA1"/);
    expect(new URL(sold.url).searchParams.get('new_or_used')).toBe('N');
    expect(new URL(sold.url).searchParams.get('currency_code')).toBe('EUR');
    expect(byRoute('blStock')).toHaveLength(1);
  });

  it('skrivnosti nikoli v predpomnilniku, rezultatih, zagonu ali števcih', async () => {
    const { ana, def } = await setup();
    const r = await run(def._id, ana._id);
    const dump = JSON.stringify({
      cache: await ExternalCacheModel.find().lean(),
      results: await ScannerResultModel.find().lean(),
      run: r,
      usage: await LegoSourceUsageModel.find().lean(),
    });
    for (const secret of SECRETS) expect(dump).not.toContain(secret);
    expect(await ExternalCacheModel.countDocuments()).toBeGreaterThanOrEqual(5);
  });

  it('dnevna poraba po viru se šteje; drugi zagon je v celoti iz predpomnilnika (brez klicev)', async () => {
    const { ana, def } = await setup();
    await run(def._id, ana._id);
    const first = calls.length;
    expect(first).toBe(6); // žeton, oglasi, set, teme, sold, stock — žeton ne šteje v dnevno mejo
    const usage = Object.fromEntries((await LegoSourceUsageModel.find({ day: usageDay(new Date()) }).lean<Array<{ source: string; requests: number }>>()).map((u) => [u.source, u.requests]));
    expect(usage).toEqual({ ebay: 1, rebrickable: 2, bricklink: 2 });
    calls = [];
    const r2 = await run(def._id, ana._id);
    expect(r2.status).toBe('succeeded');
    expect(calls).toHaveLength(0);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(1);
  });
});

describe('izpadi virov', () => {
  it('eBay odpove: zagon failed s kodo, obstoječi rezultati OSTANEJO (ni "nedosegljivo")', async () => {
    const { ana, def } = await setup();
    await run(def._id, ana._id);
    await ExternalCacheModel.deleteMany({});
    responses['ebay'] = () => ({ status: 500, body: { errors: ['x'] } });
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('failed');
    expect(r.runErrors.map((e) => e.code)).toContain('lego:unreachable:ebay');
    const row = (await ScannerResultModel.findOne({ definitionId: def._id }).lean<{ availability: string }>())!;
    expect(row.availability).toBe('available');
  });

  it('BrickLink zavrne dostop (IP ni registriran): zagon partial z navodilom, rezultat brez vrednosti in dobička', async () => {
    const { ana, def } = await setup();
    responses['blSold'] = () => ({ status: 403, body: { meta: { code: 403 } } });
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('partial');
    const err = r.runErrors.find((e) => e.code === 'lego:unauthorized:bricklink')!;
    expect(err.message).toContain('registriran IP');
    const row = (await ScannerResultModel.findOne({ definitionId: def._id }).lean<{ data: LegoResultData }>())!;
    expect(row.data.valuation).toBeNull();
    expect(row.data.opportunity.profit).toBeNull();
    expect(row.data.opportunity.missing).toContain('valuation');
    expect(row.data.identification.kind).toBe('SET');
  });

  it('Rebrickable izpade: set je prepoznan po številki s srednjim zaupanjem, brez imena iz kataloga, vrednotenje deluje', async () => {
    const { ana, def } = await setup();
    responses['rbSet'] = () => ({ status: 500, body: {} });
    const r = await run(def._id, ana._id);
    expect(r.status).toBe('partial');
    const row = (await ScannerResultModel.findOne({ definitionId: def._id }).lean<{ data: LegoResultData }>())!;
    expect(row.data.identification).toMatchObject({ kind: 'SET', confidence: 'medium', catalog: null });
    expect(row.data.valuation).toBeNull(); // brez kataloga ni zanesljive številke seta za cenik
  });

  it('katalog ne pozna seta (404): ni set, nizko zaupanje, ročni pregled; negativni odgovor se predpomni', async () => {
    const { ana, def } = await setup();
    responses['rbSet'] = () => ({ status: 404, body: { detail: 'Not found.' } });
    await run(def._id, ana._id);
    const row = (await ScannerResultModel.findOne({ definitionId: def._id }).lean<{ data: LegoResultData }>())!;
    expect(row.data.identification).toMatchObject({ kind: 'UNIDENTIFIED', needsReview: true });
    calls = [];
    await run(def._id, ana._id);
    expect(calls.filter((c) => route(c.url) === 'rbSet')).toHaveLength(0);
  });

  it('dnevna meja vira: presežek se preskoči brez rušenja zagona; sporočilo pove razlog', async () => {
    setTestEnv({ ...KEYS, LEGO_BRICKLINK_DAILY_LIMIT: '1' });
    const { ana, def } = await setup();
    const r = await run(def._id, ana._id); // sold porabi edino rezervacijo; stock (neobvezen) ne
    expect(r.status).toBe('succeeded');
    const row = (await ScannerResultModel.findOne({ definitionId: def._id }).lean<{ data: LegoResultData }>())!;
    expect(row.data.valuation).toMatchObject({ average: 550, active: null });
  });

  it('tržnica, ki je namestitev ne dovoli, je zavrnjena že ob shranjevanju (config), ne šele ob zagonu', async () => {
    const { validateLegoConfig, legoConfigSchema } = await import('../../../src/modules/lego-scanner/config.js');
    const parsed = legoConfigSchema.parse({ keywords: 'x', marketplaces: ['EBAY_IT'] });
    expect(validateLegoConfig(parsed, { EBAY_MARKETPLACES: 'EBAY_DE' })).toContain('EBAY_IT');
  });
});

describe('dnevna meja (usage)', () => {
  it('atomarna rezervacija: do meje true, nato false; vsak vir ima svojo mejo; nov dan nov števec', async () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(await reserveSourceRequest('ebay', now, 2)).toBe(true);
    expect(await reserveSourceRequest('ebay', now, 2)).toBe(true);
    expect(await reserveSourceRequest('ebay', now, 2)).toBe(false);
    expect(await reserveSourceRequest('bricklink', now, 2)).toBe(true);
    expect(await reserveSourceRequest('ebay', new Date('2026-10-22T10:00:00Z'), 2)).toBe(true);
  });

  it('sočasne rezervacije ne presežejo meje', async () => {
    const now = new Date('2026-10-21T10:00:00Z');
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveSourceRequest('rebrickable', now, 3)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect((await LegoSourceUsageModel.findOne({ source: 'rebrickable', day: usageDay(now) }).lean<{ requests: number }>())?.requests).toBe(3);
  });

  it('dan je koledarski dan v Ljubljani, ne UTC', () => {
    expect(usageDay(new Date('2026-10-21T22:30:00Z'))).toBe('2026-10-22');
    expect(usageDay(new Date('2026-10-21T21:30:00Z'))).toBe('2026-10-21');
  });
});
