import { PlannedActionModel } from '../models/planned-action.model.js';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';

type StaleEnv = Pick<Env, 'BROWSER_PROTOCOL_TIMEOUT_MS'>;

/**
 * Koliko časa sme akcija stati v `running`, preden velja za obtičalo.
 *
 * Izpeljano iz `BROWSER_PROTOCOL_TIMEOUT_MS` (privzeto 60 s) s petkratno rezervo, najmanj pa
 * pet minut: dlje od tega noben pošten klik ne traja, ker ga prej ustavi Puppeteerjeva
 * časovna omejitev in `catch` v koraku tika akcijo vrne v `due`.
 */
export function staleRunningMs(env: StaleEnv): number {
  return Math.max(5 * 60_000, env.BROWSER_PROTOCOL_TIMEOUT_MS * 5);
}

/**
 * Vrne obtičale akcije iz `running` nazaj v `due`.
 *
 * `running` je bil doslej SLEPA ULICA. Postavi ga korak za obdelavo zapadlih
 * (scheduler-steps.ts) tik pred izvedbo, izhod iz njega pa ima samo uspešna ali neuspešna
 * izvedba — če proces med izvedbo ugasne (restart strežnika, izpad, ubit proces), zapis ostane
 * `running` za vedno: poizvedba po zapadlih ga ne pobere (išče `planned`/`due`), polnočno
 * zaprtje pa gleda samo pretekle dneve. Akcija tako obvisi do naslednje polnoči, `upsert` v
 * `buildPlanForDay` je zaradi nje blokiran (edinstveni indeks na dan+profil+akcija), zato
 * urnika za tisti dan ni več mogoče niti osvežiti.
 *
 * To je natanko primer iz člena V.2 ustave — "vsak tik se vpraša, kaj bi moralo biti do zdaj
 * narejeno in ni, in to dohiti". Vrnitev v `due` prepusti odločitev obstoječi logiki: znotraj
 * `maxDelayMinutes` se akcija izvede, izven nje postane `missed`.
 */
export async function reclaimStaleRunning(env: StaleEnv, logger: Logger): Promise<number> {
  const cutoff = new Date(Date.now() - staleRunningMs(env));
  const stuck = await PlannedActionModel.find({
    state: 'running',
    updatedAt: { $lte: cutoff },
  } as Record<string, unknown>);

  for (const action of stuck) {
    action.state = 'due';
    action.failureReason =
      'Izvedba se ni zaključila (najverjetneje ponovni zagon strežnika sredi akcije) — akcija je vrnjena med zapadle.';
    await action.save();
    logger.warn(
      {
        event: 'time_tracking.stale_running_reclaimed',
        plannedActionId: String(action._id),
        localDate: action.localDate,
        actionName: action.actionName,
      },
      'Akcija je obtičala v stanju running in je vrnjena med zapadle',
    );
  }

  return stuck.length;
}
