import { describe, expect, it } from 'vitest';
import { echoResults } from '../../../src/modules/echo-scanner/scenario.js';
import { echoConfigSchema, echoScannerType } from '../../../src/modules/echo-scanner/scanner-type.js';
import type { Env } from '../../../src/platform/config/env.js';

// FR-046, FR-047: scenarij je determinističen; nastavitve preverja Zod shema s slovenskimi stavki.

describe('echoResults', () => {
  it('zagon 1: N rezultatov s cenami 100+i in stabilno identiteto', () => {
    const r = echoResults(1, 3, 'Echo');
    expect(r.map((x) => x.price?.amount)).toEqual([101, 102, 103]);
    expect(r.map((x) => x.identity)).toEqual(['echo:Echo:1', 'echo:Echo:2', 'echo:Echo:3']);
    expect(r[0]?.url).toBe('https://example.test/echo/1');
  });
  it('zagon 2 je enak zagonu 1; zagon 3 poceni prvega za 10; zagon 4 izpusti zadnjega', () => {
    expect(echoResults(2, 3, 'Echo').map((x) => x.price?.amount)).toEqual([101, 102, 103]);
    expect(echoResults(3, 3, 'Echo').map((x) => x.price?.amount)).toEqual([91, 102, 103]);
    expect(echoResults(4, 3, 'Echo').map((x) => x.identity)).toEqual(['echo:Echo:1', 'echo:Echo:2']);
    expect(echoResults(9, 3, 'Echo')).toHaveLength(2);
  });
  it('determinističen: isti vhod → isti izhod', () => {
    expect(echoResults(3, 5, 'A')).toEqual(echoResults(3, 5, 'A'));
  });
});

describe('nastavitve tipa echo', () => {
  it('items 0 in 21 ter necelo število so zavrnjeni s slovenskim stavkom; label dobi privzetek', () => {
    expect(echoConfigSchema.safeParse({ items: 0 }).error?.issues[0]?.message).toBe('Vsaj en rezultat.');
    expect(echoConfigSchema.safeParse({ items: 21 }).error?.issues[0]?.message).toBe('Največ 20 rezultatov.');
    expect(echoConfigSchema.safeParse({ items: 2.5 }).error?.issues[0]?.message).toBe('Število rezultatov mora biti celo število.');
    expect(echoConfigSchema.parse({ items: 3 })).toEqual({ items: 3, label: 'Echo' });
  });
  it('validateConfig zavrne prazno oznako; describeConfig je slovensko', () => {
    expect(echoScannerType.validateConfig?.({ items: 3, label: '   ' }, {} as Env)).toBe('Oznaka ne sme biti prazna.');
    expect(echoScannerType.describeConfig?.({ items: 1, label: 'X' })).toBe('1 rezultat, oznaka X');
    expect(echoScannerType.describeConfig?.({ items: 5, label: 'X' })).toBe('5 rezultatov, oznaka X');
  });
  it('tip je vklopljen samo z zastavico in nikoli v produkciji', () => {
    expect(echoScannerType.isEnabled({ SCANNER_ECHO_ENABLED: true, NODE_ENV: 'test' } as Env)).toBe(true);
    expect(echoScannerType.isEnabled({ SCANNER_ECHO_ENABLED: false, NODE_ENV: 'test' } as Env)).toBe(false);
    expect(echoScannerType.isEnabled({ SCANNER_ECHO_ENABLED: true, NODE_ENV: 'production' } as Env)).toBe(false);
  });
});
