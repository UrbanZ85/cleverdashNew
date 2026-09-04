import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setTestEnv } from '../setup/test-env.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';
import { getCameraHealth, isHealthCheckable } from '../../src/modules/cameras/services/camera-health.service.js';

// quickstart.md §4, primeri 7-8.

beforeAll(async () => {
  setTestEnv({ CAMERA_UNREACHABLE_THRESHOLD: '3' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('isHealthCheckable', () => {
  it('samo snapshot in snapshot+iframe polnijo ExternalCache in so zato preverljivi', () => {
    expect(isHealthCheckable({ type: 'snapshot' })).toBe(true);
    expect(isHealthCheckable({ type: 'snapshot+iframe' })).toBe(true);
  });

  it('iframe, mjpeg in hls nimajo ExternalCache zapisa — "not-applicable", ne "unknown"', () => {
    expect(isHealthCheckable({ type: 'iframe' })).toBe(false);
    expect(isHealthCheckable({ type: 'mjpeg' })).toBe(false);
    expect(isHealthCheckable({ type: 'hls' })).toBe(false);
  });
});

describe('getCameraHealth — FR-011, izpeljano iz ExternalCache', () => {
  it('samostojen iframe vrne "not-applicable", ne "unknown" in ne napako', async () => {
    const health = await getCameraHealth('cam-1', { type: 'iframe' });
    expect(health.state).toBe('not-applicable');
  });

  it('brez zapisa v ExternalCache (še ni bilo zajema) vrne "unknown"', async () => {
    const health = await getCameraHealth('cam-2', { type: 'snapshot' });
    expect(health.state).toBe('unknown');
  });

  it('svež zapis brez napak vrne "ok"', async () => {
    const now = new Date();
    await ExternalCacheModel.create({
      key: 'camera:cam-3:preview',
      sourceUrl: 'https://example.com/a.jpg',
      contentType: 'image/jpeg',
      payload: Buffer.from('x'),
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      lastAttemptAt: now,
      lastError: null,
      consecutiveFailures: 0,
    });
    const health = await getCameraHealth('cam-3', { type: 'snapshot' });
    expect(health.state).toBe('ok');
    expect(health.consecutiveFailures).toBe(0);
  });

  it('iztečen zapis z manj neuspehi kot prag vrne "stale"', async () => {
    const past = new Date(Date.now() - 120_000);
    await ExternalCacheModel.create({
      key: 'camera:cam-4:preview',
      sourceUrl: 'https://example.com/a.jpg',
      contentType: 'image/jpeg',
      payload: Buffer.from('x'),
      fetchedAt: past,
      expiresAt: new Date(past.getTime() + 30_000),
      lastAttemptAt: new Date(),
      lastError: 'timeout',
      consecutiveFailures: 1,
    });
    const health = await getCameraHealth('cam-4', { type: 'snapshot' });
    expect(health.state).toBe('stale');
  });

  it('iztečen zapis z neuspehi na pragu ali čez vrne "unreachable"', async () => {
    const past = new Date(Date.now() - 120_000);
    await ExternalCacheModel.create({
      key: 'camera:cam-5:preview',
      sourceUrl: 'https://example.com/a.jpg',
      contentType: 'image/jpeg',
      payload: Buffer.from('x'),
      fetchedAt: past,
      expiresAt: new Date(past.getTime() + 30_000),
      lastAttemptAt: new Date(),
      lastError: 'timeout',
      consecutiveFailures: 3,
    });
    const health = await getCameraHealth('cam-5', { type: 'snapshot' });
    expect(health.state).toBe('unreachable');
  });
});
