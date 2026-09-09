import { describe, expect, it } from 'vitest';
import {
  MAX_LINK_URL_LENGTH,
  hostLabel,
  normalizeLinkUrl,
} from '../../src/modules/saved-links/domain/link-url.js';

// 008, quickstart.md §4: ti primeri NADOMEŠČAJO štiri poimenske primere iz kakovostnih vrat
// (poletni/zimski čas, praznik, dopust prek meje meseca, neuspel klic z uspehom ob ponovitvi),
// ki v tem modulu nimajo predmeta — modul nima koledarja, schedulerja ne akcije na tuji strani
// (plan.md, Constitution Check; research.md §13). Molk ne šteje za izpolnjeno, zato so tu.

describe('normalizeLinkUrl', () => {
  it('obreže robne presledke in dopolni manjkajočo shemo v https', () => {
    const result = normalizeLinkUrl(' primer.si/a ');
    expect(result).toEqual({ ok: true, url: 'https://primer.si/a' });
  });

  it('naslov z že navedeno shemo pusti pri njej — https se ne vsiljuje nad http', () => {
    expect(normalizeLinkUrl('http://primer.si/a')).toEqual({ ok: true, url: 'http://primer.si/a' });
  });

  it('gostitelja zniža v male črke, POT pa pusti nedotaknjeno', () => {
    // Pot je na strežnikih Linuxa občutljiva na velike črke: `/Pot` → `/pot` bi bila 404.
    const result = normalizeLinkUrl('HTTP://PRIMER.SI/Pot');
    expect(result).toEqual({ ok: true, url: 'http://primer.si/Pot' });
  });

  it.each([
    ['javascript:alert(1)', 'javascript'],
    ['data:text/html,<h1>x</h1>', 'data'],
    ['file:///etc/passwd', 'file'],
  ])('zavrne %s z razlogom "scheme" in povedanim vzrokom', (input, protocol) => {
    const result = normalizeLinkUrl(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('scheme');
    expect(result.message).toContain(protocol);
  });

  it('zavrne naslov, daljši od 2048 znakov', () => {
    const long = `https://primer.si/${'a'.repeat(MAX_LINK_URL_LENGTH)}`;
    const result = normalizeLinkUrl(long);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-long');
  });

  it('sprejme naslov v zasebnem omrežju — brskalnik ga odpre, strežnik ga ne obišče (research.md §5)', () => {
    // To je razlika do `validateOutboundUrl`, ki ta naslov ZAVRNE. Tu gre za veljavnost ZAPISA.
    expect(normalizeLinkUrl('http://192.168.1.1')).toEqual({ ok: true, url: 'http://192.168.1.1/' });
  });

  it('zavrne prazen vnos in nekaj, kar ni naslov', () => {
    expect(normalizeLinkUrl('   ').ok).toBe(false);
    expect(normalizeLinkUrl('https://').ok).toBe(false);
  });

  it('naslov s poverilnicami je veljaven zapis (obisk zavrne varovalo, ne ta funkcija)', () => {
    const result = normalizeLinkUrl('https://uporabnik:geslo@primer.si/');
    expect(result.ok).toBe(true);
  });
});

describe('hostLabel', () => {
  it('vrne gostitelja brez www. — nadomestno ime zapisa', () => {
    expect(hostLabel('https://www.arso.gov.si/vreme')).toBe('arso.gov.si');
    expect(hostLabel('https://github.com/anthropics')).toBe('github.com');
  });

  it('vrne prazen niz za nekaj, kar ni URL', () => {
    expect(hostLabel('ni-naslov')).toBe('');
  });
});
