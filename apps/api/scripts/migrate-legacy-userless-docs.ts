// research.md §7, FR-013/FR-014, quickstart.md §6, tasks.md T055: ROČNA REZERVA za
// `migration.service.ts` (klican samodejno ob prijavi admina, glej modules/auth/router.ts
// `GET /auth/callback`). Ta skript je namenjen primeru, ko noben uporabnik NIKOLI ne dobi
// `admin` scope-a (npr. napačno nastavljena Keycloak vloga) — operater ga požene ročno in
// eksplicitno izbere prejemnika starih (pred-004) podatkov brez `userId`.
//
// Idempotenten: če je ciljni uporabnik že prevzel podatke (`migratedLegacyDataAt` nastavljen),
// skript ne naredi ničesar (razen z `--force`); poganjanje po uspešnem prevzemu je no-op, ker
// noben dokument več ne ustreza `{ userId: { $exists: false } }`.
//
// Uporaba:
//   npx tsx scripts/migrate-legacy-userless-docs.ts --email admin@example.com
//   npx tsx scripts/migrate-legacy-userless-docs.ts --user-id 6512...   (Mongo ObjectId)
//   npx tsx scripts/migrate-legacy-userless-docs.ts --email admin@example.com --force

import { loadEnv } from '../src/platform/config/env.js';
import { getLogger } from '../src/platform/logging/logger.js';
import { connectMongo, disconnectMongo } from '../src/platform/db/mongoose.js';
import { UserModel } from '../src/modules/auth/models/user.model.js';
import { LEGACY_OWNERLESS_MODELS } from '../src/platform/migration/legacy-userless-migration.service.js';

function parseArgs(argv: string[]): { email?: string; userId?: string; force: boolean } {
  const result: { email?: string; userId?: string; force: boolean } = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--email') result.email = argv[++i];
    else if (arg === '--user-id') result.userId = argv[++i];
    else if (arg === '--force') result.force = true;
  }
  return result;
}

async function main(): Promise<void> {
  const { email, userId, force } = parseArgs(process.argv.slice(2));
  if (!email && !userId) {
    console.error('Uporaba: npx tsx scripts/migrate-legacy-userless-docs.ts --email <e-pošta> | --user-id <id> [--force]');
    process.exitCode = 1;
    return;
  }

  const env = loadEnv();
  const logger = getLogger(env);
  await connectMongo(env, logger);

  try {
    const user = userId ? await UserModel.findById(userId) : await UserModel.findOne({ email: email!.toLowerCase() });
    if (!user) {
      console.error(`Uporabnik ${userId ? `z id "${userId}"` : `z e-pošto "${email}"`} ne obstaja. Prijaviti se mora vsaj enkrat, preden mu je mogoče pripisati stare podatke.`);
      process.exitCode = 1;
      return;
    }

    if (user.migratedLegacyDataAt && !force) {
      console.log(
        `Uporabnik ${user.email} je stare podatke že prevzel (${user.migratedLegacyDataAt.toISOString()}). Nič ni bilo storjeno — dodaj --force za ponovni zagon.`,
      );
      return;
    }

    const targetId = String(user._id);
    let totalMatched = 0;
    for (const LegacyModel of LEGACY_OWNERLESS_MODELS) {
      const res = await LegacyModel.updateMany({ userId: { $exists: false } }, { $set: { userId: targetId } });
      totalMatched += res.modifiedCount;
    }
    await UserModel.updateOne({ _id: targetId }, { $set: { migratedLegacyDataAt: new Date() } });

    console.log(`Prevzem starih podatkov za ${user.email} (${targetId}) zaključen — posodobljenih dokumentov: ${totalMatched}.`);
  } finally {
    await disconnectMongo();
  }
}

main().catch((err) => {
  console.error('Prevzem starih podatkov ni uspel:', err);
  process.exitCode = 1;
});
