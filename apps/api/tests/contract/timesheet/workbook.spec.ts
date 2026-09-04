import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createHash, randomBytes } from 'node:crypto';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import { ApiKeyModel } from '../../../src/platform/apikeys/model.js';

// Pogodbeni test proti specs/006-timesheet/contracts/openapi.yaml.
//
// Bistvo: datoteka se prebere NAZAJ z ExcelJS in preveri po celicah. Preverjanje statusa in
// glave `Content-Type` bi šlo skozi tudi, če bi bila vsebina prazna preglednica — prav to je
// napaka, ki jo je pri prenosu iz izvirne aplikacije najlažje narediti in najtežje opaziti.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

async function loginAdmin(app: Parameters<typeof request>[0]) {
  const { accessToken } = await loginAsTestUser(app as never, fakeKeycloakForTests, {
    roles: ['cleverdash-admin'],
  });
  return accessToken;
}

/** Uporabnik z osnovno vlogo — dokaz, da modul deluje tudi brez `admin` obsega (FR-010). */
async function loginPlainUser(app: Parameters<typeof request>[0]) {
  const { accessToken } = await loginAsTestUser(app as never, fakeKeycloakForTests, {
    sub: 'kc-sub-plain',
    email: 'navadni@example.com',
    name: 'Navadni Uporabnik',
    roles: ['cleverdash-user'],
  });
  return accessToken;
}

const MARCH: Record<string, unknown> = {
  year: 2026,
  month: 3,
  fullName: 'Testna Oseba',
  weeklyWorkHours: 40,
};

async function readWorkbook(body: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(body);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Odgovor ni preglednica z delovnim listom.');
  return ws;
}

/**
 * Celico s časovno obliko ExcelJS ob branju pretvori nazaj v `Date` z Excelovim izhodiščem
 * (1899-12-30), zapisana pa je kot delež dneva. Ta pomočnik oboje spravi na isti imenovalec,
 * da trditev pove, kaj bo videl uporabnik, ne kako je ExcelJS shranil vrednost.
 */
