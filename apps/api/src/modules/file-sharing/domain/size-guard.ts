// FR-003, research.md §4: meja velikosti se uveljavi DVAKRAT.
//
//  1. `checkDeclared` iz glave `Content-Length`, PREDEN se odpre datoteka na disku;
//  2. `createSizeGuard` med samim pisanjem, na vsakem kosu toka.
//
// Drugo preverjanje ni podvajanje prvega: `Content-Length` je odjemalčeva OBLJUBA, ne dejstvo.
// Odjemalec, ki napove 1 KB in pošlje 900 MB, mora biti ustavljen na kosu, ki mejo prestopi —
// ne šele na koncu, ko je vsega že na disku.
//
// Člen IX: čiste funkcije, brez baze, omrežja in datotečnega sistema.

export type DeclaredSizeVerdict = 'ok' | 'missing' | 'invalid' | 'too-large' | 'empty';

/**
 * Presodi napovedano velikost.
 *
 * Odsoten `Content-Length` je ZAVRNJEN, ne obravnavan kot "neznano": brez napovedi ni mogoče
 * preveriti kvote pred prenosom, prejemnik pa ne bi videl napredka.
 */
export function checkDeclared(contentLength: string | number | undefined | null, maxBytes: number): DeclaredSizeVerdict {
  if (contentLength === undefined || contentLength === null || contentLength === '') return 'missing';
  const value = typeof contentLength === 'number' ? contentLength : Number(contentLength);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return 'invalid';
  if (value === 0) return 'empty';
  return value > maxBytes ? 'too-large' : 'ok';
}

export interface SizeGuard {
  /** Vrne `false`, ko je meja PRESEŽENA — klicatelj mora takrat tok uničiti in `.part` odstraniti. */
  push(chunkLength: number): boolean;
  total(): number;
  exceeded(): boolean;
}

/** Točno `maxBytes` je še dovoljeno; `maxBytes + 1` ni. */
export function createSizeGuard(maxBytes: number): SizeGuard {
  let written = 0;
  let over = false;
  return {
    push(chunkLength: number): boolean {
      written += chunkLength;
      if (written > maxBytes) over = true;
      return !over;
    },
    total: () => written,
    exceeded: () => over,
  };
}
