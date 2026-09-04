import { DateTime } from 'luxon';

// Čista domenska plast (člen IX): brez baze in brez strežnika, zato je prehod na poletni oz.
// zimski čas mogoče testirati brez čakanja na marec.
//
// Člen V.4: koledarski dan se NIKOLI ne izpelje iz zapisa UTC. `toISOString().split('T')[0]`
// je prepovedan z ESLint pravilom (eslint.config.js) — v poletnem času da napačen dan.
// Konstanta cone je lokalna, kot v modules/time-tracking/*; pravilo, ki jo utemeljuje, je
// zapisano v src/domain/timezone.ts.
const ZONE = 'Europe/Ljubljana';

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'later';

/**
 * Koledarski dan (`YYYY-MM-DD`, kar da izbirnik datuma) v UTC instant KONCA tega dneva v
 * ljubljanski coni.
 *
 * Konec dneva in ne začetek: opravilo z rokom "danes" ne sme zamujati že ob 00:00 (FR-032).
 *
 * Prek luxona in ne s fiksnim odmikom: 29. 3. 2026 je dolg 23 ur in 25. 10. 2026 25 ur, zato
 * `+01:00` ali `+02:00` na enem od teh dni da napačen instant.
 *
 * `null` pomeni BREZ ROKA, ne "danes" (FR-030) — enak dogovor kot `SharedFile.expiresAt`.
 */
export function parseDueDate(input: string | null | undefined): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const dt = DateTime.fromISO(input, { zone: ZONE });
  if (!dt.isValid) return null;
  return dt.endOf('day').toUTC().toJSDate();
}

/** Začetek koledarskega dne, ki mu instant pripada, v ljubljanski coni. */
function ljubljanaStartOfDay(date: Date): DateTime {
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(ZONE).startOf('day');
}

/**
 * Stanje roka glede na `now`, primerjano po KOLEDARSKEM DNEVU v Ljubljani — ne po razliki v
 * milisekundah.
 *
 * Razlika v milisekundah bi bila napačna dvakrat: rok "danes ob 23:59" bi bil ob 08:00
 * oddaljen manj kot dan in bi štel za "danes" tudi 30. decembra ob 23:30 za rok 31. decembra,
 * in na dan prehoda časa bi 24-urni korak zgrešil mejo dneva za uro.
 *
 * Luxonov `diff` v enotah `days` med dvema začetkoma dneva je koledarski, ne 24-urni: med
 * 29. in 30. marcem 2026 vrne 1, čeprav je vmes 23 ur.
 */
export function dueState(dueDate: Date | null | undefined, now: Date): DueState | null {
  if (!dueDate) return null;
  const days = Math.round(ljubljanaStartOfDay(dueDate).diff(ljubljanaStartOfDay(now), 'days').days);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return 'later';
}

/**
 * Najzgodnejši rok med NEODKLJUKANIMI opravili, ali `null`.
 *
 * Odkljukana se ne štejejo (FR-034): opravljeno opravilo z včerajšnjim rokom ni zamuda, in
 * značka na zavihku, ki bi ga štela, bi silila uporabnika, da išče napako, ki je ni.
 */
export function nextDueDate(
  tasks: readonly { done: boolean; dueDate: Date | null }[],
): Date | null {
  let earliest: Date | null = null;
  for (const task of tasks) {
    if (task.done || !task.dueDate) continue;
    if (earliest === null || task.dueDate.getTime() < earliest.getTime()) earliest = task.dueDate;
  }
  return earliest;
}
