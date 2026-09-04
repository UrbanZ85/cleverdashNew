import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setTestEnv } from '../setup/test-env.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import {
  parseBaseHosts,
  listEffectiveEmbedHosts,
  addEmbedHost,
  removeEmbedHost,
} from '../../src/modules/cameras/services/embed-allowlist.service.js';

// quickstart.md §4, primer 10. `parseBaseHosts` je čista funkcija (brez baze); preostale
// funkcije berejo/pišejo `cameraEmbedAllowlist`, zato ta datoteka (kot edina med "enotskimi"
// testi domenske logike 003) uporabi v-pomnilniško Mongo — enak vzorec kot pogodbeni/
// integracijski testi, ker gre za storitveno, ne čisto domensko plast.

beforeAll(async () => {
  setTestEnv({ CAMERA_ALLOWED_EMBED_HOSTS: 'youtube.com,ipcamlive.com' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('parseBaseHosts', () => {
  it('razčleni vejico-ločen seznam, obreže presledke, mala črka', () => {
    expect(parseBaseHosts('Youtube.com, ipcamlive.com ,,istrastream.com')).toEqual([
      'youtube.com',
      'ipcamlive.com',
      'istrastream.com',
    ]);
  });
});

describe('listEffectiveEmbedHosts — unija osnovnega in uporabniškega seznama', () => {
  it('brez uporabniških dodatkov vrne samo osnovni seznam', async () => {
    const hosts = await listEffectiveEmbedHosts();
    expect(hosts).toEqual([
      { host: 'youtube.com', source: 'base' },
      { host: 'ipcamlive.com', source: 'base' },
    ]);
  });

  it('dodan uporabniški gostitelj se pojavi poleg osnovnega seznama', async () => {
    await addEmbedHost('example.com', 'Testna kamera');
    const hosts = await listEffectiveEmbedHosts();
    expect(hosts).toContainEqual({ host: 'youtube.com', source: 'base' });
    expect(hosts).toContainEqual({ host: 'example.com', source: 'user', addedReason: 'Testna kamera' });
  });

  it('dodajanje gostitelja, ki je že na osnovnem seznamu, zavrne', async () => {
    await expect(addEmbedHost('youtube.com')).rejects.toThrow();
  });

  it('osnovnega gostitelja ni mogoče odstraniti prek storitve', async () => {
    await expect(removeEmbedHost('youtube.com')).rejects.toThrow();
    const hosts = await listEffectiveEmbedHosts();
    expect(hosts).toContainEqual({ host: 'youtube.com', source: 'base' });
  });

  it('odstranitev neobstoječega uporabniškega gostitelja vrne napako, ne tiho uspe', async () => {
    await expect(removeEmbedHost('ni-dodan.example.org')).rejects.toThrow();
  });

  it('odstranitev uporabniškega gostitelja ne vpliva na osnovni seznam', async () => {
    await addEmbedHost('example.com');
    await removeEmbedHost('example.com');
    const hosts = await listEffectiveEmbedHosts();
    expect(hosts).toEqual([
      { host: 'youtube.com', source: 'base' },
      { host: 'ipcamlive.com', source: 'base' },
    ]);
  });
});
