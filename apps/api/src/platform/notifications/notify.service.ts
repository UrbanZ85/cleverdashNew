import { DeviceModel } from './device.model.js';
import { sendPush } from './fcm.service.js';
import { recordSendOutcome } from './token-cleanup.service.js';
import { NotificationRecordModel } from './notification-record.model.js';
import { channelForNotificationType } from './channels.js';

// 002, research.md §6: PONOVNA UPORABA mehanizma iz 001 — ni novega kanala, samo nove
// vrste obvestil in trajno beleženje dostave (FR-072), ki ga 001 ni imela. En klic od tod
// naslovi vse registrirane naprave, ki imajo ustrezen kanal vklopljen (FR-071).

export interface NotifyParams {
  type: 'reminder' | 'confirmation' | 'failure' | 'health' | 'session';
  title: string;
  body: string;
  plannedActionId?: string;
  /** FR-073/FR-074: en dedupeKey na (plannedActionId, tip, interval opozarjanja) —
   * preprečuje dve vsebinsko enaki obvestili za isto akcijo v istem intervalu. */
  dedupeKey: string;
  deepLink?: string;
}

export async function notify(params: NotifyParams): Promise<void> {
  const alreadySent = await NotificationRecordModel.exists({ dedupeKey: params.dedupeKey });
  if (alreadySent) return;

  const channel = channelForNotificationType(params.type);
  const devices = await DeviceModel.find({ channels: channel });

  if (devices.length === 0) {
    await NotificationRecordModel.create({
      type: params.type,
      title: params.title,
      body: params.body,
      plannedActionId: params.plannedActionId ?? null,
      deliveryStatus: 'suppressed',
      dedupeKey: params.dedupeKey,
    });
    return;
  }

  for (const device of devices) {
    const result = await sendPush(device.pushToken, {
      title: params.title,
      body: params.body,
      deepLink: params.deepLink,
    });
    await recordSendOutcome(String(device._id), result);
    await NotificationRecordModel.create({
      type: params.type,
      title: params.title,
      body: params.body,
      deviceId: device._id,
      plannedActionId: params.plannedActionId ?? null,
      deliveryStatus: result.success ? 'sent' : 'failed',
      error: result.errorCode ?? null,
      dedupeKey: params.dedupeKey,
    });
  }
}
