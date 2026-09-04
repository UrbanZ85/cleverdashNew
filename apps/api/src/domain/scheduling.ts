import { DateTime } from 'luxon';

// research.md §4, docs/legacy-engine.md §4.4: dejanski čas akcije se izračuna EKNRAT, ob
// sestavljanju načrta, kot `base + random(0..jitterSeconds)` nad celotnim instantom — ne z
// ločenim naključenjem minut in sekund na poljih Date, kar je stari sistem prelilo v
// naslednjo uro nenamerno in nekontrolirano. Tukaj je prelivanje v naslednjo uro
// (dovoljeno, pričakovano znotraj `jitterSeconds`) ločeno od NEKONTROLIRANEGA prelivanja
// (prepovedano — stari hrošč).
//
// DST: `DateTime.fromObject` v Luxonu za neobstoječo lokalno uro (pomladanski preskok)
// samodejno pristane na prvem obstoječem trenutku za njo, za podvojeno uro (jesenski
// povratek) pa privzeto vrne PRVO pojavitev — oboje natanko po research.md §4. Preverjeno
// z realnim Luxonom (ne le dokumentacija), glej tests/unit/scheduling.spec.ts.

export interface ScheduledInstant {
  /** UTC instant, z že vračunanim raztrosom — shrani se, ne preračunava ob prikazu. */
  scheduledAt: Date;
  /** Dejanski dodani raztros v sekundah, znotraj `[0, jitterSeconds]`. */
  appliedJitterSeconds: number;
}

/**
 * Izračuna dejanski trenutek izvedbe iz lokalnega datuma, lokalnega časa brez raztrosa
 * (`"06:18:00"`) in največjega dovoljenega raztrosa v sekundah.
 *
 * @param localDate `YYYY-MM-DD`
 * @param baseLocalTime `HH:mm:ss`, lokalni čas brez raztrosa
 * @param jitterSeconds največji dovoljeni raztros; dejanski je `random(0, jitterSeconds)`
 * @param zone časovni pas — vedno `Europe/Ljubljana` v tem sistemu (člen V.4)
 * @param randomFn vbrizgan generator naključnih števil `[0,1)`, privzeto `Math.random` — za
 *   testabilnost brez naključnosti (poimenski primeri morajo biti deterministični)
 */
export function computeScheduledInstant(
  localDate: string,
  baseLocalTime: string,
  jitterSeconds: number,
  zone: string,
  randomFn: () => number = Math.random,
): ScheduledInstant {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute, second] = baseLocalTime.split(':').map(Number);

  const base = DateTime.fromObject({ year, month, day, hour, minute, second }, { zone });
  if (!base.isValid) {
    throw new Error(
      `Neveljaven lokalni datum/čas za izračun načrta: ${localDate} ${baseLocalTime} (${base.invalidReason}: ${base.invalidExplanation})`,
    );
  }

  const appliedJitterSeconds = jitterSeconds > 0 ? Math.floor(randomFn() * (jitterSeconds + 1)) : 0;
  const scheduled = base.plus({ seconds: appliedJitterSeconds });

  return { scheduledAt: scheduled.toJSDate(), appliedJitterSeconds };
}
