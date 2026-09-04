import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import {
  resolveLocationForPortal,
  enrichDiagnosticsWithSession,
} from '../../src/modules/time-tracking/services/location-resolver.service.js';
import { RemoteSessionModel } from '../../src/modules/time-tracking/models/remote-session.model.js';
import { TrackingLocationModel } from '../../src/modules/time-tracking/models/tracking-location.model.js';

// FR-094: stikalo "Pošlji lokacijo strani". Odločitev pade TU, v razrešitvi lokacije — portal
// dobi koordinati ali pa ju ne dobi in brskalniku geolokacije ne nastavi (člen IX: portal ne
// pozna nastavitev, samo to, kaj naj naredi).

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedLocation(overrides: Record<string, unknown> = {}) {
  const userId = new Types.ObjectId().toString();
  const session = await RemoteSessionModel.create({
    userId,
    name: 'seja',
    cookieName: 'ItcClientID',
    cookieValue: 'vrednost',
    cookieDomain: 'e-racuni.com',
    status: 'active',
  });
  const location = await TrackingLocationModel.create({
    userId,
    name: 'lokacija',
    url: 'https://e-racuni.com/S6a/Clockin-test',
    sessionId: session._id,
    coordinateTemplate: { latitude: '46.0629_6', longitude: '14.5602_9' },
    ...overrides,
  });
  return { userId, session, location };
}

describe('resolveLocationForPortal in pošiljanje lokacije', () => {
  it('privzeto koordinati razreši in ju preda portalu', async () => {
    const { userId, location } = await seedLocation();

    const { resolved } = await resolveLocationForPortal(userId, String(location._id));

    expect(resolved.latitude).toBeCloseTo(46.0629, 3);
    expect(resolved.longitude).toBeCloseTo(14.5602, 3);
  });

  it('z izklopljenim pošiljanjem koordinat sploh ni v razrešeni lokaciji', async () => {
    const { userId, location } = await seedLocation({ sendGeolocation: false });

    const { resolved } = await resolveLocationForPortal(userId, String(location._id));

    // Ne `0` in ne prazen niz — polja NI, zato ga portal ne more po nesreči poslati naprej.
    expect(resolved.latitude).toBeUndefined();
    expect(resolved.longitude).toBeUndefined();
    expect('latitude' in resolved).toBe(false);
    // Piškotek in naslov ostaneta — izklopljena je lega, ne branje strani.
    expect(resolved.cookieValue).toBe('vrednost');
    expect(resolved.url).toContain('Clockin-test');
  });

  it('lokacijo brez koordinat je mogoče shraniti, dokler se lega ne pošilja', async () => {
    const { location } = await seedLocation({ sendGeolocation: false, coordinateTemplate: undefined });

    expect(location.coordinateTemplate).toBeUndefined();
  });

  it('lokacija brez koordinat, ki naj bi lego pošiljala, se ne shrani', async () => {
    await expect(seedLocation({ sendGeolocation: true, coordinateTemplate: undefined })).rejects.toThrow(
      /coordinateTemplate/,
    );
  });
});

describe('enrichDiagnosticsWithSession — izklopljena lokacija kot razlaga praznega nabora', () => {
  it('doda namig na stikalo, ko gumbov ni in se lega ne pošilja', async () => {
    const { session, location } = await seedLocation({ sendGeolocation: false });

    const result = enrichDiagnosticsWithSession({ reason: 'selector_not_found' }, session, location);

    // Vzroka ne trdimo — samo prvo stvar, ki jo je vredno preveriti.
    expect(result.reason).toBe('selector_not_found');
    expect(result.hint).toMatch(/lokacije je za "lokacija" izklopljeno/i);
  });

  it('potekla seja ima prednost pred namigom o lokaciji', async () => {
    const { session, location } = await seedLocation({ sendGeolocation: false });
    session.status = 'expired';
    await session.save();

    const result = enrichDiagnosticsWithSession({ reason: 'selector_not_found' }, session, location);

    expect(result.reason).toBe('session_expired');
  });

  it('z vklopljenim pošiljanjem diagnostika ostane nedotaknjena', async () => {
    const { session, location } = await seedLocation();

    const result = enrichDiagnosticsWithSession({ reason: 'selector_not_found' }, session, location);

    expect(result.hint).toBeUndefined();
  });
});
