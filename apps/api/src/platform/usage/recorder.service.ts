import { Types } from 'mongoose';
import { UsageCounterModel } from './usage-counter.model.js';
import { dedupeCutoff, expiryFor, NO_KEY, usageDay } from './domain/usage-day.js';
import { loadEnv } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

// Zapisovalni del telemetrije. Razsodba "ali to šteje" je v FILTRU POIZVEDBE in ne v kodi —
// research.md §4. Zaporedje "preberi zadnji čas → odloči se → zapiši" bi bilo dirka: dva zavihka
// brskalnika bi oba prebrala star čas in oba štela.

/** Mongo koda za kršitev unikatnega indeksa. */
const DUPLICATE_KEY = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === DUPLICATE_KEY;
}

/**
 * Prijava. Šteje se VEDNO — okna proti dvojnemu štetju tu namenoma ni: dve prijavi v minuti sta
 * dve prijavi (dve napravi, dva brskalnika), medtem ko sta dva ogleda istega zavihka v minuti
 * skoraj gotovo ena osvežitev.
 *
 * `E11000` je tu mogoč samo ob dveh HKRATNIH prvih prijavah istega uporabnika v istem dnevu —
 * takrat je zapis medtem nastal in drugi poskus ga samo poveča.
 */
export async function recordLogin(userId: string, at: Date = new Date()): Promise<void> {
  const day = usageDay(at);
  const env = loadEnv();
  const filter = {
    userId: new Types.ObjectId(userId),
    day,
    kind: 'login' as const,
    key: NO_KEY,
  };
  const update = {
    $inc: { count: 1 },
    $set: { lastAt: at, expiresAt: expiryFor(day, env.USAGE_RETENTION_DAYS) },
  };
  try {
    await UsageCounterModel.updateOne(filter, update, { upsert: true });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // Zapis je medtem nastal; zdaj ga samo povečamo. Brez `upsert`, ker vemo, da obstaja.
    await UsageCounterModel.updateOne(filter, update);
  }
}

/**
 * Prijava, ki NE SME podreti prijave.
 *
 * Neuspelo štetje je okvara telemetrije, ne okvara avtentikacije — človek, ki se prijavlja, za to
 * ni kriv in ne sme ostati pred vrati. Napaka gre zato v dnevnik kot opozorilo in ne dlje
 * (člen VII: tiho se ne pogoltne, samo ne blokira).
 */
export async function recordLoginQuietly(userId: string, logger: Logger, at: Date = new Date()): Promise<void> {
  try {
    await recordLogin(userId, at);
  } catch (err) {
    logger.warn(
      { event: 'usage.login_record_failed', userId, reason: err instanceof Error ? err.message : String(err) },
      'Prijave ni bilo mogoče prešteti',
    );
  }
}

/**
 * Ogled zavihka.
 *
 * Vrne `false`, kadar je bil isti zavihek štet pred manj kot `USAGE_VIEW_DEDUPE_SECONDS`. To NI
 * napaka in odjemalec nanj ne reagira (FR-027).
 *
 * Kako to deluje brez branja pred pisanjem: filter poleg ključa zahteva `lastAt: { $lt: cutoff }`.
 * Če zapis obstaja in je mlajši, filter ne ujame ničesar, `upsert` poskusi VSTAVITI — in pade na
 * unikatnem indeksu `(userId, day, kind, key)`. `E11000` je torej pričakovan izid te poti in
 * pomeni "že šteto". Operatorji z `$lt` se ob vstavljanju ne prepišejo v nov dokument (Mongo
 * prepiše samo enakostne pogoje), zato ima vstavljeni zapis prava polja.
 */
export async function recordTabView(userId: string, tabId: string, at: Date = new Date()): Promise<boolean> {
  const env = loadEnv();
  const day = usageDay(at);
  try {
    await UsageCounterModel.updateOne(
      {
        userId: new Types.ObjectId(userId),
        day,
        kind: 'tab-view',
        key: tabId,
        lastAt: { $lt: dedupeCutoff(at, env.USAGE_VIEW_DEDUPE_SECONDS) },
      },
      {
        // `$setOnInsert` za `count` TU NE SME BITI: skupaj z `$inc` nad istim poljem Mongo
        // zahtevo zavrne ("would create a conflict at 'count'"). Ob vstavljanju `$inc` polje
        // ustvari z vrednostjo 1, kar je pravilno. `lastAt` je v filtru operator in se zato v nov
        // dokument ne prepiše — postavi ga `$set` spodaj.
        $inc: { count: 1 },
        $set: { lastAt: at, expiresAt: expiryFor(day, env.USAGE_RETENTION_DAYS) },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if (isDuplicateKeyError(err)) return false;
    throw err;
  }
}
