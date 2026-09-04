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

/** Nadomesti parametre v poti z vrednostmi, ki so oblikovno veljavne, a ne obstajajo. */
function sampleUrl(path: string): string {
  return `/api/v1${path}`.replace('{fileId}', '6a97d31d841a5cf8bbc4e6e3').replace('{token}', 'aaaaaaaaaaaaaaaaaaaaaa');
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
  it('pogodba pozna natanko dve vrsti poti: /files* (lastnik) in /share/* (javno)', () => {
    const paths = contractPaths();
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.startsWith('/files') || path.startsWith('/share/')).toBe(true);
    }
  });

  it('VSAK /files* endpoint brez žetona vrne 401', async () => {
    const { app } = await createApp();
    for (const path of contractPaths().filter((p) => p.startsWith('/files'))) {
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

  it('VSAK /share/* endpoint je dosegljiv BREZ žetona — ne preusmerja na prijavo', async () => {
    const { app } = await createApp();
    for (const path of contractPaths().filter((p) => p.startsWith('/share/'))) {
      const url = sampleUrl(path);
      const res = await request(app).get(url);
      // Neobstoječ žeton da 404 (FR-023) ali 401 zaradi manjkajoče dovolilnice — nikoli pa
      // 302 na prijavo in nikoli 401 z razlogom "zahtevana je avtentikacija".
      expect([401, 404], `${url} → ${res.status}`).toContain(res.status);
      expect(res.headers.location).toBeUndefined();
      if (res.status === 401) expect(res.body.detail).not.toContain('Zahtevana je avtentikacija');
    }
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
