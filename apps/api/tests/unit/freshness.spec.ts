import { describe, expect, it } from 'vitest';
import { resolveFreshness, ageSeconds, isStaleForApi } from '../../src/domain/freshness.js';

// Člen IX, research.md §13: štiri stanja iz data-model.md — nič od tega ne dotika omrežja
// ali baze.

const NOW = new Date('2026-08-19T12:00:00Z');

describe('resolveFreshness', () => {
  it('never-fetched: zapisa ni bilo nikoli', () => {
    const state = resolveFreshness({ fetchedAt: null, expiresAt: null, lastAttemptSucceeded: null }, NOW);
    expect(state.kind).toBe('never-fetched');
  });

  it('fresh: znotraj TTL', () => {
    const fetchedAt = new Date(NOW.getTime() - 60_000);
    const expiresAt = new Date(NOW.getTime() + 240_000);
    const state = resolveFreshness({ fetchedAt, expiresAt, lastAttemptSucceeded: null }, NOW);
    expect(state).toEqual({ kind: 'fresh', fetchedAt });
  });

  it('refreshed: TTL potekel, a zadnji poskus je uspel', () => {
    const fetchedAt = new Date(NOW.getTime() - 1000);
    const expiresAt = new Date(NOW.getTime() - 500);
    const state = resolveFreshness({ fetchedAt, expiresAt, lastAttemptSucceeded: true }, NOW);
    expect(state).toEqual({ kind: 'refreshed', fetchedAt });
  });

  it('stale: TTL potekel in osvežitev ni uspela — podatek se VSEEEN prikaže (FR-026)', () => {
    const fetchedAt = new Date(NOW.getTime() - 600_000);
    const expiresAt = new Date(NOW.getTime() - 300_000);
    const state = resolveFreshness({ fetchedAt, expiresAt, lastAttemptSucceeded: false }, NOW);
    expect(state).toEqual({ kind: 'stale', fetchedAt });
  });

  it('stale: TTL potekel in osvežitev sploh ni bila poskušena (lastAttemptSucceeded=null)', () => {
    const fetchedAt = new Date(NOW.getTime() - 600_000);
    const expiresAt = new Date(NOW.getTime() - 300_000);
    const state = resolveFreshness({ fetchedAt, expiresAt, lastAttemptSucceeded: null }, NOW);
    expect(state.kind).toBe('stale');
  });

  it('isStaleForApi je true samo za stale, ne za fresh/refreshed/never-fetched', () => {
    expect(isStaleForApi({ kind: 'stale', fetchedAt: NOW })).toBe(true);
    expect(isStaleForApi({ kind: 'fresh', fetchedAt: NOW })).toBe(false);
    expect(isStaleForApi({ kind: 'refreshed', fetchedAt: NOW })).toBe(false);
    expect(isStaleForApi({ kind: 'never-fetched' })).toBe(false);
  });
});

describe('ageSeconds', () => {
  it('izračuna starost v sekundah, zaokroženo', () => {
    const fetchedAt = new Date(NOW.getTime() - 125_000);
    expect(ageSeconds(fetchedAt, NOW)).toBe(125);
  });

  it('nikoli ne vrne negativne starosti (ura odjemalca pred strežnikom)', () => {
    const future = new Date(NOW.getTime() + 5000);
    expect(ageSeconds(future, NOW)).toBe(0);
  });
});
