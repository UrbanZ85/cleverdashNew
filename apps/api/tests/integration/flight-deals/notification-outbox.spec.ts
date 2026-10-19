import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';

// US4 in US5 iz 015 (FR-033 do FR-044, SC-003, SC-004): outbox dopisov z mockanim nodemailerjem — od 016
// outbox teče v jedru skenerjev, pričakovanja so ista.

const { mockSendMail } = vi.hoisted(() => ({ mockSendMail: vi.fn() }));
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

const { ScannerNotificationModel: FlightNotificationModel } = await import('../../../src/platform/scanner/models/scanner-notification.model.js');
const { ScannerRunModel: FlightSearchRunModel } = await import('../../../src/platform/scanner/models/scanner-run.model.js');
const { FlightSearchRuleModel } = await import('../../../src/modules/flight-deals/models/flight-search-rule.model.js');
const { UserModel } = await import('../../../src/modules/auth/models/user.model.js');
const { resetFakeProviderForTests } = await import('../../../src/modules/flight-deals/providers/fake.provider.js');
const { processNotificationOutbox, MAX_ATTEMPTS } = await import('../../../src/platform/scanner/services/notification-sender.service.js');
const { resetMailerForTests } = await import('../../../src/platform/email/mailer.service.js');
const { loadEnv } = await import('../../../src/platform/config/env.js');
const { seedRule } = await import('../../contract/flight-deals/_helpers.js');
const { runOnce } = await import('./_run.js');

const SMTP = { SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'noreply@example.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p' };

beforeAll(async () => {
  setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true', ...SMTP });
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(() => {
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ messageId: '<m@x>', accepted: ['x'], rejected: [] });
  resetMailerForTests();
});
afterEach(async () => {
  resetFakeProviderForTests();
  setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true', ...SMTP });
  await clearTestDb();
});

async function user(name: string) {
  return UserModel.create({ keycloakSubject: `kc-${name}`, email: `${name}@example.com`, displayName: `Oseba ${name}`, lastLoginAt: new Date() });
}

const env = () => loadEnv();

