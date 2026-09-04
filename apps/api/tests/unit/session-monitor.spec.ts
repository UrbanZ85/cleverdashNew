import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// Story 8 (US8), FR-063: opozorilo pride najmanj 7 dni pred iztekom, tudi ob 3 in 1 dnevu.

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('firebase-admin', () => ({
  default: {
    initializeApp: vi.fn(() => ({ messaging: () => ({ send: mockSend }) })),
    credential: { applicationDefault: vi.fn(() => ({})) },
  },
}));

const { checkSessionExpiry, daysUntilExpiry } = await import(
  '../../src/modules/time-tracking/services/session-monitor.service.js'
);
const { RemoteSessionModel } = await import('../../src/modules/time-tracking/models/remote-session.model.js');
const { NotificationRecordModel } = await import('../../src/platform/notifications/notification-record.model.js');
const { DeviceModel } = await import('../../src/platform/notifications/device.model.js');

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(() => {
  mockSend.mockReset();
  return clearTestDb();
});
afterAll(stopTestDb);

describe('daysUntilExpiry', () => {
  it('zaokroži navzdol na cele dni v Europe/Ljubljana', () => {
    const now = new Date('2026-08-18T10:00:00Z');
    const in7days = new Date('2026-08-25T10:00:00Z');
    expect(daysUntilExpiry(in7days, now)).toBe(7);
  });
});

describe('checkSessionExpiry — pragovi 7/3/1 dan (FR-063)', () => {
  it.each([7, 3, 1])('pošlje opozorilo, ko preostane natanko %i dni', async (days) => {
    mockSend.mockResolvedValue('id');
    await DeviceModel.create({ userId: '000000000000000000000001', pushToken: 't', platform: 'android', channels: ['reminders'] });
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    await RemoteSessionModel.create({
      userId: '000000000000000000000001',
      name: 'seja',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'e.test',
      expiresAt,
    });

    await checkSessionExpiry();

    const notification = await NotificationRecordModel.findOne({ type: 'session' }).lean();
    expect(notification).not.toBeNull();
    expect(notification?.deliveryStatus).toBe('sent');
  });

  it('ne opozori, če do izteka ostane 5 dni (ni med pragovi)', async () => {
    const expiresAt = new Date(Date.now() + 5 * 86_400_000);
    await RemoteSessionModel.create({
      userId: '000000000000000000000001',
      name: 'seja',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'e.test',
      expiresAt,
    });

    await checkSessionExpiry();

    const notification = await NotificationRecordModel.findOne({ type: 'session' }).lean();
    expect(notification).toBeNull();
  });

  it('posodobi status na "expired", ko je rok prekoračen', async () => {
    const expiresAt = new Date(Date.now() - 86_400_000);
    const session = await RemoteSessionModel.create({
      userId: '000000000000000000000001',
      name: 'seja',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'e.test',
      expiresAt,
      status: 'active',
    });

    await checkSessionExpiry();

    const updated = await RemoteSessionModel.findById(session._id).lean();
    expect(updated?.status).toBe('expired');
  });
});
