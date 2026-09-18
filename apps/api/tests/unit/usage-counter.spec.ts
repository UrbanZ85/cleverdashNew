import { describe, expect, it } from 'vitest';
import { dedupeCutoff, expiryFor, NO_KEY, usageDay } from '../../src/platform/usage/domain/usage-day.js';
import { isKnownTabId, knownTabIds } from '../../src/platform/usage/domain/tab-key.js';

// 014, kakovostna vrata (točka 2). Od štirih primerov, ki jih ustava imenuje, ima v tej
// funkcionalnosti predmet PREHOD NA POLETNI/ZIMSKI ČAS — in je zato tu preverjen izčrpno.
// Ostali trije so navedeni v plan.md skupaj s tem, kaj jih nadomešča.

describe('usageDay — dan je koledarski dan v Ljubljani (člen V.4)', () => {
  it('ob 23:30 po ljubljanskem času je še VEDNO isti dan, ne jutrišnji', () => {
    // 21:30 UTC = 23:30 CEST. `toISOString().split('T')[0]` bi dal "2026-06-15" — pravilno —
    // a ob 22:30 UTC (00:30 CEST) bi dal isto, kar je že napačno. Zato spodnji primer.
    expect(usageDay(new Date('2026-06-15T21:30:00Z'))).toBe('2026-06-15');
  });

  it('ob 00:30 po ljubljanskem času je NASLEDNJI dan, čeprav je v UTC še prejšnji', () => {
    // 22:30 UTC 15. junija = 00:30 CEST 16. junija. To je primer, ki ga prepovedani
    // `toISOString().split('T')[0]` zgreši (docs/legacy-engine.md §4).
    expect(usageDay(new Date('2026-06-15T22:30:00Z'))).toBe('2026-06-16');
  });

  it('PREHOD NA POLETNI ČAS: dan s 23 urami da natanko en ključ', () => {
    // 29. 3. 2026 ob 02:00 CET → 03:00 CEST. Dan ima 23 ur.
    const dayStart = usageDay(new Date('2026-03-29T00:00:00Z')); // 01:00 CET
    const afterSkip = usageDay(new Date('2026-03-29T01:30:00Z')); // 03:30 CEST
    const dayEnd = usageDay(new Date('2026-03-29T21:59:00Z')); // 23:59 CEST
    expect(dayStart).toBe('2026-03-29');
    expect(afterSkip).toBe('2026-03-29');
    expect(dayEnd).toBe('2026-03-29');
    expect(new Set([dayStart, afterSkip, dayEnd]).size).toBe(1);
  });

  it('PREHOD NA ZIMSKI ČAS: dan s 25 urami prav tako da natanko en ključ', () => {
    // 25. 10. 2026 ob 03:00 CEST → 02:00 CET. Ura 02:00–03:00 se ponovi.
    const firstPass = usageDay(new Date('2026-10-25T00:30:00Z')); // 02:30 CEST
    const secondPass = usageDay(new Date('2026-10-25T01:30:00Z')); // 02:30 CET, ista ura znova
    const dayEnd = usageDay(new Date('2026-10-25T22:59:00Z')); // 23:59 CET
    expect(new Set([firstPass, secondPass, dayEnd])).toEqual(new Set(['2026-10-25']));
  });
});

describe('expiryFor — rok hrambe se izračuna iz DNEVA, ne iz časa zapisa', () => {
  it('je za isti dan vedno ista vrednost, ne glede na to, kdaj se števec poveča', () => {
    // To je bistvo: `$set` mora biti idempotenten, sicer števec, ki raste ves dan, svoj rok ves
    // dan odriva pred sabo in se hramba tiho raztegne na "zadnja uporaba + N dni".
    const a = expiryFor('2026-01-15', 400);
    const b = expiryFor('2026-01-15', 400);
    expect(a.getTime()).toBe(b.getTime());
  });

  it('pade po KONCU dneva + N dni, ne pol dneva prej', () => {
    const expiry = expiryFor('2026-01-15', 1);
    // Konec 16. januarja po ljubljanskem času = 22:59:59.999 UTC (zimski čas, +01:00).
    expect(expiry.toISOString()).toBe('2026-01-16T22:59:59.999Z');
  });

  it('daljši rok pomeni poznejši datum', () => {
    expect(expiryFor('2026-01-15', 400).getTime()).toBeGreaterThan(expiryFor('2026-01-15', 30).getTime());
  });

  it('neveljaven dan je napaka in ne tiho neveljaven datum', () => {
    expect(() => expiryFor('15.1.2026', 400)).toThrow(/Neveljaven dan/);
  });
});

describe('dedupeCutoff — okno proti dvojnemu štetju', () => {
  it('vrne trenutek, ki je natanko N sekund pred zdaj', () => {
    const now = new Date('2026-05-01T10:00:00Z');
    expect(dedupeCutoff(now, 60).toISOString()).toBe('2026-05-01T09:59:00.000Z');
  });
});

describe('NO_KEY', () => {
  it('je konstanta in ne `null` — unikaten indeks mora ujeti tudi vrstice prijav', () => {
    // `null` bi z delnim ali `sparse` indeksom pomenil, da vrstice prijav iz indeksa izpadejo in
    // se dvojniki spustijo skozi (research.md §4).
    expect(NO_KEY).toBe('-');
    expect(typeof NO_KEY).toBe('string');
  });
});

describe('isKnownTabId — telemetrija sprejme samo oznake iz registra (FR-031)', () => {
  it('sprejme zavihek, ki v registru obstaja', () => {
    expect(isKnownTabId('dashboard')).toBe(true);
    expect(isKnownTabId('analytics')).toBe(true);
  });

  it('zavrne poljuben niz', () => {
    // Zbirka, v katero lahko klicatelj vpiše svoj ključ, ni telemetrija, ampak odprt predal.
    expect(isKnownTabId('karkoli')).toBe(false);
    expect(isKnownTabId('')).toBe(false);
    expect(isKnownTabId('DASHBOARD')).toBe(false);
  });

  it('seznam znanih oznak ni prazen in nima podvojenih', () => {
    const ids = knownTabIds();
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
