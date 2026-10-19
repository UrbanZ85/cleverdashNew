import { Cron, CronPattern } from 'croner';
import { DateTime } from 'luxon';
import type { SchedulePresetId } from './types.js';

// Termini urnika (FR-046 do FR-051), research.md §2 in §12.
//
// `croner` se uporablja IZKLJUČNO za razčlenitev izraza in izračun naslednjega termina. Živ
// časovnik (`new Cron(expr, fn)`) se tu NIKOLI ne ustvari — vsak `Cron` je `paused: true` in se po
// klicu zavrže. Časovnik v pomnilniku je tisto, kar člen V.1 prepoveduje; termine ugotavlja tik
// iz baze (services/tick.ts).

export interface SchedulePreset {
  id: SchedulePresetId;
  label: string;
  cronExpression: string | null;
}

export const SCHEDULE_PRESETS: readonly SchedulePreset[] = [
  { id: 'daily-06', label: 'Vsak dan ob 6:00', cronExpression: '0 6 * * *' },
  { id: 'daily-06-18', label: 'Vsak dan ob 6:00 in 18:00', cronExpression: '0 6,18 * * *' },
  { id: 'every-6h', label: 'Vsakih 6 ur', cronExpression: '0 */6 * * *' },
  { id: 'monday-08', label: 'Vsak ponedeljek ob 8:00', cronExpression: '0 8 * * 1' },
  { id: 'custom', label: 'Po meri', cronExpression: null },
];

export function presetFor(id: SchedulePresetId): SchedulePreset {
  return SCHEDULE_PRESETS.find((p) => p.id === id) ?? SCHEDULE_PRESETS[SCHEDULE_PRESETS.length - 1]!;
}

/** Katera prednastavitev ustreza izrazu; `custom`, kadar nobena. */
export function presetForExpression(expr: string): SchedulePresetId {
  const normalized = expr.trim().replace(/\s+/g, ' ');
  return SCHEDULE_PRESETS.find((p) => p.cronExpression === normalized)?.id ?? 'custom';
}

/**
 * Preveri izraz (FR-047). Pet polj — brez sekund, da admin ne vnese `0 0 6 * * *` in da je izraz
 * berljiv na zaslonu. Vrne slovenski razlog ali `null`.
 */
export function validateCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return `Izraz mora imeti pet polj (minuta ura dan mesec dan-v-tednu), ima jih ${parts.length}.`;
  }
  try {
    new CronPattern(parts.join(' '));
  } catch (err) {
    const raw = err instanceof Error ? err.message.replace(/^CronPattern:\s*/, '') : 'neveljaven izraz';
    return `Izraz ni veljaven: ${raw}.`;
  }
  return null;
}

export function isValidTimezone(tz: string): boolean {
  return DateTime.now().setZone(tz).isValid;
}

/** Naslednji termin STROGO po `after`, ali `null`, če ga ni (izraz, ki se nikoli ne sproži). */
export function nextRun(expr: string, timezone: string, after: Date): Date | null {
  const job = new Cron(expr.trim(), { timezone, paused: true });
  try {
    return job.nextRun(after);
  } finally {
    job.stop();
  }
}

/** Zaporedje naslednjih terminov — za prikaz v adminu. */
export function nextRuns(expr: string, timezone: string, after: Date, count: number): Date[] {
  const out: Date[] = [];
  let cursor = after;
  for (let i = 0; i < count; i += 1) {
    const next = nextRun(expr, timezone, cursor);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

const MAX_SLOT_STEPS = 10_000;

/**
 * Zadnji termin, ki je zapadel do `now` in še ni pokrit (`> lastSlotAt`), ali `null`.
 *
 * Dohitevanje je omejeno na EN termin (research.md §2): če je bila aplikacija izklopljena dva dni,
 * se izvede samo zadnji zapadli termin — zbirni dopis po enem zagonu že nosi vse spremembe od
 * zadnjega uspešnega preverjanja, štirje zaporedni zagoni pa bi vire vprašali štirikrat za isti
 * podatek.
 *
 * `lastSlotAt = null` (sveža namestitev) pomeni "pokrito do pred enim dnem": prvi tik po
 * namestitvi izvede zadnji termin zadnjega dne in uporabnik ne čaka do jutri zjutraj.
 */
export function latestDueSlot(expr: string, timezone: string, now: Date, lastSlotAt: Date | null): Date | null {
  const since = lastSlotAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let cursor = since;
  let latest: Date | null = null;
  for (let i = 0; i < MAX_SLOT_STEPS; i += 1) {
    const next = nextRun(expr, timezone, cursor);
    if (!next || next.getTime() > now.getTime()) break;
    latest = next;
    cursor = next;
  }
  return latest;
}

/** `schedule:2026-10-17T06:00+02:00` — termin v coni urnika, brez sekund, berljiv v bazi in v
 * dnevniku. Dva izvoda z istim urnikom izračunata isti ključ. */
export function slotKeyFor(slot: Date, timezone: string): string {
  const local = DateTime.fromJSDate(slot, { zone: 'utc' }).setZone(timezone);
  return `schedule:${local.toFormat("yyyy-LL-dd'T'HH:mmZZ")}`;
}

/** Isti trenutek, izpisan za človeka v coni urnika ("sob, 17. 10. 2026 ob 06:00"). */
export function formatSlotLocal(slot: Date, timezone: string): string {
  return DateTime.fromJSDate(slot, { zone: 'utc' }).setZone(timezone).setLocale('sl').toFormat("ccc, d. L. yyyy 'ob' HH:mm");
}
