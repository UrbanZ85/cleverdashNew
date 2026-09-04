import type { Request } from 'express';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createSizeGuard } from '../domain/size-guard.js';
import { discardTemp, openTempWrite, publish } from './blob-storage.service.js';

// research.md §4: 500 MB NE SME skozi pomnilnik.
//
// Vsebnik `api` ima `mem_limit: 1200m` in v njem že raste Chromium (`shm_size: '512m'`,
// infra/docker-compose.yml). Obstoječi vzorec za binarno telo — `express.raw({ limit })` v
// modules/notes/router.ts — telo zbere v `Buffer`. Za 10 MB posnetek je to pravilno, za 500 MB
// datoteko je napaka: dve sočasni nalaganji bi vsebnik ubili.
//
// Zato tu ni nobenega razčlenjevalnika telesa: `req` JE tok in gre naravnost v datoteko.
// Globalni `express.json()` iz main.ts se ga ne dotakne — razume samo `application/json`.

export type UploadOutcome =
  | { status: 'ok'; byteSize: number }
  | { status: 'too-large'; byteSize: number }
  | { status: 'empty' }
  | { status: 'aborted' }
  | { status: 'failed'; error: unknown };

/**
 * Prenese telo zahteve v `tmp/<storageId>.part` in ga ob uspehu objavi v `blobs/`.
 *
 * Ob vsakem drugem izidu (prekoračena meja, prekinjena zahteva, napaka pisanja) se delna
 * datoteka odstrani TAKOJ — FR-006 zahteva, da prekinjeno nalaganje ne pusti ničesar. Pometač
 * (services/cleanup.service.ts) je mreža pod tem, ne prvi obrambni pas.
 */
export async function streamToStorage(req: Request, storageId: string, maxBytes: number): Promise<UploadOutcome> {
  const guard = createSizeGuard(maxBytes);
  let tooLarge = false;
  let swallowed = 0;

  // Števec bajtov MED tokom, ne po njem: odjemalec, ki napove 1 KB in pošlje 900 MB, mora biti
  // ustavljen na kosu, ki mejo prestopi (FR-003) — ne šele na koncu, ko je vsega že na disku.
  //
  // Ko je meja presežena, se pisanje ustavi, branje pa NE: prevelike zahteve ne prekinemo takoj,
  // ampak preostanek telesa POŽREMO. Razlog je odgovor — če strežnik neha brati in odgovori, Node
  // ob nepobranem telesu poruši povezavo (RST) in odjemalec sporočila "datoteka je prevelika"
  // sploh ne vidi, ampak dobi omrežno napako. Isto počne `body-parser` (`dump`).
  //
  // Požiranje je omejeno: ko preseže še eno mejo, se povezava prekine. Vljudnost do odjemalca,
  // ki se je zmotil, ne sme postati brezplačen kanal za tistega, ki laže namerno.
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      if (tooLarge) {
        swallowed += chunk.length;
        if (swallowed > maxBytes) req.destroy();
        done();
        return;
      }
      if (!guard.push(chunk.length)) {
        tooLarge = true;
        done();
        return;
      }
      done(null, chunk);
    },
  });

  const target = await openTempWrite(storageId);

  try {
    await pipeline(req, meter, target);
  } catch (error) {
    await discardTemp(storageId);
    if (tooLarge) return { status: 'too-large', byteSize: guard.total() };
    // `req.destroyed` po neuspeli cevi pomeni, da je odjemalec odšel (zaprt zavihek, izgubljeno
    // omrežje) — to ni napaka strežnika in se ne sme prijaviti kot taka.
    if (req.destroyed || (req as Request & { aborted?: boolean }).aborted) return { status: 'aborted' };
    return { status: 'failed', error };
  }

  if (tooLarge) {
    await discardTemp(storageId);
    return { status: 'too-large', byteSize: guard.total() };
  }

  if (guard.total() === 0) {
    await discardTemp(storageId);
    return { status: 'empty' };
  }

  try {
    await publish(storageId);
  } catch (error) {
    await discardTemp(storageId);
    return { status: 'failed', error };
  }

  return { status: 'ok', byteSize: guard.total() };
}
