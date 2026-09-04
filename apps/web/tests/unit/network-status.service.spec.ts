import { describe, expect, it } from 'vitest';
import {
  isMobileNetwork,
  shouldApplyDataSaver,
  resolveRefreshIntervalMs,
  shouldAutoplayLiveStream,
  MOBILE_REFRESH_MULTIPLIER,
} from '../../src/app/core/network/network-status.service.js';

// Analiza F5 — quickstart.md §3.7. Čiste funkcije, testirane brez Angular DI/Capacitorja.

describe('isMobileNetwork', () => {
  it('samo "cellular" šteje kot mobilno', () => {
    expect(isMobileNetwork('cellular')).toBe(true);
    expect(isMobileNetwork('wifi')).toBe(false);
    expect(isMobileNetwork('unknown')).toBe(false);
  });
});

describe('shouldApplyDataSaver', () => {
  it('velja samo, ko je nastavitev vklopljena IN je omrežje mobilno', () => {
    expect(shouldApplyDataSaver('cellular', true)).toBe(true);
    expect(shouldApplyDataSaver('cellular', false)).toBe(false);
    expect(shouldApplyDataSaver('wifi', true)).toBe(false);
    expect(shouldApplyDataSaver('unknown', true)).toBe(false);
  });
});

describe('resolveRefreshIntervalMs — SC-007', () => {
  it('na mobilnem omrežju s prihrankom podaljša interval', () => {
    expect(resolveRefreshIntervalMs(30_000, 'cellular', true)).toBe(30_000 * MOBILE_REFRESH_MULTIPLIER);
  });

  it('na Wi-Fi interval ostane nespremenjen ne glede na nastavitev', () => {
    expect(resolveRefreshIntervalMs(30_000, 'wifi', true)).toBe(30_000);
  });

  it('na mobilnem omrežju z izklopljenim prihrankom interval ostane nespremenjen', () => {
    expect(resolveRefreshIntervalMs(30_000, 'cellular', false)).toBe(30_000);
  });
});

describe('shouldAutoplayLiveStream — Story 7, sprejemni scenarij 2', () => {
  it('na mobilnem omrežju s prihrankom se živi tok ne zažene samodejno', () => {
    expect(shouldAutoplayLiveStream('cellular', true)).toBe(false);
  });

  it('na Wi-Fi se živi tok zažene samodejno', () => {
    expect(shouldAutoplayLiveStream('wifi', true)).toBe(true);
  });

  it('z izklopljenim prihrankom se živi tok zažene samodejno tudi na mobilnem omrežju', () => {
    expect(shouldAutoplayLiveStream('cellular', false)).toBe(true);
  });
});
