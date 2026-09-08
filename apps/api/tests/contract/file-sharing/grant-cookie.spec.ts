import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, unlock, uploadFile } from './_helpers.js';

// PIŠKOTEK Z DOVOLILNICO NI NIZ, DOKLER TEGA NE PREVERIMO.
//
// `cookie-parser` (main.ts) na VSAK piškotek uporabi `JSONCookies`: vrednost, ki se začne z `j:`,
// razčleni z `JSON.parse` in v `req.cookies` postavi OBJEKT. Vsak `as Record<string, string>` je
// tam zato laž o obliki, ki drži samo, dokler nihče ne poskusi drugače.
//
// Če taka vrednost pride v pogoj poizvedbe, jo Mongoose razume kot OPERATOR (`sanitizeFilter` v
// tem projektu ni vklopljen — in ne more biti, ker bi zahteval `mongoose.trusted()` pri vsakem
// legitimnem `$gt`/`$ne` v vsem zaledju). `{ grant: { $ne: null } }` se tako prevede v "katera
// koli živa dovolilnica za to datoteko", kar je obhod gesla brez enega samega poskusa ugibanja.
//
// Ta test je nastal med varnostnim pregledom 009b; okvara je bila v 009 (javna pot za PREVZEM),
// ne v oddaji. Zapisan je pri prevzemu, ker tam živi.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  setTestEnv();
  await clearTestDb();
});

describe('GET /share/{token}/content — oblika dovolilnice v piškotku', () => {
  it('operator namesto dovolilnice NE odpre vsebine, tudi kadar živa dovolilnica obstaja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token, { content: Buffer.from('tajna vsebina') });

    // Zakonit prejemnik vpiše geslo: od tega trenutka za to datoteko obstaja ŽIVA dovolilnica.
    const legit = await unlock(app, share.token, share.password);
    expect(legit.res.status).toBe(200);

    // Napadalec ima samo naslov (posredovana povezava, zgodovina pogovora) in gesla ne pozna.
    for (const forged of ['j:{"$ne":null}', 'j:{"$gt":""}', 'j:{"$exists":true}', 'j:["x"]']) {
      const res = await request(app)
        .get(`/api/v1/share/${share.token}/content`)
        .set('Cookie', `cd_share=${forged}`);
      expect(res.status, `piškotek ${forged} → ${res.status}`).toBe(401);
      // Odgovor je `problem+json`, ne telo datoteke — zato primerjava nad zapisom odgovora in
      // ne nad `Buffer`, ki ga pri zavrnitvi ni.
      expect(JSON.stringify(res.body)).not.toContain('tajna vsebina');
    }

    // Prava dovolilnica seveda deluje naprej.
    const ok = await request(app)
      .get(`/api/v1/share/${share.token}/content`)
      .set('Cookie', legit.cookie)
      .expect(200);
    expect(Buffer.from(ok.body).toString()).toBe('tajna vsebina');
  });

  it('dovolilnica napačne oblike je 401 in ne 500 — oblika ni namig', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);

    for (const junk of ['prekratko', 'a'.repeat(200), '../../etc/passwd']) {
      await request(app)
        .get(`/api/v1/share/${share.token}/content`)
        .set('Cookie', `cd_share=${junk}`)
        .expect(401);
    }
  });
});
