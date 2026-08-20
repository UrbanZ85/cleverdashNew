import { afterAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getOrRefresh } from '../../src/platform/cache/service.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';
import { disconnectMongo, connectMongo } from '../../src/platform/db/mongoose.js';
import { setTestEnv } from '../setup/test-env.js';
import { loadEnv } from '../../src/platform/config/env.js';

// research.md §4: zadnji znani podatek preživi ponovni zagon PROCESA — v produkciji baza
// teče ločeno od API vsebnika in se ob njegovem restartu ne izprazni. Ta test to dokaže
// tako, da mongoose dejansko odklopi in znova poveže na ISTO bazo (ne na novo), kar
// simulira restart procesa brez restarta baze.

let server: MongoMemoryServer;

afterAll(async () => {
  await disconnectMongo();
  await server?.stop();
});

describe('predpomnilnik preživi ponovni zagon procesa', () => {
  it('zapis, pridobljen pred "restartom", je berljiv po njem', async () => {
    setTestEnv();
    server = await MongoMemoryServer.create();
    const uri = server.getUri();

    // "Proces 1": vzpostavi povezavo prek iste poti kot main.ts (connectMongo), pridobi podatek.
    await connectMongo({ ...loadEnv(), MONGO_URI: uri }, { info: () => undefined } as unknown as import('pino').Logger);
    await getOrRefresh({
      key: 'restart-test',
      sourceUrl: 'https://example.invalid',
      ttlSeconds: 300,
      fetcher: async () => ({ status: 200, body: { preživelo: true }, contentType: 'application/json' }),
    });

    // "Restart": odklopi mongoose popolnoma (simulira konec procesa), NE ustavi baze same.
    await disconnectMongo();
    expect(mongoose.connection.readyState).toBe(0);

    // "Proces 2": nova povezava na ISTO bazo (isti uri) — kot bi bil to nov zagon vsebnika.
    await connectMongo({ ...loadEnv(), MONGO_URI: uri }, { info: () => undefined } as unknown as import('pino').Logger);
    const record = await ExternalCacheModel.findOne({ key: 'restart-test' }).lean();

    expect(record).not.toBeNull();
    expect(record?.payload).toEqual({ preživelo: true });
  });
});