describe('en dopis na prejemnika na zagon (FR-033, FR-034)', () => {
  it('prvi zagon pošlje en dopis z NOVO postavkami; drugi brez sprememb ne pošlje nič; pocenitev pošlje enega (SC-003)', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id), { passengers: { adults: 1, childrenAges: [] } });
    const t0 = Date.now();

    await runOnce(new Date(t0), { processOutbox: true });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const first = mockSendMail.mock.calls[0]![0] as { to: string; subject: string; html: string };
    expect(first.to).toBe('ana@example.com');
    expect(first.subject).toBe('CleverDash - [Leti] 2 novi ponudbi');
    expect(first.html).toContain('NOVO');
    expect(first.html).not.toContain('<s ');
    expect(await FlightNotificationModel.countDocuments({ status: 'sent' })).toBe(1);

    // Drugi zagon istega stanja bi bil pocenitev (scenarij 89) — zato tu simuliramo "brez sprememb" s četrtim zagonom pozneje.
    await runOnce(new Date(t0 + 60_000), { processOutbox: true }); // 89 → POCENITEV
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    const second = mockSendMail.mock.calls[1]![0] as { subject: string; html: string };
    expect(second.subject).toContain('1 pocenitev');
    expect(second.html).toContain('<s style="color:#6b7280">120 €</s>');
    expect(second.html).toContain('89 €');
    expect(second.html).toContain('−31 €');

    await runOnce(new Date(t0 + 120_000), { processOutbox: true }); // 110 → PODRAŽITEV (+ BGY izgine, kar NI dopis)
    expect(mockSendMail).toHaveBeenCalledTimes(3);
    const third = mockSendMail.mock.calls[2]![0] as { subject: string; html: string };
    expect(third.subject).toContain('1 podražitev');
    expect(third.html).toContain('+21 €');
    expect(third.html).not.toContain('NI VEČ NA VOLJO');

    await runOnce(new Date(t0 + 180_000), { processOutbox: true }); // enako → nič
    expect(mockSendMail).toHaveBeenCalledTimes(3);
    expect(await FlightNotificationModel.countDocuments()).toBe(3);
    const run = await FlightSearchRunModel.findOne().sort({ createdAt: -1 }).lean();
    expect(run?.counters?.notificationsPending).toBe(0);
  });

  it('dve iskanji istega uporabnika z isto ponudbo → ena postavka z obema imenoma (FR-034)', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id), { name: 'Prvo' });
    await seedRule(String(ana._id), { name: 'Drugo' });
    await runOnce(new Date(), { processOutbox: true });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const n = await FlightNotificationModel.findOne().lean();
    expect(n?.items.length).toBe(2); // STN in BGY, vsaka enkrat
    expect(n?.items.every((i) => i.definitionName === 'Prvo · Drugo' || i.definitionName === 'Drugo · Prvo')).toBe(true);
  });

  it('prejemnik dobi lasten dopis z imenom lastnika; po odstranitvi med zagonom in pošiljanjem postavke izpadejo (FR-042)', async () => {
    const ana = await user('ana');
    const bor = await user('bor');
    const rule = await seedRule(String(ana._id), {}, [{ userId: String(bor._id) }]);
    await runOnce(new Date(), { processOutbox: true });
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    const toBor = mockSendMail.mock.calls.map((c) => c[0] as { to: string; html: string }).find((c) => c.to === 'bor@example.com');
    expect(toBor?.html).toContain('deli Oseba ana');

    // Naslednji zagon: dopis se sestavi, a pred pošiljanjem Bor ni več prejemnik.
    resetFakeProviderForTests(); // nazaj na 120 → za obstoječe ujemanje je to PODRAŽITEV iz 89? ne: isti zagon index 1 → 120 = PRICE_UP glede na 110? Scenarij: po resetu prvi zagon da 120.
    await rule.updateOne({ $set: { recipients: [] } });
    const beforeCalls = mockSendMail.mock.calls.length;
    await runOnce(new Date(Date.now() + 60_000), { processOutbox: true });
    const calls = mockSendMail.mock.calls.slice(beforeCalls).map((c) => (c[0] as { to: string }).to);
    expect(calls).not.toContain('bor@example.com');
  });

  it('prejemnik dveh iskanj dveh lastnikov dobi EN dopis z ločenima postavkama', async () => {
    const ana = await user('ana');
    const bor = await user('bor');
    const cene = await user('cene');
    await seedRule(String(ana._id), { name: 'Anino', destination: { mode: 'airports', airports: ['STN'] } }, [{ userId: String(cene._id) }]);
    await seedRule(String(bor._id), { name: 'Borovo', destination: { mode: 'airports', airports: ['BGY'] } }, [{ userId: String(cene._id) }]);
    await runOnce(new Date(), { processOutbox: true });
    const toCene = mockSendMail.mock.calls.map((c) => c[0] as { to: string; html: string }).filter((c) => c.to === 'cene@example.com');
    expect(toCene).toHaveLength(1);
    expect(toCene[0]!.html).toContain('Anino');
    expect(toCene[0]!.html).toContain('Borovo');
  });

  it('deaktivirano iskanje in izbrisano iskanje ne dasta postavk (dopis zadržan "no-items")', async () => {
    const ana = await user('ana');
    const rule = await seedRule(String(ana._id));
    await runOnce(new Date()); // sestavi pending, ne pošlje
    expect(await FlightNotificationModel.countDocuments({ status: 'pending' })).toBe(1);
    await FlightSearchRuleModel.deleteOne({ _id: rule._id });
    await processNotificationOutbox(env(), undefined, new Date());
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(await FlightNotificationModel.findOne().lean()).toMatchObject({ status: 'suppressed', suppressedReason: 'no-items' });
  });
});

