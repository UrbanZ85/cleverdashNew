import { DateTime } from 'luxon';
import { ljubljanaCalendarDay } from '../../../domain/timezone.js';

// Čiste funkcije za dnevni ključ števca in njegov rok hrambe (člen IX: brez baze, brez
// strežnika, brez ure sistema razen tiste, ki jo klicatelj poda).

const ZONE = 'Europe/Ljubljana';

/** Oblika ključa `day`. Uporablja jo tudi analitika pri sestavljanju okna. */
export const DAY_FORMAT = 'yyyy-LL-dd';

/** Konstanta za `key` pri dogodku, ki nima zavihka (prijava).
 *
 * `null` bi bil bolj pošten zapis, a unikaten indeks `(userId, day, kind, key)` je EDINO, kar
 * loči dvojnik od povečanja (research.md §4). Delni ali `sparse` indeks bi vrstice prijav iz
 * indeksa izpustil in dvojnike spustil skozi — kar je natanko okvara, ki jo indeks preprečuje.
 */
export const NO_KEY = '-';

/**
 * Koledarski dan števca v `Europe/Ljubljana` (člen V.4).
 *
 * Nikoli `toISOString().split('T')[0]`: v poletnem času da napačen dan in ima to v tem projektu
 * zgodovino (docs/legacy-engine.md §4). Ob 23:30 CEST je še vedno današnji dan, ne jutrišnji.
 */
export function usageDay(at: Date): string {
  return ljubljanaCalendarDay(at);
}

/**
 * Kdaj sme števec tega dneva izginiti.
 *
 * Izračunan iz DNEVA in ne iz časa zapisa — zato je vrednost ob vsakem povečanju ista in je
 * `$set` idempotenten. Sicer bi števec, ki raste ves dan, svoj rok ves dan odrival pred sabo in
 * bi se rok hrambe tiho raztegnil na "zadnja uporaba + 400 dni".
 *
 * Konec dneva in ne začetek: števec za 1. januar se pobriše po koncu 1. januarja + N dni, ne
 * pol dneva prej.
 */
export function expiryFor(day: string, retentionDays: number): Date {
  const parsed = DateTime.fromFormat(day, DAY_FORMAT, { zone: ZONE });
  if (!parsed.isValid) throw new Error(`Neveljaven dan števca: ${day}`);
  return parsed.plus({ days: retentionDays }).endOf('day').toUTC().toJSDate();
}

/**
 * Meja, pod katero ponoven ogled istega zavihka ne šteje znova (FR-027).
 *
 * Vrne trenutek: zapis, katerega `lastAt` je STAREJŠI od te meje, se sme povečati. Primerjava je
 * v poizvedbi (`lastAt: { $lt: cutoff }`), ne v kodi — razsodba mora biti del atomarnega
 * zapisa, sicer dva zavihka brskalnika oba preberejo star čas in oba štejeta.
 */
export function dedupeCutoff(now: Date, windowSeconds: number): Date {
  return new Date(now.getTime() - windowSeconds * 1000);
}
