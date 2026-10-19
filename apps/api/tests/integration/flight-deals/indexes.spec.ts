import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mongo } from 'mongoose';
import { startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightOfferModel } from '../../../src/modules/flight-deals/models/flight-offer.model.js';
import { FlightSearchMatchModel } from '../../../src/modules/flight-deals/models/flight-search-match.model.js';
import { FlightSearchRunModel } from '../../../src/modules/flight-deals/models/flight-search-run.model.js';
import { FlightNotificationModel } from '../../../src/modules/flight-deals/models/flight-notification.model.js';
import { FlightOfferHistoryModel } from '../../../src/modules/flight-deals/models/flight-offer-history.model.js';
import { FlightSearchRuleModel } from '../../../src/modules/flight-deals/models/flight-search-rule.model.js';

// data-model.md §Indeksi: unikatni indeksi so zapore pred podvajanjem (člen V.3), TTL indeksi so
// rok hrambe (FR-029, FR-052). Ta test preverja, da obstajajo — rok, ki ga nihče ne uveljavlja, je
// napaka, ki jo to zaledje drugje že ima (SCREENSHOT_RETENTION_DAYS).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
  await Promise.all(
    [FlightOfferModel, FlightSearchMatchModel, FlightSearchRunModel, FlightNotificationModel, FlightOfferHistoryModel, FlightSearchRuleModel].map((m) =>
      m.syncIndexes(),
    ),
  );
});
afterAll(stopTestDb);

interface IndexRow {
  key: Record<string, number>;
  unique?: boolean;
  expireAfterSeconds?: number;
}

async function indexesOf(model: { collection: mongo.Collection }): Promise<IndexRow[]> {
  return (await model.collection.indexes()) as unknown as IndexRow[];
}

describe('indeksi modula Leti', () => {
  it('unikatni: identityKey, (ruleId, offerId), slotKey, (recipientUserId, runId)', async () => {
    const offer = await indexesOf(FlightOfferModel);
    expect(offer.find((i) => JSON.stringify(i.key) === JSON.stringify({ identityKey: 1 }))?.unique).toBe(true);
    const match = await indexesOf(FlightSearchMatchModel);
    expect(match.find((i) => JSON.stringify(i.key) === JSON.stringify({ ruleId: 1, offerId: 1 }))?.unique).toBe(true);
    const run = await indexesOf(FlightSearchRunModel);
    expect(run.find((i) => JSON.stringify(i.key) === JSON.stringify({ slotKey: 1 }))?.unique).toBe(true);
    const notif = await indexesOf(FlightNotificationModel);
    expect(notif.find((i) => JSON.stringify(i.key) === JSON.stringify({ recipientUserId: 1, runId: 1 }))?.unique).toBe(true);
  });

  it('TTL na expiresAt pri ponudbah, ujemanjih, zgodovini, zagonih in dopisih', async () => {
    for (const model of [FlightOfferModel, FlightSearchMatchModel, FlightOfferHistoryModel, FlightSearchRunModel, FlightNotificationModel]) {
      const idx = await indexesOf(model);
      const ttl = idx.find((i) => JSON.stringify(i.key) === JSON.stringify({ expiresAt: 1 }));
      expect(ttl?.expireAfterSeconds, model.modelName).toBe(0);
    }
  });

  it('iskanja: (userId, updatedAt) in recipients.userId; ujemanja: (ruleOwnerId, lastChangeAt)', async () => {
    const rule = (await indexesOf(FlightSearchRuleModel)).map((i) => JSON.stringify(i.key));
    expect(rule).toContain(JSON.stringify({ userId: 1, updatedAt: -1 }));
    expect(rule).toContain(JSON.stringify({ 'recipients.userId': 1 }));
    const match = (await indexesOf(FlightSearchMatchModel)).map((i) => JSON.stringify(i.key));
    expect(match).toContain(JSON.stringify({ ruleOwnerId: 1, lastChangeAt: -1 }));
  });

  it('dvojnik identityKey in dvojnik slotKey padeta na indeksu (E11000)', async () => {
    const now = new Date();
    const base = {
      providerId: 'fake',
      airline: 'FR',
      origin: 'LJU',
      destination: 'STN',
      outbound: { departureAt: now, arrivalAt: null, flightNumbers: [], stops: 0 },
      inbound: null,
      price: { amount: 1, currency: 'EUR' },
      passengers: { adults: 1, children: 0 },
      dataAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      lastCheckedAt: now,
      lastQueryKey: 'k',
      expiresAt: new Date(now.getTime() + 1000),
    };
    await FlightOfferModel.create({ ...base, identityKey: 'dup' });
    await expect(FlightOfferModel.create({ ...base, identityKey: 'dup' })).rejects.toMatchObject({ code: 11000 });
    const run = { slotKey: 'schedule:x', trigger: 'schedule', createdAt: now, heartbeatAt: now, expiresAt: now };
    await FlightSearchRunModel.create(run);
    await expect(FlightSearchRunModel.create(run)).rejects.toMatchObject({ code: 11000 });
  });
});
