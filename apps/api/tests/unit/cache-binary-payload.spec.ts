import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { getOrRefresh } from '../../src/platform/cache/service.js';

// Regresija: radarska slika (in vsako drugo BINARNO telo — posnetek kamere, vtičnik vrste
// `image`) se je iz predpomnilnika vrnila kot BSON `Binary`, ne kot `Buffer`. Express takega
// objekta ne pošlje kot bajte, ampak ga serializira v JSON (base64 v narekovajih) z glavo
// `image/gif` — brskalnik slike ne izriše in ploščica ostane prazna.
//
// Zato ta test NE preverja "kaj vrne fetcher" (to je bil edini pravilni primer), ampak
// natanko tri poti, ki berejo ŽE SHRANJENO telo: zadetek v TTL, odgovor 304 in `stale` po
// neuspeli osvežitvi. Podatek gre skozi pravo bazo (mongodb-memory-server), ker se napaka
// zgodi šele v pretvorbi Mongo → JS; z izmišljenim repozitorijem je nevidna.

const GIF = Buffer.from('474946383961010001000000', 'hex');

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

function binaryFetcher(body: Buffer) {
  return async () => ({ status: 200 as const, body, contentType: 'image/gif' });
}

async function seed(key: string, ttlSeconds: number): Promise<void> {
  await getOrRefresh({
    key,
    sourceUrl: 'https://example.invalid/radar.gif',
    ttlSeconds,
    fetcher: binaryFetcher(GIF),
  });
}

describe('binarno telo iz predpomnilnika', () => {
  it('zadetek v TTL vrne Buffer z istimi bajti, ne BSON Binary', async () => {
    await seed('test:binary-fresh', 300);

    const hit = await getOrRefresh({
      key: 'test:binary-fresh',
      sourceUrl: 'https://example.invalid/radar.gif',
      ttlSeconds: 300,
      // Znotraj TTL se vir ne kliče — če se, je test sam narobe.
      fetcher: async () => {
        throw new Error('vira se znotraj TTL ne sme klicati');
      },
    });

    expect(hit.freshness.kind).toBe('fresh');
    expect(Buffer.isBuffer(hit.payload)).toBe(true);
    expect(hit.payload).toEqual(GIF);
    expect(hit.contentType).toBe('image/gif');
  });

  it('odgovor 304 vrne shranjeno telo kot Buffer', async () => {
    await seed('test:binary-304', 0); // TTL 0 — vsak naslednji klic poskusi osvežitev

    const revalidated = await getOrRefresh({
      key: 'test:binary-304',
      sourceUrl: 'https://example.invalid/radar.gif',
      ttlSeconds: 0,
      fetcher: async () => ({ status: 304 as const }),
    });

    expect(Buffer.isBuffer(revalidated.payload)).toBe(true);
    expect(revalidated.payload).toEqual(GIF);
  });

  it('zadnje znano telo po neuspeli osvežitvi je Buffer', async () => {
    await seed('test:binary-stale', 0);

    const stale = await getOrRefresh({
      key: 'test:binary-stale',
      sourceUrl: 'https://example.invalid/radar.gif',
      ttlSeconds: 0,
      fetcher: async () => {
        throw new Error('vir ne odgovarja');
      },
    });

    expect(stale.freshness.kind).toBe('stale');
    expect(Buffer.isBuffer(stale.payload)).toBe(true);
    expect(stale.payload).toEqual(GIF);
  });
});
