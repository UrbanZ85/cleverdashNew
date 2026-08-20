import { Router } from 'express';
import { z } from 'zod';
import { DeviceModel } from './device.model.js';
import { DEFAULT_CHANNELS, isKnownChannel } from './channels.js';
import { sendPush } from './fcm.service.js';
import { recordSendOutcome } from './token-cleanup.service.js';
import { requireScopes } from '../auth/scopes.js';
import { notFound } from '../errors/problem.js';

export const notificationsRouter = Router();

function toDeviceResponse(device: {
  _id: unknown;
  platform: string;
  channels: string[];
  lastSeenAt: Date;
  lastDeliveryAt?: Date | null;
}) {
  return {
    id: String(device._id),
    platform: device.platform,
    channels: device.channels,
    lastSeenAt: device.lastSeenAt,
    lastDeliveryAt: device.lastDeliveryAt,
  };
}

notificationsRouter.get('/devices', requireScopes(), async (req, res, next) => {
  try {
    const devices = await DeviceModel.find({ userId: req.auth!.subjectId }).lean();
    res.json(devices.map(toDeviceResponse));
  } catch (err) {
    next(err);
  }
});

const registerSchema = z.object({
  pushToken: z.string().min(1),
  platform: z.enum(['web', 'android']),
  channels: z.array(z.string()).optional(),
});

notificationsRouter.post('/devices', requireScopes(), async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const channels = (body.channels ?? DEFAULT_CHANNELS).filter(isKnownChannel);

    // FR-030: ponovna registracija istega žetona posodobi obstoječi zapis — upsert po
    // pushToken, ne dvojni vnos za isto napravo.
    const device = await DeviceModel.findOneAndUpdate(
      { pushToken: body.pushToken },
      {
        userId: req.auth!.subjectId,
        pushToken: body.pushToken,
        platform: body.platform,
        channels: channels.length > 0 ? channels : DEFAULT_CHANNELS,
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true },
    );

    res.status(201).json(toDeviceResponse(device));
  } catch (err) {
    next(err);
  }
});

notificationsRouter.delete('/devices/:deviceId', requireScopes(), async (req, res, next) => {
  try {
    const result = await DeviceModel.deleteOne({ _id: req.params.deviceId, userId: req.auth!.subjectId });
    if (result.deletedCount === 0) {
      next(notFound('Naprava ne obstaja.'));
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const testNotificationSchema = z.object({
  deviceId: z.string().optional(),
  deepLink: z.string().optional(),
});

notificationsRouter.post('/notifications/test', requireScopes(), async (req, res, next) => {
  try {
    const body = testNotificationSchema.parse(req.body ?? {});
    const filter = body.deviceId
      ? { _id: body.deviceId, userId: req.auth!.subjectId }
      : { userId: req.auth!.subjectId };
    const devices = await DeviceModel.find(filter);

    let accepted = 0;
    let removedTokens = 0;
    for (const device of devices) {
      const result = await sendPush(device.pushToken, {
        title: 'CleverDash',
        body: 'Testno obvestilo.',
        deepLink: body.deepLink,
      });
      const outcome = await recordSendOutcome(String(device._id), result);
      if (outcome === 'removed') removedTokens += 1;
      else if (result.success) accepted += 1;
    }

    res.status(202).json({ accepted, removedTokens });
  } catch (err) {
    next(err);
  }
});
