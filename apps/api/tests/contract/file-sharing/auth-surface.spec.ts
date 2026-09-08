import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';

// research.md §2: 009 uvaja PRVO neavtenticirano pot v tem zaledju. Javnost ni nov vratar,
// ampak ODSOTNOST klica `requireScopes` — kar je nevarno natanko zato, ker se ne vidi.
//
// Ta test zato ne našteva poti ročno: prebere jih iz POGODBE. Nova pot, dodana v
// `public.router.ts` brez vpisa v pogodbo, tu pade; nova pot, dodana v pogodbo pod `/files`
// brez `requireScopes`, pa pade na zahtevi po 401.
//
// 009b doda drugo javno družino (`/drop/*`) in drugo lastnikovo (`/inboxes*`). Seznama predpon
// spodaj sta zato NAŠTETA IN ZAPRTA: pot, ki ne sodi v nobeno od obeh, je napaka testa — in prav
// to je namen. Nova javna družina se ne more pritihotapiti tako, da bi jo test razumel kot
// pričakovano; nekdo jo mora tukaj izrecno napisati in se ob tem vprašati, ali sme biti javna.

// Pot je izpeljana iz TE datoteke, ne iz `process.cwd()`: vitest se zažene enkrat iz
// `apps/api`, drugič iz korena repozitorija, in test, ki bi bil odvisen od tega, bi padel
// odvisno od tega, kako ga kdo požene.
const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = resolve(HERE, '../../../../..', 'specs/009-file-sharing/contracts/openapi.yaml');

/** Poti iz pogodbe brez razčlenjevalnika YAML (nova odvisnost za štiri vrstice se ne izplača):
 * ključi na drugi ravni, ki se začnejo s `/`. */
function contractPaths(): string[] {
  const yaml = readFileSync(CONTRACT, 'utf8');
  return [...yaml.matchAll(/^ {2}(\/[^\s:]*):/gm)].map((m) => m[1]!);
}

/** Poti LASTNIKA — vsaka MORA brez žetona vrniti 401. */
const OWNER_PREFIXES = ['/files', '/inboxes'];
/** JAVNE poti — vsaka MORA biti dosegljiva brez žetona in nikoli preusmeriti na prijavo. */
const PUBLIC_PREFIXES = ['/share/', '/drop/'];

function isOwnerPath(path: string): boolean {
  return OWNER_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Nadomesti parametre v poti z vrednostmi, ki so oblikovno veljavne, a ne obstajajo. */
function sampleUrl(path: string): string {
  return `/api/v1${path}`
    .replace('{fileId}', '6a97d31d841a5cf8bbc4e6e3')
    .replace('{inboxId}', '6a97d31d841a5cf8bbc4e6e4')
    .replace('{token}', 'aaaaaaaaaaaaaaaaaaaaaa');
}

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv();
  await clearTestDb();
});

