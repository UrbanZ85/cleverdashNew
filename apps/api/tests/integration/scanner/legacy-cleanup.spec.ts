import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { LEGACY_FLIGHT_COLLECTIONS, dropLegacyFlightSchedulerCollections } from '../../../src/platform/scanner/services/legacy-cleanup.service.js';

// FR-036, research.md §9: tri zastarele zbirke modula 015 se ob zagonu dropnejo (odločitev lastnika
// 19. 10. 2026); vse drugo ostane; drugi klic ne naredi nič.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function collectionNames(): Promise<string[]> {
  return (await mongoose.connection.db!.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
}

describe('drop zastarelih zbirk modula Leti', () => {
  it('dropne tri zbirke s številom dokumentov, pusti ostale, drugi klic je prazen', async () => {
    const db = mongoose.connection.db!;
    for (const name of LEGACY_FLIGHT_COLLECTIONS) await db.collection(name).insertMany([{ a: 1 }, { a: 2 }]);
    await db.collection('flightsearchrules').insertOne({ keep: true });
    await db.collection('flightoffers').insertOne({ keep: true });

    const dropped = await dropLegacyFlightSchedulerCollections(undefined);
    expect(dropped.map((d) => d.collection).sort()).toEqual([...LEGACY_FLIGHT_COLLECTIONS].sort());
    expect(dropped.every((d) => d.documents === 2)).toBe(true);
    const names = await collectionNames();
    for (const name of LEGACY_FLIGHT_COLLECTIONS) expect(names).not.toContain(name);
    expect(names).toContain('flightsearchrules');
    expect(names).toContain('flightoffers');

    expect(await dropLegacyFlightSchedulerCollections(undefined)).toEqual([]);
  });

  it('na prazni bazi ne naredi nič', async () => {
    expect(await dropLegacyFlightSchedulerCollections(undefined)).toEqual([]);
  });
});
