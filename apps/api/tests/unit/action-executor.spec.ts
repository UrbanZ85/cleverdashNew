import { describe, expect, it } from 'vitest';
import { ActionExecutor } from '../../src/modules/time-tracking/services/action-executor.service.js';
import { FakeClockPortal } from '../../src/modules/time-tracking/clock-portal/fake-clock-portal.js';
import type { ResolvedLocation } from '../../src/modules/time-tracking/clock-portal/index.js';

const LOCATION: ResolvedLocation = {
  url: 'https://example.test/clockin',
  latitude: 46.0,
  longitude: 14.0,
  cookieName: 'x',
  cookieValue: 'y',
  cookieDomain: 'example.test',
};

describe('ActionExecutor — predpreverjanje (FR-033)', () => {
  it('already_done, ko je pričakovano stanje že doseženo, BREZ klika', async () => {
    const portal = new FakeClockPortal();
    portal.setAvailableActions(['Malica', 'Konec dela']); // ON_DUTY že velja
    const executor = new ActionExecutor(portal);

    const result = await executor.execute(LOCATION, 'Prijava na delo');
    expect(result.outcome).toBe('already_done');
  });

  it('unexpected_state, ko akcija v trenutnem stanju ni dovoljena, BREZ klika', async () => {
    const portal = new FakeClockPortal();
    portal.setAvailableActions(['Prijava na delo']); // OFF_DUTY
    const executor = new ActionExecutor(portal);

    // "Konec malice" zahteva ON_BREAK, trenutno je OFF_DUTY.
    const result = await executor.execute(LOCATION, 'Konec malice');
    expect(result.outcome).toBe('unexpected_state');
  });

  it('succeeded, ko klik učinkuje in verifikacija potrdi pričakovano stanje', async () => {
    const portal = new FakeClockPortal();
    portal.setAvailableActions(['Prijava na delo']);
    const executor = new ActionExecutor(portal);

    const result = await executor.execute(LOCATION, 'Prijava na delo');
    expect(result.outcome).toBe('succeeded');
    if (result.outcome === 'succeeded') {
      expect(result.verified).toBe(true);
      expect(result.stateAfter).toBe('ON_DUTY');
    }
  });

  it('not_verified, ko klik ne učinkuje (docs/legacy-engine.md §4.5: nikoli tih uspeh)', async () => {
    const portal = new FakeClockPortal();
    portal.setAvailableActions(['Prijava na delo']);
    portal.scriptClickNoEffect('Prijava na delo');
    const executor = new ActionExecutor(portal);

    const result = await executor.execute(LOCATION, 'Prijava na delo');
    expect(result.outcome).toBe('not_verified');
    if (result.outcome === 'not_verified') {
      expect(result.verified).toBe(false);
    }
  });
});
