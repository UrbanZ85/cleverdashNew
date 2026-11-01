import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';

// 019 (FR-024, FR-027, FR-028): dopis zbirateljskega skenerja z mockanim nodemailerjem in analiza z umetno
// inteligenco (017) s ponarejenim odjemalcem — oboje nad testnim virom z izmišljenimi podatki.

const { mockSendMail } = vi.hoisted(() => ({ mockSendMail: vi.fn() }));
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

const { Types } = await import('mongoose');
const { loadEnv } = await import('../../../src/platform/config/env.js');
const { getLogger } = await import('../../../src/platform/logging/logger.js');
const { registerCollectiblesScannerType } = await import('../../../src/modules/collectibles-scanner/index.js');
const { collectiblesNotificationHooks } = await import('../../../src/modules/collectibles-scanner/notifications.js');
const { ScannerNotificationModel } = await import('../../../src/platform/scanner/models/scanner-notification.model.js');
const { ScannerResultModel } = await import('../../../src/platform/scanner/models/scanner-result.model.js');
const { resetScannerTypesForTests } = await import('../../../src/platform/scanner/registry.js');
const { executeRun } = await import('../../../src/platform/scanner/services/run-executor.service.js');
const { requestManualRun } = await import('../../../src/platform/scanner/services/scheduler.service.js');
const { processNotificationOutbox } = await import('../../../src/platform/scanner/services/notification-sender.service.js');
const { resetMailerForTests } = await import('../../../src/platform/email/mailer.service.js');
const { setAiClientForTests } = await import('../../../src/platform/scanner/services/ai-client.service.js');
const { seedDefinition, seedUser } = await import('../scanner/_helpers.js');

const SMTP = { SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'noreply@example.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p' };
const BASE = { COLLECTIBLES_FAKE_SOURCE_ENABLED: 'true', OPENAI_API_KEY: 'sk-test', EBAY_MARKETPLACES: 'EBAY_DE', ...SMTP };
const CARDS = { category: 'trading-cards', keywords: 'Charizard', maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinDiscountPct: 20 };

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(() => {
  setTestEnv(BASE);
  resetScannerTypesForTests();
  registerCollectiblesScannerType();
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ messageId: '<m@x>', accepted: ['x'], rejected: [] });
  resetMailerForTests();
});
afterEach(async () => {
  setAiClientForTests(null);
  await clearTestDb();
});

const ACTOR = new Types.ObjectId().toString();
const env = () => loadEnv();
const T0 = new Date('2026-10-21T10:00:00Z');

async function run(definitionId: InstanceType<typeof Types.ObjectId>, ownerId: InstanceType<typeof Types.ObjectId>, now = T0, processOutbox = false) {
  const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'collectibles', definitionId: String(definitionId), ownerId: String(ownerId) }, ACTOR, now);
  await executeRun(runId, env(), getLogger(env()), now, { processOutbox, typeOptions: { noPacing: true } });
  return runId;
}

