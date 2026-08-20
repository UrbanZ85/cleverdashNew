import mongoose from 'mongoose';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

/** Vzpostavi povezavo na MongoDB. Modeli se registrirajo z lastnim uvozom (side-effect
 * `mongoose.model(...)`), zato mora biti ta klic prvi, preden se modeli uporabijo.
 *
 * Preverja `mongoose.connection.readyState` neposredno, ne lastne zastavice — v testih
 * (apps/api/tests/setup/mongo-memory.ts) poveže mongoose ŽE testni pripomoček, preden
 * `createApp()` sploh steče. Lastna zastavica bi to ne vedela in bi poskusila drugo
 * povezavo na izmišljen MONGO_URI, kar Mongoose zavrne ("different connection strings"). */
export async function connectMongo(env: Env, logger: Logger): Promise<typeof mongoose> {
  if (mongoose.connection.readyState !== 0) return mongoose; // že povezano ali v povezovanju
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI);
  logger.info({ event: 'mongo.connected' }, 'Povezava na MongoDB vzpostavljena');
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

export function isMongoHealthy(): boolean {
  return mongoose.connection.readyState === 1;
}
