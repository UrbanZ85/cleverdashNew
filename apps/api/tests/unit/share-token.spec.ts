import { describe, expect, it } from 'vitest';
import {
  buildShareUrl,
  generateGrant,
  generateShareToken,
  isShareTokenShaped,
} from '../../src/modules/file-sharing/domain/share-token.js';

// FR-014, research.md §6.

describe('generateShareToken', () => {
  it('je 22 znakov base64url — 128 bitov', () => {
    const token = generateShareToken();
    expect(token).toHaveLength(22);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('dva zaporedna žetona nista podobna — iz enega ni mogoče izpeljati drugega', () => {
    // `ObjectId` bi se v tem preizkusu razlikoval le v nekaj bitih (časovni žig + števec), zato
    // ni uporaben kot javni žeton.
    const tokens = new Set(Array.from({ length: 500 }, () => generateShareToken()));
    expect(tokens.size).toBe(500);

    const [a, b] = [generateShareToken(), generateShareToken()];
    const enakihUvodnih = [...a].findIndex((ch, i) => ch !== b[i]);
    expect(enakihUvodnih).toBeLessThan(6);
  });
});

describe('isShareTokenShaped', () => {
  it('sprejme samo pravo obliko', () => {
    expect(isShareTokenShaped(generateShareToken())).toBe(true);
    expect(isShareTokenShaped('prekratek')).toBe(false);
    expect(isShareTokenShaped(`${generateShareToken()}x`)).toBe(false);
    expect(isShareTokenShaped('aaaaaaaaaaaaaaaaaaaa+/')).toBe(false);
    expect(isShareTokenShaped(null)).toBe(false);
    expect(isShareTokenShaped(123)).toBe(false);
  });
});

describe('generateGrant', () => {
  it('je daljša od žetona — potuje v piškotku in ne v naslovu', () => {
    expect(generateGrant()).toHaveLength(43);
    expect(generateGrant()).not.toBe(generateGrant());
  });
});

describe('buildShareUrl', () => {
  it('sestavi povezavo iz PUBLIC_BASE_URL', () => {
    expect(buildShareUrl('https://app.si', 'abcdefghijklmnopqrstuv')).toBe('https://app.si/d/abcdefghijklmnopqrstuv');
  });

  it('prenese odvečno poševnico na koncu osnovnega naslova', () => {
    expect(buildShareUrl('https://app.si/', 'abcdefghijklmnopqrstuv')).toBe('https://app.si/d/abcdefghijklmnopqrstuv');
    expect(buildShareUrl('https://app.si///', 'abcdefghijklmnopqrstuv')).toBe('https://app.si/d/abcdefghijklmnopqrstuv');
  });

  it('se NE shranjuje — zato ga je mogoče sestaviti za katerikoli naslov namestitve', () => {
    // Shranjena povezava bi se ob selitvi domene tiho pokvarila v vsakem starem zapisu
    // (data-model.md, "Izpeljano, ne shranjeno").
    const token = generateShareToken();
    expect(buildShareUrl('http://localhost:3000', token)).toContain('localhost:3000');
    expect(buildShareUrl('https://nova-domena.si', token)).toContain('nova-domena.si');
  });
});
