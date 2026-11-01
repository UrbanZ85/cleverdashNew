import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { resetScannerTypesForTests } from '../../../src/platform/scanner/registry.js';
import { registerFlightScannerType } from '../../../src/modules/flight-deals/scanner/index.js';
import { registerLegoScannerType } from '../../../src/modules/lego-scanner/index.js';
import { runScannerTick, stopScannerSchedulerForTests } from '../../../src/platform/scanner/services/tick.js';
import { resetUnavailableLogForTests } from '../../../src/platform/scanner/services/scheduler.service.js';
import { AUTH, loginAs, seedDefinition } from '../../contract/scanner/_helpers.js';

// 019 (FR-031): odstranitev tipa `collectibles` = brisanje mape modula, vrstic registracije v `main.ts` in
// usmerjevalnika. Simulirano z registrom brez zbirateljskega tipa: jedro, leti in LEGO tečejo naprej,
// obstoječi skenerji so označeni kot "tip ni na voljo", ne izvajajo se, lahko pa se izbrišejo.

beforeAll(async () => {
  setTestEnv({ COLLECTIBLES_FAKE_SOURCE_ENABLED: 'false' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  stopScannerSchedulerForTests();
  resetUnavailableLogForTests();
  await clearTestDb();
});

describe('odstranitev tipa collectibles', () => {
  it('brez registracije tipa ni; obstoječe iskanje je označeno, se ne izvaja in ga je mogoče izbrisati; lego in leti ostanejo', async () => {
    const { app } = await createApp();
    const ana = await loginAs(app, 'ana');
    const def = await seedDefinition(ana.userId, 'collectibles', { name: 'Sirota', config: { category: 'trading-cards', keywords: 'Charizard' } });

    // "Brisanje vrstice v main.ts": register brez zbirateljskega tipa.
    resetScannerTypesForTests();
    registerFlightScannerType();
    registerLegoScannerType();

    const types = await request(app).get('/api/v1/scanners/types').set(AUTH(ana.token));
    expect(types.body.types.map((t: { type: string }) => t.type).sort()).toEqual(['flights', 'lego']);

    const list = await request(app).get('/api/v1/scanners').set(AUTH(ana.token));
    expect(list.body.scanners).toHaveLength(1);
    expect(list.body.scanners[0]).toMatchObject({ id: String(def._id), typeAvailable: false, typeLabel: 'collectibles' });
    expect(list.body.scanners[0].schedule.nextRunAt).toBeNull();

    const tick = await runScannerTick(loadEnv(), getLogger(loadEnv()), new Date('2026-10-21T10:05:00Z'));
    expect(await ScannerRunModel.countDocuments({ 'scope.definitionId': def._id })).toBe(0);
    expect(tick).not.toBeNull();

    expect((await request(app).post(`/api/v1/scanners/${def._id}/run`).set(AUTH(ana.token))).status).toBe(400);
    expect((await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({ config: { keywords: 'x' } })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({ name: 'Preimenovan' })).status).toBe(200);
    expect((await request(app).delete(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token))).body).toEqual({ deleted: true });
    expect((await request(app).get('/api/v1/scanners').set(AUTH(ana.token))).body.scanners).toEqual([]);
  });
});
