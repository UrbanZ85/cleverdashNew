import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types, mongo } from 'mongoose';
import { startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { ScannerTypeSettingsModel } from '../../../src/platform/scanner/models/scanner-type-settings.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerResultHistoryModel } from '../../../src/platform/scanner/models/scanner-result-history.model.js';
import { ScannerNotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';

// data-model.md (016) §Indeksi: unikatni indeksi so zapore pred podvajanjem (člen V.3), TTL indeksi
// so rok hrambe (FR-019, FR-025). Vzorec tests/integration/flight-deals/indexes.spec.ts.

const ALL = [ScannerDefinitionModel, ScannerTypeSettingsModel, ScannerRunModel, ScannerResultModel, ScannerResultHistoryModel, ScannerNotificationModel];

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
  await Promise.all(ALL.map((m) => m.syncIndexes()));
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

const key = (k: Record<string, number>) => JSON.stringify(k);

describe('indeksi jedra skenerjev', () => {
  it('unikatni: slotKey, (definitionId, identityKey), (recipientUserId, runId), type', async () => {
    expect((await indexesOf(ScannerRunModel)).find((i) => key(i.key) === key({ slotKey: 1 }))?.unique).toBe(true);
    expect((await indexesOf(ScannerResultModel)).find((i) => key(i.key) === key({ definitionId: 1, identityKey: 1 }))?.unique).toBe(true);
    expect((await indexesOf(ScannerNotificationModel)).find((i) => key(i.key) === key({ recipientUserId: 1, runId: 1 }))?.unique).toBe(true);
    expect((await indexesOf(ScannerTypeSettingsModel)).find((i) => key(i.key) === key({ type: 1 }))?.unique).toBe(true);
  });

  it('TTL na expiresAt pri zagonih, rezultatih, zgodovini in dopisih', async () => {
    for (const model of [ScannerRunModel, ScannerResultModel, ScannerResultHistoryModel, ScannerNotificationModel]) {
      const ttl = (await indexesOf(model)).find((i) => key(i.key) === key({ expiresAt: 1 }));
      expect(ttl?.expireAfterSeconds, model.modelName).toBe(0);
    }
  });

  it('definicije: (userId, updatedAt), (type, enabled); zagoni: scope.definitionId', async () => {
    const def = (await indexesOf(ScannerDefinitionModel)).map((i) => key(i.key));
    expect(def).toContain(key({ userId: 1, updatedAt: -1 }));
    expect(def).toContain(key({ type: 1, enabled: 1 }));
    const run = (await indexesOf(ScannerRunModel)).map((i) => key(i.key));
    expect(run).toContain(key({ 'scope.definitionId': 1, createdAt: -1 }));
    expect(run).toContain(key({ scannerType: 1, createdAt: -1 }));
  });

  it('dvojnik slotKey in dvojnik (definitionId, identityKey) padeta na indeksu (E11000)', async () => {
    const now = new Date();
    const run = {
      scannerType: 'mock',
      scope: { kind: 'type' },
      slotKey: 'schedule:type:mock:x',
      trigger: 'schedule',
      createdAt: now,
      heartbeatAt: now,
      expiresAt: now,
    };
    await ScannerRunModel.create(run);
    await expect(ScannerRunModel.create(run)).rejects.toMatchObject({ code: 11000 });

    const definitionId = new Types.ObjectId();
    const result = {
      definitionId,
      userId: new Types.ObjectId(),
      scannerType: 'mock',
      identityKey: 'dup',
      source: 'mock',
      title: 'x',
      dataAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      lastCheckedAt: now,
      lastChangeType: 'NEW',
      expiresAt: now,
    };
    await ScannerResultModel.create(result);
    await expect(ScannerResultModel.create(result)).rejects.toMatchObject({ code: 11000 });
    // Isti identityKey pri DRUGEM skenerju je dovoljen — rezultat je last skenerja.
    await expect(ScannerResultModel.create({ ...result, definitionId: new Types.ObjectId() })).resolves.toBeTruthy();
  });
});
