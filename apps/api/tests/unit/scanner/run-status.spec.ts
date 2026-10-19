import { describe, expect, it } from 'vitest';
import { statusFromOutcomes } from '../../../src/platform/scanner/domain/run-status.js';

// FR-017, FR-019: stanje zagona iz izidov po skenerjih.

describe('statusFromOutcomes', () => {
  it('vsi ok ali prazen seznam brez napake → succeeded', () => {
    expect(statusFromOutcomes([{ outcome: 'ok' }, { outcome: 'ok' }], false)).toBe('succeeded');
    expect(statusFromOutcomes([], false)).toBe('succeeded');
    expect(statusFromOutcomes([{ outcome: 'skipped' }], false)).toBe('succeeded');
  });
  it('mešano → partial', () => {
    expect(statusFromOutcomes([{ outcome: 'ok' }, { outcome: 'failed' }], false)).toBe('partial');
    expect(statusFromOutcomes([{ outcome: 'ok' }], true)).toBe('partial');
  });
  it('noben ok in vsaj en neuspeh → failed', () => {
    expect(statusFromOutcomes([{ outcome: 'failed' }], false)).toBe('failed');
    expect(statusFromOutcomes([], true)).toBe('failed');
    expect(statusFromOutcomes([{ outcome: 'skipped' }, { outcome: 'failed' }], false)).toBe('failed');
  });
});
