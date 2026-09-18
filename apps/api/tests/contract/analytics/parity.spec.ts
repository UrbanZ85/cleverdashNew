import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { resetSnapshotCacheForTests } from '../../../src/modules/analytics/services/snapshot-cache.service.js';
import { AUTH, loginAsAdmin } from './_helpers.js';

// US5 — FR-042, SC-005: vsak podatek z zaslona je dosegljiv tudi s klicem.
//
// Seznami spodaj so NAMENOMA prepisani iz
// `specs/014-admin-analytics/contracts/openapi.yaml`, ne razčlenjeni iz nje. Razlog je isti kot pri
// `apps/web/tests/unit/icons.spec.ts`, kjer so ikone prepisane iz strežniškega registra: pogodba je
// dokument, ki ga piše človek, in test, ki bi jo razčlenil, bi preverjal samo, da se ujema sam s
// sabo. Prepisan seznam se ob spremembi pogodbe pokvari — in to je njegov namen.
//
// Drugi razlog je praktičen: `js-yaml` ni odvisnost `apps/api`, ampak posredna odvisnost drugod v
// drevesu. Test, ki bi jo uvozil, bi se podrl ob prvi spremembi tujega paketa.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  resetSnapshotCacheForTests();
  await clearTestDb();
});

let app: Express;
async function boot(): Promise<Express> {
  app = (await createApp()).app;
  return app;
}

const STORAGE_FIELDS = [
  'computedAt',
  'cachedUntil',
  'totalBytes',
  'sources',
  'byUser',
  'volume',
  'volumeUnavailableReason',
  'integrity',
];

const STORAGE_SOURCE_FIELDS = ['id', 'label', 'present', 'totalBytes', 'recordCount'];
const STORAGE_USER_FIELDS = ['userId', 'displayName', 'maskedEmail', 'totalBytes', 'perSource', 'counts'];
const INTEGRITY_FIELDS = ['checkedAt', 'clean', 'findings'];

const USAGE_FIELDS = ['window', 'coverage', 'logins', 'byUser', 'tabs'];
const USAGE_USER_FIELDS = ['userId', 'displayName', 'maskedEmail', 'logins', 'lastLoginAt', 'lastActiveAt', 'tabs'];
const USAGE_TAB_FIELDS = ['tabId', 'title', 'views', 'users'];

describe('GET /analytics/storage — skladnost s pogodbo', () => {
  it('odgovor nosi vsa polja, ki jih pogodba navaja', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));

    expect(res.status).toBe(200);
    for (const field of STORAGE_FIELDS) expect(res.body, field).toHaveProperty(field);
    for (const field of STORAGE_SOURCE_FIELDS) expect(res.body.sources[0], field).toHaveProperty(field);
    for (const field of STORAGE_USER_FIELDS) expect(res.body.byUser[0], field).toHaveProperty(field);
    for (const field of INTEGRITY_FIELDS) expect(res.body.integrity, field).toHaveProperty(field);
  });

  it('ne uhaja nobeno polje, ki ga pogodba ne pozna', async () => {
    // Polje, ki je v odgovoru in ne v pogodbi, je polje, na katero se bo nekdo zanesel, ne da bi
    // bilo obljubljeno. Pri tem modulu je nevarnost konkretna: v odgovor bi lahko ušel cel e-poštni
    // naslov ali identifikator iz Keycloaka.
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));

    expect(Object.keys(res.body).sort()).toEqual([...STORAGE_FIELDS].sort());
    expect(Object.keys(res.body.sources[0]).sort()).toEqual([...STORAGE_SOURCE_FIELDS].sort());
    expect(Object.keys(res.body.byUser[0]).sort()).toEqual([...STORAGE_USER_FIELDS].sort());
    expect(JSON.stringify(res.body)).not.toContain('keycloakSubject');
    expect(JSON.stringify(res.body)).not.toContain('scopes');
  });
});

describe('GET /analytics/usage — skladnost s pogodbo', () => {
  it('odgovor nosi vsa polja, ki jih pogodba navaja', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/usage?days=7').set(AUTH(admin.token));

    expect(res.status).toBe(200);
    for (const field of USAGE_FIELDS) expect(res.body, field).toHaveProperty(field);
    for (const field of ['days', 'fromDay', 'toDay']) expect(res.body.window, field).toHaveProperty(field);
    for (const field of ['dataSince', 'retentionDays', 'truncated']) {
      expect(res.body.coverage, field).toHaveProperty(field);
    }
    for (const field of ['total', 'activeUsers', 'inactiveUsers']) expect(res.body.logins, field).toHaveProperty(field);
    for (const field of USAGE_USER_FIELDS) expect(res.body.byUser[0], field).toHaveProperty(field);
    for (const field of USAGE_TAB_FIELDS) expect(res.body.tabs[0], field).toHaveProperty(field);
  });

  it('ne uhaja nobeno polje, ki ga pogodba ne pozna', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/usage').set(AUTH(admin.token));

    expect(Object.keys(res.body).sort()).toEqual([...USAGE_FIELDS].sort());
    expect(Object.keys(res.body.byUser[0]).sort()).toEqual([...USAGE_USER_FIELDS].sort());
    expect(Object.keys(res.body.tabs[0]).sort()).toEqual([...USAGE_TAB_FIELDS].sort());
  });

  it('izbira obdobja deluje pri klicu enako kot v vmesniku', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const seven = await request(app).get('/api/v1/analytics/usage?days=7').set(AUTH(admin.token));
    const ninety = await request(app).get('/api/v1/analytics/usage?days=90').set(AUTH(admin.token));
    expect(seven.body.window.fromDay > ninety.body.window.fromDay).toBe(true);
    expect(seven.body.window.toDay).toBe(ninety.body.window.toDay);
  });
});
