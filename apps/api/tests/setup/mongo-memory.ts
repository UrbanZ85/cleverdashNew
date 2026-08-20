import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Skupen pripomoček za teste, ki potrebujejo pravo (v-pomnilniško) MongoDB — pogodbeni in
// integracijski testi po tasks.md Phase 3+. Enotski testi čiste domenske logike (člen IX,
// npr. apps/api/src/domain/freshness.ts iz US2) tega NE potrebujejo in ga ne uvažajo.

let server: MongoMemoryServer | undefined;

export async function startTestDb(): Promise<string> {
  server = await MongoMemoryServer.create();
  const uri = server.getUri();
  await mongoose.connect(uri);
  return uri;
}

export async function stopTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  await server?.stop();
  server = undefined;
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
