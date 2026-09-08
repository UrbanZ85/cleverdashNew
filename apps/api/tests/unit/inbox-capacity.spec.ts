import { describe, expect, it } from 'vitest';
import {
  checkCapacity,
  maxSingleFileBytes,
  remainingBytes,
  remainingFiles,
} from '../../src/modules/file-sharing/domain/inbox-capacity.js';

// FR-087/FR-088: meji predala sta drugi obroč pod kvoto lastnika. Ta datoteka preverja presojo
// samo — brez baze, brez ure (člen IX).
//
// Kakovostna vrata, točka 2: pri tej funkcionalnosti ni prehoda na poletni čas ne praznika na
// delovni dan; nadomeščajo jih enotski testi mej, med njimi ROBNA ENAKOST spodaj.

const MB = 1024 * 1024;
const LIMITS = { maxFiles: 3, maxTotalBytes: 10 * MB };

describe('checkCapacity — sme datoteka še v ta predal', () => {
  it('prazen predal sprejme datoteko', () => {
    expect(checkCapacity({ files: 0, bytes: 0 }, LIMITS, 1 * MB)).toEqual({ ok: true });
  });

  it('robna enakost je ŠE DOVOLJENA — meja je zgornja meja, ne vrednost, ki je ni dovoljeno doseči', () => {
    expect(checkCapacity({ files: 2, bytes: 9 * MB }, LIMITS, 1 * MB)).toEqual({ ok: true });
  });

  it('en bajt nad skupno mejo je zavrnjen', () => {
    expect(checkCapacity({ files: 1, bytes: 10 * MB }, LIMITS, 1)).toEqual({ ok: false, reason: 'total-bytes' });
  });

  it('polno število datotek zavrne tudi datoteko velikosti 1 bajt', () => {
    // Predal, ki je prejel svoje tri datoteke, je poln, četudi je prostora še 9 MB.
    expect(checkCapacity({ files: 3, bytes: 1 * MB }, LIMITS, 1)).toEqual({ ok: false, reason: 'file-count' });
  });

  it('število datotek se presoja PRED skupnimi bajti — sporočilo mora povedati tisto, kar pošiljatelj razume', () => {
    // Oboje je preseženo; razlog je "predal je poln", ne "ta datoteka je prevelika".
    expect(checkCapacity({ files: 3, bytes: 10 * MB }, LIMITS, 5 * MB)).toEqual({
      ok: false,
      reason: 'file-count',
    });
  });

  it('nedokončane oddaje ŠTEJEJO — v `usage` so, ker prostor rezervirajo', () => {
    // Dve prispeli in ena, ki se ravno pošilja: naslednja mora biti zavrnjena, čeprav sta na
    // seznamu lastnika videti samo dve.
    expect(checkCapacity({ files: 3, bytes: 2 * MB }, LIMITS, 1)).toEqual({ ok: false, reason: 'file-count' });
  });
});

describe('preostanek za prikaz pošiljatelju', () => {
  it('šteje, kar je ostalo', () => {
    expect(remainingFiles({ files: 1, bytes: 4 * MB }, LIMITS)).toBe(2);
    expect(remainingBytes({ files: 1, bytes: 4 * MB }, LIMITS)).toBe(6 * MB);
  });

  it('nikoli negativno — znižana meja ne sme dati negativne številke', () => {
    // Lastnik je mejo znižal, ko je bilo v predalu že več od nje.
    expect(remainingFiles({ files: 5, bytes: 20 * MB }, LIMITS)).toBe(0);
    expect(remainingBytes({ files: 5, bytes: 20 * MB }, LIMITS)).toBe(0);
  });
});

describe('maxSingleFileBytes — kaj se pošiljatelju pokaže kot dovoljena velikost', () => {
  it('je manjša od meje namestitve in preostanka predala', () => {
    // Namestitev dovoljuje 500 MB, v predalu je prostora za 6 MB: pokazati 500 MB bi pomenilo
    // pošiljatelja, ki pol ure pošilja nekaj, kar bo zavrnjeno.
    expect(maxSingleFileBytes({ files: 1, bytes: 4 * MB }, LIMITS, 500 * MB)).toBe(6 * MB);
  });

  it('meja namestitve prevlada, kadar je manjša od preostanka', () => {
    expect(maxSingleFileBytes({ files: 0, bytes: 0 }, { maxFiles: 3, maxTotalBytes: 900 * MB }, 500 * MB)).toBe(
      500 * MB,
    );
  });

  it('polni predal pokaže 0 in ne meje namestitve', () => {
    expect(maxSingleFileBytes({ files: 3, bytes: 10 * MB }, LIMITS, 500 * MB)).toBe(0);
  });
});
