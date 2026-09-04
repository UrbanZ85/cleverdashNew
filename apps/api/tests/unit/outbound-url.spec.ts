import { describe, expect, it } from 'vitest';
import { MAX_OUTBOUND_URL_LENGTH, validateOutboundUrl } from '../../src/domain/outbound-url.js';

// Ta funkcija je varnostna meja: naslov vpiše uporabnik, prenese pa ga STREŽNIK
// (GET /dashboard/plugins/:id/data). Brez nje bi bil vsak prijavljen uporabnik sposoben
// strežniku naročiti branje notranjih naslovov (SSRF).

describe('validateOutboundUrl — sprejme', () => {
  it.each([
    'https://vreme.arso.gov.si/api/1.0/location/',
    'https://api.example.com/v1/data?location=Ljubljana&units=metric',
    'https://example.com:8443/pot/do/vira.json',
    'https://sub.domena.example.co.uk/a',
  ])('%s', (url) => {
    const result = validateOutboundUrl(url);
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it('obreže presledke okoli naslova', () => {
    const result = validateOutboundUrl('  https://example.com/a  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.href).toBe('https://example.com/a');
  });
});

describe('validateOutboundUrl — zavrne shemo, ki ni https', () => {
  it.each([
    ['http://example.com/a', 'nešifrirano'],
    ['file:///etc/passwd', 'lokalna datoteka'],
    ['ftp://example.com/a', 'ftp'],
    ['javascript:alert(1)', 'javascript'],
    ['data:text/html,<h1>x</h1>', 'data'],
  ])('%s (%s)', (url) => {
    const result = validateOutboundUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['scheme', 'invalid']).toContain(result.reason);
  });
});

describe('validateOutboundUrl — zavrne lokalno in zasebno omrežje', () => {
  it.each([
    'https://localhost/a',
    'https://127.0.0.1/a',
    'https://127.1.2.3/a',
    'https://10.0.0.5/a',
    'https://172.16.0.1/a',
    'https://172.31.255.254/a',
    'https://192.168.1.1/a',
    'https://0.0.0.0/a',
    'https://169.254.169.254/latest/meta-data/', // storitev metapodatkov v oblaku
    'https://[::1]/a',
    'https://[fd00::1]/a',
    'https://[fe80::1]/a',
  ])('%s', (url) => {
    const result = validateOutboundUrl(url);
    expect(result.ok, `pričakovana zavrnitev za ${url}`).toBe(false);
    if (!result.ok) expect(result.reason).toBe('private-host');
  });

  it('172.32.x.x NI zasebni razpon in se sprejme', () => {
    // Meja razpona 172.16/12 se rada zamakne — 172.32 je javni naslov.
    expect(validateOutboundUrl('https://172.32.0.1/a').ok).toBe(true);
    expect(validateOutboundUrl('https://172.15.0.1/a').ok).toBe(true);
  });
});

describe('validateOutboundUrl — ostale zavrnitve', () => {
  it('zavrne poverilnice v naslovu', () => {
    const result = validateOutboundUrl('https://uporabnik:geslo@example.com/a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('credentials');
  });

  it('zavrne prazen naslov', () => {
    expect(validateOutboundUrl('   ').ok).toBe(false);
  });

  it('zavrne naslov brez sheme', () => {
    const result = validateOutboundUrl('example.com/a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  it(`zavrne naslov, daljši od ${MAX_OUTBOUND_URL_LENGTH} znakov`, () => {
    const long = `https://example.com/${'a'.repeat(MAX_OUTBOUND_URL_LENGTH)}`;
    const result = validateOutboundUrl(long);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-long');
  });

  it('sporočilo o napaki je v slovenščini (člen X)', () => {
    const result = validateOutboundUrl('http://example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/[čšž]|samo https/i);
  });
});