describe('dopis', () => {
  it('verify + render: oznaka vrste vrednosti, ni končna cena pri dražbi, dobiček ni izračunan; naslovi so ubežani', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'collectibles', { name: 'Moji <zbirki>', config: CARDS });
    const runId = await run(def._id, ana._id);
    const n = (await ScannerNotificationModel.findOne({ runId }).lean<{ items: Array<{ definitionId: unknown; definitionName: string; ownerName: string | null; resultRef: string; changeType: 'NEW'; payload: unknown }> }>())!;
    expect(n.items).toHaveLength(2);
    const items = n.items.map((i) => ({ ...i, definitionId: String(i.definitionId) })) as never[];
    const verified = await collectiblesNotificationHooks.verify(items, String(ana._id), T0);
    expect(verified).toHaveLength(2);
    const digest = collectiblesNotificationHooks.render(verified, { baseUrl: 'https://app.example', checkedAt: T0, appName: 'CleverDash' });
    expect(digest.subject).toBe('CleverDash - [Zbirateljski predmeti] 2 spremembi');
    expect(digest.html).toContain('NOVO');
    expect(digest.html).toContain('DRAŽBA SE IZTEKA');
    expect(digest.html).toContain('trenutna ponudba 6 € (ni končna cena)');
    expect(digest.html).toContain('Charizard ex');
    // Popust je označen z osnovo (katalogna ocena), dobiček ni izračunan, ker ni preverjenih prodaj.
    expect(digest.html).toContain('25.0 % pod vrednostjo (katalogna ocena, zaupanje low)');
    expect(digest.html).toContain('dobiček ni izračunan');
    expect(digest.html).not.toContain('ocenjen dobiček');
    expect(digest.html).toContain('Pristnosti predmeta iz oglasa ni mogoče potrditi');
    expect(digest.html).toContain('Moji &lt;zbirki&gt;');
    expect(digest.html).not.toContain('Moji <zbirki>');
    expect(digest.html).toContain('https://app.example/scanners');
    expect(digest.text).toContain('katalogna ocena');
  });

  it('dopis s preverjenimi prodajami navede dobiček kot oceno', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'collectibles', { name: 'Retro', config: { category: 'retro-gaming', retro: { platform: 'gb' }, maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinProfit: 1 } });
    const runId = await run(def._id, ana._id);
    const n = (await ScannerNotificationModel.findOne({ runId }).lean<{ items: Array<{ definitionId: unknown; resultRef: string; payload: unknown }> }>())!;
    const verified = await collectiblesNotificationHooks.verify(n.items.map((i) => ({ ...i, definitionId: String(i.definitionId), definitionName: 'Retro', ownerName: null, changeType: 'NEW' })) as never[], String(ana._id), T0);
    const digest = collectiblesNotificationHooks.render(verified, { baseUrl: 'https://app.example', checkedAt: T0, appName: 'CleverDash' });
    expect(digest.html).toContain('ocenjen dobiček 9.23 €');
    expect(digest.html).toContain('ocena iz preverjenih prodaj, ne dejstvo');
    expect(digest.html).toContain('preverjene prodaje');
  });

  it('verify: umaknjen ali izbrisan rezultat odpade (umik ni prodaja, dopis ne laže)', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'collectibles', { config: CARDS });
    const runId = await run(def._id, ana._id);
    const n = (await ScannerNotificationModel.findOne({ runId }).lean<{ items: Array<{ resultRef: string; payload: unknown; changeType: 'NEW'; definitionName: string }> }>())!;
    const items = n.items.map((i) => ({ ...i, definitionId: String(def._id), ownerName: null })) as never[];
    await ScannerResultModel.updateOne({ _id: new Types.ObjectId(n.items[0]!.resultRef) }, { $set: { availability: 'unavailable' } });
    await ScannerResultModel.deleteOne({ _id: new Types.ObjectId(n.items[1]!.resultRef) });
    expect(await collectiblesNotificationHooks.verify(items, String(ana._id), T0)).toEqual([]);
  });

  it('od konca do konca: outbox pošlje en zbirni dopis; zagon brez sprememb ne pošlje nič; skupaj brez dvojnikov', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'collectibles', { config: CARDS });
    await run(def._id, ana._id, T0, true);
    await processNotificationOutbox(env(), getLogger(env()), new Date(T0.getTime() + 60_000));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0]![0] as { to: string; subject: string };
    expect(mail.to).toBe('ana@example.com');
    expect(mail.subject).toContain('[Zbirateljski predmeti] 2 spremembi');

    // Drugi zagon: dražba se dvigne (PRICE_UP) — en dopis; izteka se ne ponovi.
    await run(def._id, ana._id, new Date(T0.getTime() + 3_600_000), true);
    await processNotificationOutbox(env(), getLogger(env()), new Date(T0.getTime() + 7_200_000));
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect((mockSendMail.mock.calls[1]![0] as { subject: string }).subject).toContain('1 sprememba');
    await run(def._id, ana._id, new Date(T0.getTime() + 2 * 3_600_000), true); // pocenitev
    await run(def._id, ana._id, new Date(T0.getTime() + 3 * 3_600_000), true); // umik: brez dopisa
    const countBefore = await ScannerNotificationModel.countDocuments();
    await run(def._id, ana._id, new Date(T0.getTime() + 4 * 3_600_000), true); // peti: nič novega
    expect(await ScannerNotificationModel.countDocuments()).toBe(countBefore);
  });
});