function asDayFraction(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return (value.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  if (value && typeof value === 'object' && 'result' in value) {
    return asDayFraction((value as { result: unknown }).result);
  }
  throw new Error(`Celica ni čas ne število: ${JSON.stringify(value)}`);
}

/** Vrne vrstico, katere stolpec B je dani datum. */
function findDateRow(ws: ExcelJS.Worksheet, isoDate: string): ExcelJS.Row | null {
  let found: ExcelJS.Row | null = null;
  ws.eachRow((row) => {
    const value = row.getCell(2).value;
    if (value instanceof Date && value.toISOString().startsWith(isoDate)) found = row;
  });
  return found;
}

describe('/timesheet/workbook pogodba', () => {
  it('vrne .xlsx s pravim imenom datoteke in vsebino po predlogi', async () => {
    const { app } = await createApp();
    const token = await loginAdmin(app);

    const res = await request(app)
      .post('/api/v1/timesheet/workbook')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...MARCH, holidays: [10] })
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('evidenca-2026-03.xlsx');
    expect(res.headers['cache-control']).toBe('no-store');

    const ws = await readWorkbook(res.body as Buffer);

    // Glava dokumenta: ime, prvi dan meseca, mesečna obveza (22 delovnikov × 8 h), tedenske ure.
    expect(ws.getRow(4).getCell(9).value).toBe('Testna Oseba');
    expect(ws.getRow(6).getCell(9).value).toBe(176);
    expect(ws.getRow(4).getCell(21).value).toBe(40);

    // Delovni dan: prihod 9:00, odhod 17:00. To je natanko past izvirne aplikacije — zapis
    // prek `Date` je dal 8:59 oz. 12:29, zapis kot delež dneva pa točno uro.
    const workRow = findDateRow(ws, '2026-03-02');
    expect(workRow).not.toBeNull();
    expect(asDayFraction(workRow!.getCell(4).value)).toBeCloseTo(9 / 24, 10);
    expect(asDayFraction(workRow!.getCell(5).value)).toBeCloseTo(17 / 24, 10);
    expect(asDayFraction(workRow!.getCell(6).value)).toBeCloseTo(12.5 / 24, 10);
    const redne = workRow!.getCell(9).value as { formula: string; result: number };
    expect(redne.formula).toContain('E');
    expect(asDayFraction(redne)).toBeCloseTo(8 / 24, 10);

    // Praznik 10. marca: ure gredo v stolpec N, ne med redne ure.
    const holidayRow = findDateRow(ws, '2026-03-10');
    expect(asDayFraction(holidayRow!.getCell(14).value)).toBeCloseTo(8 / 24, 10);
    expect(holidayRow!.getCell(9).value).toBeNull();

    // Vikend nima časov.
    const weekendRow = findDateRow(ws, '2026-03-07');
    expect(weekendRow!.getCell(4).value).toBeNull();

    // Mesečni seštevek: 21 delovnih dni × 8 h (praznik ne šteje).
    let totalCell: unknown = null;
    ws.eachRow((row) => {
      if (row.getCell(2).value === 'Skupaj ure/mesec') totalCell = row.getCell(9).value;
    });
    expect(totalCell).not.toBeNull();
    expect(asDayFraction(totalCell)).toBeCloseTo((21 * 8) / 24, 10);
  });

  it('predogled vrne iste dneve in seštevke kot datoteka', async () => {
    const { app } = await createApp();
    const token = await loginAdmin(app);

    const res = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...MARCH, sickDays: [11] });

    expect(res.status).toBe(200);
    expect(res.body.weeks).toHaveLength(6);
    expect(res.body.nominalMonthHours).toBe(176);
    expect(res.body.totals).toEqual({ work: 21 * 480, holiday: 0, sick: 480, off: 0 });
    expect(res.body.fileName).toBe('evidenca-2026-03.xlsx');
  });

  it('neveljaven mesec in neobstoječ dan sta 400 v obliki problem+json', async () => {
    const { app } = await createApp();
    const token = await loginAdmin(app);

    const badMonth = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...MARCH, month: 13 });
    expect(badMonth.status).toBe(400);
    expect(badMonth.headers['content-type']).toContain('application/problem+json');

    const badDay = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026, month: 4, fullName: 'X', holidays: [31] });
    expect(badDay.status).toBe(400);

    const inverted = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...MARCH, schedule: { departure: { h: 8, m: 0 } } });
    expect(inverted.status).toBe(400);
    expect(inverted.body.detail).toMatch(/Odhod/);
  });

  it('brez imena in brez shranjenega privzetka je 400 s pojasnilom', async () => {
    const { app } = await createApp();
    const token = await loginAdmin(app);

    const res = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026, month: 3 });

    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/ime in priimek/i);
  });

  it('privzetki se shranijo in nato zadoščajo za izdelavo brez ponovnega vnosa', async () => {
    const { app } = await createApp();
    const token = await loginAdmin(app);

    const saved = await request(app)
      .put('/api/v1/timesheet/defaults')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Shranjena Oseba',
        weeklyWorkHours: 36,
        schedule: { arrival: { h: 7, m: 0 }, departure: { h: 15, m: 0 } },
      });
    expect(saved.status).toBe(200);
    expect(saved.body.fullName).toBe('Shranjena Oseba');
    expect(saved.body.schedule.breakStart).toEqual({ h: 12, m: 30 }); // neposlano ostane privzeto

    const read = await request(app).get('/api/v1/timesheet/defaults').set('Authorization', `Bearer ${token}`);
    expect(read.body.weeklyWorkHours).toBe(36);

    const preview = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026, month: 3 });
    expect(preview.status).toBe(200);
    expect(preview.body.fullName).toBe('Shranjena Oseba');
    expect(preview.body.totals.work).toBe(22 * 480);
  });

  it('privzetkov z obrnjenim urnikom ni mogoče shraniti', async () => {
    const { app } = await createApp();
    const token = await loginAdmin(app);

    const res = await request(app)
      .put('/api/v1/timesheet/defaults')
      .set('Authorization', `Bearer ${token}`)
      .send({ schedule: { departure: { h: 6, m: 0 } } });
    expect(res.status).toBe(400);

    const read = await request(app).get('/api/v1/timesheet/defaults').set('Authorization', `Bearer ${token}`);
    expect(read.body.schedule.departure).toEqual({ h: 17, m: 0 });
  });

  it('uporabnik z osnovno vlogo (brez admin obsega) sme izdelati evidenco', async () => {
    const { app } = await createApp();
    const token = await loginPlainUser(app);

    const res = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...MARCH });
    expect(res.status).toBe(200);
  });

  it('brez avtentikacije je 401', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/timesheet/preview').send({ ...MARCH });
    expect(res.status).toBe(401);
  });

  it('API ključ brez obsega timesheet:generate dobi 403, s pravim obsegom pa evidenco (člen III)', async () => {
    const { app } = await createApp();
    // Avtomatizacija deluje v imenu edinega uporabnika (platform/auth/automation-owner.ts).
    await loginAdmin(app);

    const makeKey = async (scopes: string[]) => {
      const secret = `cd_${randomBytes(16).toString('hex')}`;
      await ApiKeyModel.create({
        label: `n8n-${scopes.join('-') || 'brez'}`,
        keyHash: createHash('sha256').update(secret).digest('hex'),
        keyPrefix: secret.slice(0, 8),
        scopes,
      });
      return secret;
    };

    const wrongScope = await makeKey(['dashboard:read']);
    const denied = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('X-API-Key', wrongScope)
      .send({ ...MARCH });
    expect(denied.status).toBe(403);

    const rightScope = await makeKey(['timesheet:generate']);
    const allowed = await request(app)
      .post('/api/v1/timesheet/preview')
      .set('X-API-Key', rightScope)
      .send({ ...MARCH });
    expect(allowed.status).toBe(200);
    expect(allowed.body.totals.work).toBe(22 * 480);
  });
});
