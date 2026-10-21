import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';

// 018 (FR-021, FR-022): dopis LEGO skenerja z mockanim nodemailerjem in analiza z umetno inteligenco (017) s
// ponarejenim odjemalcem — oboje nad testnim virom z izmišljenimi podatki.

const { mockSendMail } = vi.hoisted(() => ({ mockSendMail: vi.fn() }));
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

const { Types } = await import('mongoose');
const { loadEnv } = await import('../../../src/platform/config/env.js');
const { getLogger } = await import('../../../src/platform/logging/logger.js');
const { registerLegoScannerType } = await import('../../../src/modules/lego-scanner/index.js');
const { legoNotificationHooks } = await import('../../../src/modules/lego-scanner/notifications.js');
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
const BASE = { LEGO_FAKE_SOURCE_ENABLED: 'true', OPENAI_API_KEY: 'sk-test', ...SMTP };

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(() => {
  setTestEnv(BASE);
  resetScannerTypesForTests();
  registerLegoScannerType();
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
  const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'lego', definitionId: String(definitionId), ownerId: String(ownerId) }, ACTOR, now);
  await executeRun(runId, env(), getLogger(env()), now, { processOutbox, typeOptions: { noPacing: true } });
  return runId;
}

describe('dopis', () => {
  it('verify + render: oznaka ocene, ni končna cena pri dražbi, poštnina, vrednost in dobiček z zaupanjem; naslovi so ubežani', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'lego', { name: 'Moj <LEGO>', config: { maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinProfit: 30 } });
    const runId = await run(def._id, ana._id);
    const n = (await ScannerNotificationModel.findOne({ runId }).lean<{ items: Array<{ definitionId: unknown; definitionName: string; ownerName: string | null; resultRef: string; changeType: 'NEW'; payload: unknown }> }>())!;
    expect(n.items).toHaveLength(2);
    const items = n.items.map((i) => ({ ...i, definitionId: String(i.definitionId) })) as never[];
    const verified = await legoNotificationHooks.verify(items, String(ana._id), T0);
    expect(verified).toHaveLength(2);
    const digest = legoNotificationHooks.render(verified, { baseUrl: 'https://app.example', checkedAt: T0, appName: 'CleverDash' });
    expect(digest.subject).toBe('CleverDash - [LEGO] 2 spremembi');
    expect(digest.html).toContain('NOVO');
    expect(digest.html).toContain('DRAŽBA SE IZTEKA');
    expect(digest.html).toContain('trenutna ponudba 60 € (ni končna cena)');
    expect(digest.html).toContain('75192-1 Millennium Falcon');
    expect(digest.html).toContain('ocenjen dobiček 47.10 €');
    expect(digest.html).toContain('ocena, ne dejstvo');
    expect(digest.html).toContain('ocenjena vrednost 550 € (14 prodaj, zaupanje high)');
    expect(digest.html).toContain('Moj &lt;LEGO&gt;');
    expect(digest.html).not.toContain('Moj <LEGO>');
    expect(digest.html).toContain('https://app.example/scanners');
    expect(digest.text).toContain('ocenjen dobiček');
  });

  it('verify odstrani postavko, ki medtem ni več na voljo ali je izbrisana (ponovna preverba pred pošiljanjem)', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'lego', { config: { maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinProfit: 30 } });
    const runId = await run(def._id, ana._id);
    const n = (await ScannerNotificationModel.findOne({ runId }).lean<{ items: Array<{ resultRef: string; payload: unknown; changeType: 'NEW'; definitionName: string }> }>())!;
    const items = n.items.map((i) => ({ ...i, definitionId: String(def._id), ownerName: null })) as never[];
    await ScannerResultModel.updateOne({ _id: new Types.ObjectId(n.items[0]!.resultRef) }, { $set: { availability: 'unavailable' } });
    await ScannerResultModel.deleteOne({ _id: new Types.ObjectId(n.items[1]!.resultRef) });
    expect(await legoNotificationHooks.verify(items, String(ana._id), T0)).toEqual([]);
  });

  it('od konca do konca: outbox pošlje en zbirni dopis; drugi zagon brez sprememb ne pošlje nič', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'lego', { config: { maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinProfit: 30 } });
    await run(def._id, ana._id, T0, true);
    await processNotificationOutbox(env(), getLogger(env()), new Date(T0.getTime() + 60_000));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0]![0] as { to: string; subject: string; html: string };
    expect(mail.to).toBe('ana@example.com');
    expect(mail.subject).toContain('[LEGO] 2 spremembi');

    // Isto stanje, isti oglasi: brez NOVEGA, brez praga prehoda → brez dopisa (SC-004).
    await run(def._id, ana._id, new Date(T0.getTime() + 3_600_000), true);
    await processNotificationOutbox(env(), getLogger(env()), new Date(T0.getTime() + 7_200_000));
    expect(mockSendMail).toHaveBeenCalledTimes(2); // dražba: druga ponudba je sprememba (PRICE_UP) — en dopis za to
    expect((mockSendMail.mock.calls[1]![0] as { subject: string }).subject).toContain('[LEGO] 1 sprememba');
    await run(def._id, ana._id, new Date(T0.getTime() + 2 * 3_600_000), true); // tretji: pocenitev 75192
    await run(def._id, ana._id, new Date(T0.getTime() + 3 * 3_600_000), true); // četrti: umik, brez dopisa
    const countBefore = await ScannerNotificationModel.countDocuments();
    await run(def._id, ana._id, new Date(T0.getTime() + 4 * 3_600_000), true); // peti: nič novega
    expect(await ScannerNotificationModel.countDocuments()).toBe(countBefore);
  });
});