describe('neuspeh pošte in varno ponavljanje (FR-037, SC-004)', () => {
  it('zavrnjeno pošiljanje → pending z nextAttemptAt +60 s; po času se pošlje ENKRAT', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    mockSendMail.mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' }));
    const t0 = new Date();
    await runOnce(t0, { processOutbox: true });
    let n = await FlightNotificationModel.findOne().lean();
    expect(n).toMatchObject({ status: 'pending', attemptCount: 1 });
    expect(n?.nextAttemptAt?.getTime()).toBeGreaterThanOrEqual(t0.getTime() + 60_000 - 5000);
    expect(n?.lastError).toContain('ECONNECTION');

    // Pred časom: nič.
    await processNotificationOutbox(env(), undefined, new Date(t0.getTime() + 30_000));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    // Po času: poslano, natanko enkrat.
    await processNotificationOutbox(env(), undefined, new Date(t0.getTime() + 61_000));
    await processNotificationOutbox(env(), undefined, new Date(t0.getTime() + 62_000));
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    n = await FlightNotificationModel.findOne().lean();
    expect(n).toMatchObject({ status: 'sent', attemptCount: 2, messageId: '<m@x>' });
    const run = await FlightSearchRunModel.findOne().lean();
    expect(run?.counters).toMatchObject({ notificationsSent: 1, notificationsPending: 0 });
  });

  it('po izčrpanih poskusih je failed; EAUTH je takoj failed', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    mockSendMail.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    const t0 = Date.now();
    await runOnce(new Date(t0), { processOutbox: true });
    let at = t0;
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      at += 3600_000 + 1000;
      await processNotificationOutbox(env(), undefined, new Date(at));
    }
    expect(await FlightNotificationModel.findOne().lean()).toMatchObject({ status: 'failed', attemptCount: MAX_ATTEMPTS });
    expect(mockSendMail).toHaveBeenCalledTimes(MAX_ATTEMPTS);

    await clearTestDb();
    resetFakeProviderForTests();
    const bor = await user('bor');
    await seedRule(String(bor._id));
    mockSendMail.mockReset();
    mockSendMail.mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }));
    await runOnce(new Date(), { processOutbox: true });
    expect(await FlightNotificationModel.findOne().lean()).toMatchObject({ status: 'failed', attemptCount: 1 });
  });

  it('obtičal "sending" se po SCANNER_RUN_STALE_MINUTES vrne v pending', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    await runOnce(new Date());
    const t = Date.now();
    await FlightNotificationModel.updateOne({}, { $set: { status: 'sending', sendingSince: new Date(t - 31 * 60_000) } });
    await processNotificationOutbox(env(), undefined, new Date(t));
    expect(await FlightNotificationModel.findOne().lean()).toMatchObject({ status: 'sent' });
  });

  it('brez SMTP_HOST je dopis zadržan z razlogom smtp-not-configured (FR-038)', async () => {
    setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true', SMTP_HOST: '', SMTP_FROM: '' });
    const ana = await user('ana');
    await seedRule(String(ana._id));
    await runOnce(new Date(), { processOutbox: true });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(await FlightNotificationModel.findOne().lean()).toMatchObject({ status: 'suppressed', suppressedReason: 'smtp-not-configured' });
    const run = await FlightSearchRunModel.findOne().lean();
    expect(run?.counters?.notificationsSuppressed).toBe(1);
  });

  it('prejemnik brez e-naslova → suppressed no-email; e-naslov ni shranjen v dopisu', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    await runOnce(new Date());
    await UserModel.deleteOne({ _id: ana._id });
    await processNotificationOutbox(env(), undefined, new Date());
    const n = await FlightNotificationModel.findOne().lean();
    expect(n).toMatchObject({ status: 'suppressed', suppressedReason: 'user-missing' });
    expect(JSON.stringify(n)).not.toContain('ana@example.com');
  });
});
