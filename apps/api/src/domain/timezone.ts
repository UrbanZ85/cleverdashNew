import { DateTime } from 'luxon';

// Člen V.4 ustave: vsi časi so shranjeni kot UTC instant, prikaz gre vedno prek
// `Europe/Ljubljana`. `toISOString().split('T')[0]` je prepovedan — v poletnem času da
// napačen koledarski dan (research.md §11, docs/legacy-engine.md §4).
const ZONE = 'Europe/Ljubljana';

/** Prikazni čas v Ljubljanski coni, z eksplicitnim odmikom (npr. +02:00 poleti, +01:00 pozimi). */
export function toLjubljanaDisplay(date: Date): string {
  const iso = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(ZONE).toISO({ suppressMilliseconds: true });
  return iso ?? date.toISOString();
}

/** Koledarski dan v Ljubljanski coni. NIKOLI `date.toISOString().split('T')[0]`. */
export function ljubljanaCalendarDay(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(ZONE).toFormat('yyyy-LL-dd');
}