describe('analiza z umetno inteligenco (017) nad LEGO rezultati', () => {
  const analysis = JSON.stringify({
    summary: 'Ugoden zapečaten set.',
    riskLevel: 'low',
    explanation: 'Številka seta potrjena v katalogu.',
    risks: [],
    defects: [],
    opportunities: ['Cena pod prodajami'],
    attributes: [{ key: 'set_number', value: '75192-1' }],
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

  it('aiEnabled=false (privzeto): ni klica in ni analize', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'lego', { config: { maxPrice: 1000, marketplaces: ['EBAY_DE'] } });
    const bodies = fakeAi();
    await run(def._id, ana._id);
    expect(bodies).toHaveLength(0);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id, aiAnalysis: { $ne: null } })).toBe(0);
  });

  it('aiEnabled=true: vsak shranjen rezultat dobi analizo; vhod ima atribute seta in vrednosti, brez oseb; slike samo ob nastavitvi', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'lego', { aiEnabled: true, config: { maxPrice: 1000, marketplaces: ['EBAY_DE'] } });
    const bodies = fakeAi();
    await run(def._id, ana._id);
    expect(bodies).toHaveLength(9);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id, 'aiAnalysis.riskLevel': 'low' })).toBe(9);
    const falcon = bodies.find((b) => b.text.includes('75192 Millennium Falcon NEU'))!;
    expect(falcon.text).toContain('"set_number": "75192-1"');
    expect(falcon.text).toContain('"condition": "NEW_SEALED"');
    expect(falcon.text).toContain('"sold_average_eur": 550');
    expect(falcon.text).toContain('"sold_count_6_months": 14');
    expect(falcon.text).not.toContain(String(ana._id));
    expect(falcon.text).not.toContain('ana@example.com');
    expect(falcon.images).toEqual([]); // SCANNER_AI_IMAGES je izklopljen
    expect(falcon.instructions).toMatch(/pristen/);
    expect(falcon.instructions).toMatch(/ne ocenjuj cen/);
  });

  it('SCANNER_AI_IMAGES=true: samo ebayimg slike, največ 3', async () => {
    setTestEnv({ ...BASE, SCANNER_AI_IMAGES: 'true' });
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'lego', { aiEnabled: true, config: { maxPrice: 1000, marketplaces: ['EBAY_DE'] } });
    const bodies = fakeAi();
    await run(def._id, ana._id);
    const falcon = bodies.find((b) => b.text.includes('75192 Millennium Falcon NEU'))!;
    expect(falcon.images).toEqual(['https://i.ebayimg.com/images/g/F1/s-l500.jpg']);
  });

  it('napaka modela ne spremeni zagona ali rezultatov', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'lego', { aiEnabled: true, config: { maxPrice: 1000, marketplaces: ['EBAY_DE'], notifyMinProfit: 30 } });
    setAiClientForTests({ analyze: async () => ({ ok: false, reason: 'http-500', message: 'x', usage: { inputTokens: 0, outputTokens: 0 } }) });
    const runId = await run(def._id, ana._id);
    expect(await ScannerResultModel.countDocuments({ definitionId: def._id })).toBe(9);
    expect(await ScannerNotificationModel.countDocuments({ runId })).toBe(1);
  });
});
