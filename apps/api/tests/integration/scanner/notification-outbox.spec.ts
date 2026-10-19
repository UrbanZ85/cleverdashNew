import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';

// FR-028 do FR-033 (US1, US5): generični outbox z MOCK tipom in mockanim nodemailerjem.

const { mockSendMail } = vi.hoisted(() => ({ mockSendMail: vi.fn() }));
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

const { ScannerNotificationModel } = await import('../../../src/platform/scanner/models/scanner-notification.model.js');
const { ScannerRunModel } = await import('../../../src/platform/scanner/models/scanner-run.model.js');
const { resetScannerTypesForTests } = await import('../../../src/platform/scanner/registry.js');
const { buildNotificationsForRun } = await import('../../../src/platform/scanner/services/notification-builder.service.js');
const { processNotificationOutbox, MAX_ATTEMPTS } = await import('../../../src/platform/scanner/services/notification-sender.service.js');
const { resetMailerForTests } = await import('../../../src/platform/email/mailer.service.js');
const { loadEnv } = await import('../../../src/platform/config/env.js');
const { mockType, seedUser } = await import('./_helpers.js');
type MockTypeHandle = Awaited<ReturnType<typeof mockType>>;
type ScannerEvent = Parameters<typeof buildNotificationsForRun>[0]['events'][number];

const SMTP = { SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'noreply@example.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p' };

beforeAll(async () => {
  setTestEnv(SMTP);
  await startTestDb();
});
afterAll(stopTestDb);

let mock: MockTypeHandle;
beforeEach(() => {
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ messageId: '<m@x>', accepted: ['x'], rejected: [] });
  resetMailerForTests();
  resetScannerTypesForTests();
  mock = mockType('mock', 'batch');
});
afterEach(async () => {
  setTestEnv(SMTP);
  await clearTestDb();
});

const env = () => loadEnv();

async function seedRun(now = new Date()) {
  return ScannerRunModel.create({
    scannerType: 'mock',
    scope: { kind: 'type' },
    slotKey: `manual:${new Types.ObjectId().toString()}`,
    trigger: 'manual',
    status: 'succeeded',
    createdAt: now,
    startedAt: now,
    finishedAt: now,
    heartbeatAt: now,
    counters: { notificationsPending: 1 },
    expiresAt: new Date(now.getTime() + 86_400_000),
  });
}

function event(partial: Partial<ScannerEvent> & { ownerId: string }): ScannerEvent {
  return {
    definitionId: new Types.ObjectId().toString(),
    definitionName: 'Prvo',
    recipients: [partial.ownerId],
    resultRef: 'r1',
    changeType: 'NEW',
    payload: { title: 'x', price: { amount: 1, currency: 'EUR' } },
    ...partial,
  };
}

describe('sestavljanje (FR-028)', () => {
  it('isti rezultat dveh skenerjev istega prejemnika → ena postavka z obema imenoma in močnejšo vrsto', async () => {
    const ana = await seedUser('ana');
    const run = await seedRun();
    const built = await buildNotificationsForRun({
      runId: run._id,
      scannerType: 'mock',
      events: [
        event({ ownerId: String(ana._id), definitionName: 'Prvo', changeType: 'PRICE_UP' }),
        event({ ownerId: String(ana._id), definitionName: 'Drugo', changeType: 'NEW' }),
        event({ ownerId: String(ana._id), definitionName: 'Prvo', resultRef: 'r2', changeType: 'CHANGED' }),
      ],
      now: new Date(),
      env: env(),
    });
    expect(built).toEqual({ created: 1, recipients: 1 });
    const n = await ScannerNotificationModel.findOne().lean();
    expect(n?.items).toHaveLength(2);
    const merged = n?.items.find((i) => i.resultRef === 'r1');
    expect(merged).toMatchObject({ definitionName: 'Prvo · Drugo', changeType: 'NEW', ownerName: null });
  });

  it('prejemnik, ki ni lastnik, dobi lasten dopis z imenom lastnika; ponovitev sestavljanja ne podvoji (E11000)', async () => {
    const ana = await seedUser('ana');
    const bor = await seedUser('bor');
    const run = await seedRun();
    const params = { runId: run._id, scannerType: 'mock', events: [event({ ownerId: String(ana._id), recipients: [String(ana._id), String(bor._id)] })], now: new Date(), env: env() };
    expect(await buildNotificationsForRun(params)).toEqual({ created: 2, recipients: 2 });
    expect(await buildNotificationsForRun(params)).toEqual({ created: 0, recipients: 2 });
    expect(await ScannerNotificationModel.countDocuments()).toBe(2);
    const toBor = await ScannerNotificationModel.findOne({ recipientUserId: bor._id }).lean();
    expect(toBor?.items[0]).toMatchObject({ ownerName: 'Oseba ana' });
  });
});

