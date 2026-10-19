import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { ScannerNotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { runScannerTick, stopScannerSchedulerForTests } from '../../../src/platform/scanner/services/tick.js';
import { AUTH, loginAs } from '../../contract/scanner/_helpers.js';

// FR-046, SC-004 (US5, US6): testni tip `echo` od ustvarjanja prek API-ja do dopisov — štirje zagoni
// po urniku dajo NEW → UNCHANGED → PRICE_DOWN → UNAVAILABLE z dopisi 1, 0, 1, 0 (quickstart.md §3).
// Brez SMTP so dopisi `suppressed`, a štejejo: nastanejo samo, kadar je bilo kaj za sporočiti.

beforeAll(async () => {
  setTestEnv({ SCANNER_ECHO_ENABLED: 'true' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  stopScannerSchedulerForTests();
  await clearTestDb();
});

let app: Express;
const env = () => loadEnv();
const logger = () => getLogger(loadEnv());

describe('echo od konca do konca', () => {
  it('ustvarjen prek API-ja z urnikom vsako uro; štirje tiki ob terminih; rezultati, zgodovina, dopisi', async () => {
    app = (await createApp()).app;
    const ana = await loginAs(app, 'ana');
    const types = await request(app).get('/api/v1/scanners/types').set(AUTH(ana.token));
    expect(types.body.types.find((t: { type: string }) => t.type === 'echo')).toMatchObject({ enabled: true, available: true, label: 'Echo (testni)' });

    const created = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send({ name: 'Moj echo', type: 'echo', schedule: { preset: 'hourly' }, config: { items: 3 } });
    expect(created.status).toBe(201);
    expect(created.body.config).toEqual({ items: 3, label: 'Echo' });
    const id = created.body.id as string;
    // Pokrito do zdaj: termini pred nastankom se ne dohitevajo.
    await ScannerDefinitionModel.updateOne({ _id: id }, { $set: { 'schedule.lastScheduledSlotAt': new Date('2026-10-19T09:30:00Z') } });

    const ticks = [new Date('2026-10-19T10:05:00Z'), new Date('2026-10-19T11:05:00Z'), new Date('2026-10-19T12:05:00Z'), new Date('2026-10-19T13:05:00Z')];
    const expected = [
      { lastChange: ['NEW', 'NEW', 'NEW'], notifications: 1, newCount: 3 },
      { lastChange: ['UNCHANGED', 'UNCHANGED', 'UNCHANGED'], notifications: 0, newCount: 0 },
      { lastChange: ['PRICE_DOWN', 'UNCHANGED', 'UNCHANGED'], notifications: 1, newCount: 0 },
      { lastChange: ['UNCHANGED', 'UNCHANGED', 'UNAVAILABLE'], notifications: 0, newCount: 0 },
    ];
    for (let i = 0; i < ticks.length; i += 1) {
      // Tik lahko ob istem terminu ustvari tudi zagon tipa `flights` (registriran v createApp); tu štejemo zagone TEGA skenerja.
      await runScannerTick(env(), logger(), ticks[i]!);
      expect(await ScannerRunModel.countDocuments({ 'scope.definitionId': new Types.ObjectId(id) }), `tik ${i + 1}`).toBe(i + 1);
      const run = await ScannerRunModel.findOne({ 'scope.definitionId': new Types.ObjectId(id) }).sort({ createdAt: -1 }).lean();
      expect(run?.status).toBe('succeeded');
      expect(run?.slotKey).toBe(`schedule:def:${id}:2026-10-19T${12 + i}:00+02:00`);
      expect(run?.counters).toMatchObject({ runIndex: i + 1, new: expected[i]!.newCount, definitions: 1 });
      expect(await ScannerNotificationModel.countDocuments({ runId: run!._id }), `dopisi po tiku ${i + 1}`).toBe(expected[i]!.notifications);

      const results = await request(app).get(`/api/v1/scanners/${id}/results?includeUnavailable=true&sort=price`).set(AUTH(ana.token));
      const byTitle = [...(results.body.results as Array<{ title: string; lastChangeType: string }>)].sort((a, b) => a.title.localeCompare(b.title));
      expect(byTitle.map((r) => r.lastChangeType), `stanje po tiku ${i + 1}`).toEqual(expected[i]!.lastChange);
    }

    // Vsi dopisi so brez SMTP zadržani, a so nastali samo ob spremembah (2 od 4 zagonov).
    expect(await ScannerNotificationModel.countDocuments()).toBe(2);
    expect(await ScannerNotificationModel.countDocuments({ status: 'suppressed', suppressedReason: 'smtp-not-configured' })).toBe(2);
    const third = await ScannerNotificationModel.findOne().sort({ createdAt: -1 }).lean();
    expect(third?.items).toHaveLength(1);
    expect(third?.items[0]).toMatchObject({ definitionName: 'Moj echo', changeType: 'PRICE_DOWN', payload: { title: 'Echo #1', price: { amount: 91, currency: 'EUR' }, previousPrice: { amount: 101, currency: 'EUR' } } });

    // Zgodovina prvega rezultata: NEW, UNCHANGED, PRICE_DOWN, UNCHANGED.
    const list = await request(app).get(`/api/v1/scanners/${id}/results?sort=price`).set(AUTH(ana.token));
    const first = (list.body.results as Array<{ id: string; title: string }>).find((r) => r.title === 'Echo #1')!;
    const detail = await request(app).get(`/api/v1/scanners/${id}/results/${first.id}`).set(AUTH(ana.token));
    expect(detail.body.history.map((h: { changeType: string }) => h.changeType)).toEqual(['NEW', 'UNCHANGED', 'PRICE_DOWN', 'UNCHANGED']);
    expect(detail.body).toMatchObject({ url: 'https://example.test/echo/1', change: { type: 'PRICE_DOWN', absolute: -10 } });

    // Stanje skenerja in zagoni skenerja.
    const scanner = await request(app).get(`/api/v1/scanners/${id}`).set(AUTH(ana.token));
    expect(scanner.body).toMatchObject({ resultCount: 2, lastRun: { outcome: 'ok' } });
    const runs = await request(app).get(`/api/v1/scanners/${id}/runs`).set(AUTH(ana.token));
    expect(runs.body.runs).toHaveLength(4);
    expect(runs.body.runs.every((r: { trigger: string; status: string }) => r.trigger === 'schedule' && r.status === 'succeeded')).toBe(true);
  });
});
