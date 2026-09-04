import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { classifyError, diagnoseEmptyActions } from '../../src/modules/time-tracking/clock-portal/puppeteer-clock-portal.js';
import { enrichDiagnosticsWithSession } from '../../src/modules/time-tracking/services/location-resolver.service.js';
import { RemoteSessionModel } from '../../src/modules/time-tracking/models/remote-session.model.js';

// Story 8 (US8), FR-022: loči vzroke, ki so v starem sistemu bili videti enako
// ("gumba ni") — potekla seja, nedosegljiva stran, spremenjena struktura strani.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('diagnoseEmptyActions / classifyError — osnovna razločitev', () => {
  it('prazen nabor akcij je privzeto "selector_not_found" (brez konteksta seje)', () => {
    expect(diagnoseEmptyActions([]).reason).toBe('selector_not_found');
  });

  it('neprazen nabor je "ok"', () => {
    expect(diagnoseEmptyActions(['Prijava na delo']).reason).toBe('ok');
  });

  it('timeout napaka se prepozna kot "timeout"', () => {
    expect(classifyError(new Error('Navigation timeout of 30000 ms exceeded')).reason).toBe('timeout');
  });

  it('mrežna napaka se prepozna kot "page_unreachable"', () => {
    expect(classifyError(new Error('net::ERR_NAME_NOT_RESOLVED')).reason).toBe('page_unreachable');
  });

  it('geolokacijska napaka se prepozna kot "geolocation_denied"', () => {
    expect(classifyError(new Error('geolocation permission denied')).reason).toBe('geolocation_denied');
  });

  it('neznana napaka pade nazaj na "browser_launch_failed"', () => {
    expect(classifyError(new Error('nekaj čisto drugega')).reason).toBe('browser_launch_failed');
  });
});

describe('enrichDiagnosticsWithSession — razloči potekla seja od splošne okvare (US8)', () => {
  it('"selector_not_found" postane "session_expired", če je seja potekla', async () => {
    const session = await RemoteSessionModel.create({
      userId: '000000000000000000000003',
      name: 'seja',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'e.test',
      status: 'expired',
    });
    const enriched = enrichDiagnosticsWithSession({ reason: 'selector_not_found' }, session);
    expect(enriched.reason).toBe('session_expired');
  });

  it('"selector_not_found" ostane nespremenjen, če je seja aktivna (prava sprememba strukture strani)', async () => {
    const session = await RemoteSessionModel.create({
      userId: '000000000000000000000003',
      name: 'seja',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'e.test',
      status: 'active',
    });
    const enriched = enrichDiagnosticsWithSession({ reason: 'selector_not_found' }, session);
    expect(enriched.reason).toBe('selector_not_found');
  });

  it('drugi vzroki (npr. timeout) se ne prepišejo', async () => {
    const session = await RemoteSessionModel.create({
      userId: '000000000000000000000003',
      name: 'seja',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'e.test',
      status: 'expired',
    });
    const enriched = enrichDiagnosticsWithSession({ reason: 'timeout' }, session);
    expect(enriched.reason).toBe('timeout');
  });
});