describe('pošiljanje in zadušitve (FR-030, FR-031)', () => {
  async function pendingFor(userId: Types.ObjectId) {
    const run = await seedRun();
    await buildNotificationsForRun({ runId: run._id, scannerType: 'mock', events: [event({ ownerId: String(userId) })], now: new Date(), env: env() });
    return run;
  }

  it('verify tipa dobi postavke in prejemnika; prazen rezultat → suppressed no-items; sicer sent prek render', async () => {
    const ana = await seedUser('ana');
    const run = await pendingFor(ana._id);
    const seen: Array<{ recipient: string; items: number }> = [];
    mock.behaviour.verify = async (items, recipient) => {
      seen.push({ recipient, items: items.length });
      return [];
    };
    await processNotificationOutbox(env(), undefined, new Date());
    expect(seen).toEqual([{ recipient: String(ana._id), items: 1 }]);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(await ScannerNotificationModel.findOne().lean()).toMatchObject({ status: 'suppressed', suppressedReason: 'no-items' });
    expect((await ScannerRunModel.findById(run._id).lean())?.counters).toMatchObject({ notificationsSuppressed: 1, notificationsPending: 0 });

    const bor = await seedUser('bor');
    const run2 = await pendingFor(bor._id);
    mock.behaviour.verify = undefined;
    await processNotificationOutbox(env(), undefined, new Date());
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0]![0] as { to: string; subject: string; html: string };
    expect(mail.to).toBe('bor@example.com');
    expect(mail.subject).toBe('Mock: 1 sprememb');
    expect(mail.html).toContain('"amount":1');
    expect((await ScannerRunModel.findById(run2._id).lean())?.counters).toMatchObject({ notificationsSent: 1 });
  });

  it('tip, odjavljen pred pošiljanjem → suppressed type-unavailable', async () => {
    const ana = await seedUser('ana');
    await pendingFor(ana._id);
    resetScannerTypesForTests();
    await processNotificationOutbox(env(), undefined, new Date());
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(await ScannerNotificationModel.findOne().lean()).toMatchObject({ status: 'suppressed', suppressedReason: 'type-unavailable' });
  });

  it('brez SMTP → smtp-not-configured; izbrisan uporabnik → user-missing; e-naslov ni v zapisu', async () => {
    setTestEnv({ ...SMTP, SMTP_HOST: '', SMTP_FROM: '' });
    const ana = await seedUser('ana');
    await pendingFor(ana._id);
    await processNotificationOutbox(env(), undefined, new Date());
    expect(await ScannerNotificationModel.findOne().lean()).toMatchObject({ status: 'suppressed', suppressedReason: 'smtp-not-configured' });

    await clearTestDb();
    setTestEnv(SMTP);
    const bor = await seedUser('bor');
    await pendingFor(bor._id);
    await bor.deleteOne();
    await processNotificationOutbox(env(), undefined, new Date());
    const n = await ScannerNotificationModel.findOne().lean();
    expect(n).toMatchObject({ status: 'suppressed', suppressedReason: 'user-missing' });
    expect(JSON.stringify(n)).not.toContain('bor@example.com');
  });

  it('zavrnjeno pošiljanje → pending z backoffom; po času ENKRAT; po izčrpanih poskusih failed; obtičal sending nazaj v pending', async () => {
    const ana = await seedUser('ana');
    await pendingFor(ana._id);
    mockSendMail.mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' }));
    const t0 = new Date();
    await processNotificationOutbox(env(), undefined, t0);
    let n = await ScannerNotificationModel.findOne().lean();
    expect(n).toMatchObject({ status: 'pending', attemptCount: 1 });
    expect(n?.nextAttemptAt?.getTime()).toBe(t0.getTime() + 60_000);
    await processNotificationOutbox(env(), undefined, new Date(t0.getTime() + 30_000));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    await processNotificationOutbox(env(), undefined, new Date(t0.getTime() + 61_000));
    await processNotificationOutbox(env(), undefined, new Date(t0.getTime() + 62_000));
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    n = await ScannerNotificationModel.findOne().lean();
    expect(n).toMatchObject({ status: 'sent', attemptCount: 2, messageId: '<m@x>' });

    await clearTestDb();
    const bor = await seedUser('bor');
    await pendingFor(bor._id);
    mockSendMail.mockReset();
    mockSendMail.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    let at = Date.now();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await processNotificationOutbox(env(), undefined, new Date(at));
      at += 3600_000 + 1000;
    }
    expect(await ScannerNotificationModel.findOne().lean()).toMatchObject({ status: 'failed', attemptCount: MAX_ATTEMPTS });

    await clearTestDb();
    const cene = await seedUser('cene');
    await pendingFor(cene._id);
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: '<m@y>' });
    const t = Date.now();
    await ScannerNotificationModel.updateOne({}, { $set: { status: 'sending', sendingSince: new Date(t - 31 * 60_000) } });
    await processNotificationOutbox(env(), undefined, new Date(t));
    expect(await ScannerNotificationModel.findOne().lean()).toMatchObject({ status: 'sent' });
  });
});
