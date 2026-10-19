import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  enabledScannerTypes,
  findScannerType,
  listScannerTypes,
  registerScannerType,
  resetScannerTypesForTests,
} from '../../../src/platform/scanner/registry.js';
import type { Env } from '../../../src/platform/config/env.js';
import type { ScannerType } from '../../../src/platform/scanner/types.js';

// FR-001, FR-002: register je edino mesto, kjer tipi obstajajo za jedro. Mock tip tu NE pride iz
// nobenega modula — dokaz, da jedro deluje brez letov (SC-003).

function mockType(type: string, enabled = true): ScannerType<{ n: number }> {
  return {
    type,
    label: `Tip ${type}`,
    icon: 'layers-outline',
    description: 'Testni tip.',
    execution: 'single',
    results: 'generic',
    isEnabled: () => enabled,
    configSchema: z.object({ n: z.number() }),
    execute: async () => ({ status: 'succeeded', counters: {}, definitions: [], events: [], errors: [] }),
    notifications: {
      verify: async (items) => items,
      render: () => ({ subject: 's', html: '<p></p>', text: '' }),
    },
  };
}

const env = {} as Env;

afterEach(() => resetScannerTypesForTests());

describe('register tipov skenerjev', () => {
  it('registracija in iskanje po oznaki; neznan tip vrne null', () => {
    registerScannerType(mockType('beta'));
    expect(findScannerType('beta')?.label).toBe('Tip beta');
    expect(findScannerType('gama')).toBeNull();
  });

  it('ponovna registracija istega tipa vnos ZAMENJA, ne podvoji (createApp teče večkrat v testih)', () => {
    registerScannerType(mockType('beta'));
    registerScannerType({ ...mockType('beta'), label: 'Novejši' });
    expect(listScannerTypes()).toHaveLength(1);
    expect(findScannerType('beta')?.label).toBe('Novejši');
  });

  it('seznam je po abecedi oznake, ne po vrstnem redu registracij', () => {
    registerScannerType(mockType('zeta'));
    registerScannerType(mockType('alfa'));
    registerScannerType(mockType('mi'));
    expect(listScannerTypes().map((t) => t.type)).toEqual(['alfa', 'mi', 'zeta']);
  });

  it('enabledScannerTypes spoštuje isEnabled(env)', () => {
    registerScannerType(mockType('on', true));
    registerScannerType(mockType('off', false));
    expect(enabledScannerTypes(env).map((t) => t.type)).toEqual(['on']);
  });

  it('reset izprazni register', () => {
    registerScannerType(mockType('beta'));
    resetScannerTypesForTests();
    expect(listScannerTypes()).toEqual([]);
  });
});