describe('analiza z umetno inteligenco (017) nad rezultati', () => {
  const analysis = JSON.stringify({
    summary: 'Neocenjena kartica, ugodna cena.',
    riskLevel: 'low',
    explanation: 'Številka kartice potrjena v katalogu.',
    risks: [],
    defects: [],
    opportunities: ['Cena pod katalogno oceno'],
    attributes: [{ key: 'card_number', value: '125' }],
    confidence: 'medium',
  });

  function fakeAi() {
    const bodies: Array<{ instructions: string; text: string; images: string[] }> = [];
    setAiClientForTests({
      analyze: async (body) => {
        const content = body.input[0]!.content;
        bodies.push({
          instructions: body.instructions,
          text: (content[0] as { text: string }).text,
          images: content.filter((c) => c.type === 'input_image').map((c) => (c as { image_url: string }).image_url),
        });
        return { ok: true, text: analysis, usage: { inputTokens: 10, outputTokens: 5 } };
      },
    });
    return bodies;
  }

  const cards = { category: 'trading-cards', keywords: 'Charizard', maxPrice: 1000, marketplaces: ['EBAY_DE'] };

  it('aiEnabled=false (privzeto): ni klica in ni analize; zagon in deterministična ocena delujeta enako', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'collectibles', { config: cards });
    const bodies = fakeAi();
    await run(def._id, ana._id);
    expect(bodies).toHaveLength(0);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id, aiAnalysis: { $ne: null } })).toBe(0);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(10);
  });

  it('aiEnabled=true: vsak shranjen rezultat dobi analizo; vhod ima atribute in vrsto cene, brez oseb in brez številčnih vrednosti', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'collectibles', { aiEnabled: true, config: cards });
    const bodies = fakeAi();
    await run(def._id, ana._id);
    expect(bodies).toHaveLength(10);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id, 'aiAnalysis.riskLevel': 'low' })).toBe(10);
    const card = bodies.find((b) => b.text.includes('Obsidian Flames English') && b.text.includes('"price"') && b.text.includes('"amount": 9'))!;
    expect(card.text).toContain('"catalog_id": "sv3-125"');
    expect(card.text).toContain('"card_number": "125"');
    expect(card.text).toContain('"identification_kind": "CARD"');
    expect(card.text).toContain('"value_basis": "estimate"');
    expect(card.text).toContain('"discount_basis": "estimate"');
    expect(card.text).not.toContain(String(ana._id));
    expect(card.text).not.toContain('ana@example.com');
    expect(card.images).toEqual([]); // SCANNER_AI_IMAGES je izklopljen
    // Navodilo prepoveduje trditve o pristnosti iz slik in ocenjevanje cen.
    expect(card.instructions).toMatch(/pristen/);
    expect(card.instructions).toMatch(/ne ocenjuj cen/);
    const proxy = bodies.find((b) => b.text.includes('proxy custom'))!;
    expect(proxy.text).toContain('"identification_kind": "PROXY"');
  });

  it('SCANNER_AI_IMAGES=true: samo ebayimg slike, največ 3', async () => {
    setTestEnv({ ...BASE, SCANNER_AI_IMAGES: 'true' });
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'collectibles', { aiEnabled: true, config: cards });
    const bodies = fakeAi();
    await run(def._id, ana._id);
    const card = bodies.find((b) => b.text.includes('"amount": 9'))!;
    expect(card.images).toEqual(['https://i.ebayimg.com/images/g/C2/s-l500.jpg']);
  });

  it('napaka modela ne spremeni zagona ali rezultatov', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'collectibles', { aiEnabled: true, config: CARDS });
    setAiClientForTests({ analyze: async () => ({ ok: false, reason: 'http-500', message: 'x', usage: { inputTokens: 0, outputTokens: 0 } }) });
    const runId = await run(def._id, ana._id);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(10);
    expect(await ScannerNotificationModel.countDocuments({ runId })).toBe(1);
  });
});
