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
import { runScannerTick, stopScannerSchedulerForTests } from '../../../src/platform/scanner/services/tick.js';
import { resetUnavailableLogForTests } from '../../../src/platform/scanner/services/scheduler.service.js';
import { AUTH, loginAs, seedDefinition } from '../../contract/scanner/_helpers.js';

// SC-004, US6: odstranitev tipa `echo` = brisanje mape in vrstice `registerEchoScannerType()` v main.ts.
// Simulirano z registrom brez echo: jedro in leti tečejo naprej, obstoječi echo skenerji so označeni
// kot "tip ni na voljo", ne izvajajo se, lahko pa se izbrišejo (FR-011, FR-051).

beforeAll(async () => {
  setTestEnv({ SCANNER_ECHO_ENABLED: 'true' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  stopScannerSchedulerForTests();
  resetUnavailableLogForTests();
  await clearTestDb();
});

describe('odstranitev testnega tipa echo', () => {
  it('brez registracije echo ni med tipi; obstoječi skener je označen, se ne izvaja in ga je mogoče izbrisati; leti ostanejo', async () => {
    const { app } = await createApp();
    const ana = await loginAs(app, 'ana');
    const def = await seedDefinition(ana.userId, 'echo', { name: 'Sirota echo', config: { items: 2, label: 'X' } });

    // "Brisanje vrstice v main.ts": register brez echo, leti ostanejo.
    resetScannerTypesForTests();
    registerFlightScannerType();

    const types = await request(app).get('/api/v1/scanners/types').set(AUTH(ana.token));
    expect(types.body.types.map((t: { type: string }) => t.type)).toEqual(['flights']);

    const list = await request(app).get('/api/v1/scanners').set(AUTH(ana.token));
    expect(list.body.scanners).toHaveLength(1);
    expect(list.body.scanners[0]).toMatchObject({ id: String(def._id), typeAvailable: false, typeLabel: 'echo' });
    expect(list.body.scanners[0].schedule.nextRunAt).toBeNull();

    const tick = await runScannerTick(loadEnv(), getLogger(loadEnv()), new Date('2026-10-19T10:05:00Z'));
    expect(await ScannerRunModel.countDocuments({ 'scope.definitionId': def._id })).toBe(0);
    expect(tick).not.toBeNull();

    expect((await request(app).post(`/api/v1/scanners/${def._id}/run`).set(AUTH(ana.token))).status).toBe(400);
    expect((await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({ config: { items: 1 } })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({ name: 'Preimenovan' })).status).toBe(200);
    expect((await request(app).delete(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token))).body).toEqual({ deleted: true });
    expect((await request(app).get('/api/v1/scanners').set(AUTH(ana.token))).body.scanners).toEqual([]);
  });
});
