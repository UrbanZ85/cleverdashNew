import { DeviceModel } from './device.model.js';
import { isUnregisteredError, type SendResult } from './fcm.service.js';

// FR-034: zavrnitev ponudnika z UNREGISTERED/INVALID_ARGUMENT je signal za BRISANJE
// zapisa naprave, ne za ponovni poskus. Prehodna napaka poveča `failureCount` in se
// ponovi ob naslednjem pošiljanju — brez brisanja, ker naprava morda samo nima signala.
export async function recordSendOutcome(
  deviceId: string,
  result: SendResult,
): Promise<'removed' | 'kept'> {
  if (result.success) {
    await DeviceModel.updateOne({ _id: deviceId }, { lastDeliveryAt: new Date(), failureCount: 0 });
    return 'kept';
  }

  if (isUnregisteredError(result.errorCode)) {
    await DeviceModel.deleteOne({ _id: deviceId });
    return 'removed';
  }

  await DeviceModel.updateOne({ _id: deviceId }, { $inc: { failureCount: 1 } });
  return 'kept';
}
