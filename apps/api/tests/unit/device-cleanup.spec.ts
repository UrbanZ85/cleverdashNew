import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';
import { DeviceModel } from '../../src/platform/notifications/device.model.js';
import { recordSendOutcome } from '../../src/platform/notifications/token-cleanup.service.js';

// FR-034: UNREGISTERED/INVALID_ARGUMENT je signal za brisanje; prehodna napaka poveča
// failureCount in zapis obdrži.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedDevice() {
  // 004: User nima več passwordHash — keycloakSubject je zdaj primarni identifikator.
  const user = await UserModel.create({
    keycloakSubject: 'kc-sub-device-test',
    email: 'u@example.com',
    displayName: 'Test uporabnik',
  });
  return DeviceModel.create({ userId: user._id, pushToken: 'tok-1', platform: 'android' });
}

describe('recordSendOutcome (FR-034)', () => {
  it('messaging/registration-token-not-registered IZBRIŠE zapis naprave', async () => {
    const device = await seedDevice();
    const outcome = await recordSendOutcome(String(device._id), {
      success: false,
      errorCode: 'messaging/registration-token-not-registered',
    });
    expect(outcome).toBe('removed');
    expect(await DeviceModel.findById(device._id)).toBeNull();
  });

  it('messaging/invalid-argument IZBRIŠE zapis naprave', async () => {
    const device = await seedDevice();
    const outcome = await recordSendOutcome(String(device._id), {
      success: false,
      errorCode: 'messaging/invalid-argument',
    });
    expect(outcome).toBe('removed');
    expect(await DeviceModel.findById(device._id)).toBeNull();
  });

  it('prehodna napaka (npr. messaging/internal-error) POVEČA failureCount, zapis ostane', async () => {
    const device = await seedDevice();
    const outcome = await recordSendOutcome(String(device._id), {
      success: false,
      errorCode: 'messaging/internal-error',
    });
    expect(outcome).toBe('kept');
    const reloaded = await DeviceModel.findById(device._id).lean();
    expect(reloaded).not.toBeNull();
    expect(reloaded?.failureCount).toBe(1);
  });

  it('uspešna dostava ponastavi failureCount na 0 in zabeleži lastDeliveryAt', async () => {
    const device = await seedDevice();
    await recordSendOutcome(String(device._id), { success: false, errorCode: 'messaging/internal-error' });
    await recordSendOutcome(String(device._id), { success: true });
    const reloaded = await DeviceModel.findById(device._id).lean();
    expect(reloaded?.failureCount).toBe(0);
    expect(reloaded?.lastDeliveryAt).not.toBeNull();
  });
});