describe('Površina avtentikacije (009)', () => {
  it('pogodba pozna natanko dve vrsti poti: lastnikove in javne', () => {
    const paths = contractPaths();
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      // Vsaka pot je ali lastnikova (obseg obvezen) ali javna (obsega ni in ne sme biti). Tretje
      // možnosti ni: pot, ki ne sodi nikamor, je pot, o kateri nihče ni odločil, kdo jo sme
      // klicati.
      expect(isOwnerPath(path) || isPublicPath(path), `${path} ni ne lastnikova ne javna`).toBe(true);
      expect(isOwnerPath(path) && isPublicPath(path), `${path} je oboje`).toBe(false);
    }
  });

  it('obe javni družini sta v pogodbi in javnost je tam ZAPISANA', () => {
    // Javnost je normativen del pogodbe, ne implementacijska podrobnost (glej opis modula).
    // Manjkajoč `security: []` bi pomenil pot, ki je v kodi javna, v pogodbi pa ne.
    const yaml = readFileSync(CONTRACT, 'utf8');
    const publicPaths = contractPaths().filter(isPublicPath);
    expect(publicPaths.some((path) => path.startsWith('/share/'))).toBe(true);
    expect(publicPaths.some((path) => path.startsWith('/drop/'))).toBe(true);
    // Vsaka javna OPERACIJA ima svoj `security: []`; operacij je vsaj toliko kot poti.
    const declared = [...yaml.matchAll(/^ {6}security: \[\]$/gm)].length;
    expect(declared).toBeGreaterThanOrEqual(publicPaths.length);
  });

  it('VSAK lastnikov endpoint brez žetona vrne 401', async () => {
    const { app } = await createApp();
    for (const path of contractPaths().filter(isOwnerPath)) {
      const url = sampleUrl(path);
      const res = await request(app).get(url);
      // 401 tudi takrat, kadar metoda GET za to pot ne obstaja — 404 metode bi pomenil, da
      // vratar sploh ni bil dosežen, kar je natanko tisto, česar tu ne smemo spregledati.
      expect([401, 404], `${url} → ${res.status}`).toContain(res.status);
      if (res.status === 404) {
        // Express vrne 404 za neobstoječo KOMBINACIJO poti in metode; preverimo še POST.
        const post = await request(app).post(url);
        expect([401, 404], `POST ${url} → ${post.status}`).toContain(post.status);
      }
    }
  });

  it('GET /files brez žetona je 401 in ne prazen seznam', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/files');
    expect(res.status).toBe(401);
    expect(res.body.files).toBeUndefined();
  });

  it('GET /inboxes brez žetona je 401 in ne prazen seznam (009b)', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/inboxes');
    expect(res.status).toBe(401);
    expect(res.body.inboxes).toBeUndefined();
  });

  it('VSAK javni endpoint je dosegljiv BREZ žetona — ne preusmerja na prijavo', async () => {
    const { app } = await createApp();
    for (const path of contractPaths().filter(isPublicPath)) {
      const url = sampleUrl(path);
      const res = await request(app).get(url);
      // Neobstoječ žeton da 404 (FR-023, FR-085) ali 401 zaradi manjkajoče dovolilnice — nikoli
      // pa 302 na prijavo in nikoli 401 z razlogom "zahtevana je avtentikacija". Pri poteh, ki
      // metode GET ne poznajo (oddaja je POST oz. PUT), je 404 Expressa prav tako v redu:
      // pomembno je, da zahteve ni zavrnil vratar.
      expect([401, 404], `${url} → ${res.status}`).toContain(res.status);
      expect(res.headers.location).toBeUndefined();
      if (res.status === 401) expect(res.body.detail).not.toContain('Zahtevana je avtentikacija');
    }
  });

  it('javne poti za ODDAJO brez dovolilnice ne ustvarijo ničesar (009b)', async () => {
    // Najhujše, kar je do 009b znal narediti kdor koli z naslovom, je bilo BRANJE. `/drop/*`
    // piše na disk, zato mora biti izrecno preverjeno, da brez `X-Drop-Ticket` ni zapisa — tudi
    // ob povsem pravilnem telesu.
    const { app } = await createApp();
    const token = 'aaaaaaaaaaaaaaaaaaaaaa';

    const declared = await request(app)
      .post(`/api/v1/drop/${token}/files`)
      .send({ fileName: 'racun.pdf', byteSize: 10 });
    // 404, ker predal ne obstaja — pri obstoječem predalu brez dovolilnice bi bil 401. V nobenem
    // primeru ne 201 in nobenega `uploadUrl`.
    expect([401, 404]).toContain(declared.status);
    expect(declared.body.id).toBeUndefined();
    expect(declared.body.uploadUrl).toBeUndefined();

    const content = await request(app)
      .put(`/api/v1/drop/${token}/files/6a97d31d841a5cf8bbc4e6e3/content`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('vsebina'));
    expect([401, 404]).toContain(content.status);
  });

  it('javna pot ne pade, kadar odjemalec pošlje NEVELJAVEN žeton seje', async () => {
    // Javna stran mora delovati tudi za nekoga, ki ima v brskalniku potekel žeton CleverDasha.
    // Zato odjemalec `Authorization` na `/share/*` sploh ne pripenja (auth.interceptor.ts).
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/share/aaaaaaaaaaaaaaaaaaaaaa');
    expect(res.status).toBe(404);
    expect(res.body.detail).toContain('Ta povezava ne velja');
  });
});
