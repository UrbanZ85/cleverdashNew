import { Cron, CronPattern } from 'croner';
import { DateTime } from 'luxon';
import type { SchedulePresetId } from '../types.js';

// Termini urnika (016, FR-013 do FR-018; preseljeno iz modula Leti, 015 FR-046 do FR-051).
//
// `croner` se uporablja IZKLJUČNO za razčlenitev izraza in izračun naslednjega termina. Živ
// časovnik (`new Cron(expr, fn)`) se tu NIKOLI ne ustvari — vsak `Cron` je `paused: true` in se po
// klicu zavrže. Časovnik v pomnilniku je tisto, kar člen V.1 prepoveduje; termine ugotavlja tik
// iz baze (services/tick.ts), za urnike tipov IN za urnike posameznih skenerjev.

export interface SchedulePreset {
  id: SchedulePresetId;
  label: string;
  cronExpression: string | null;
}

export const SCHEDULE_PRESETS: readonly SchedulePreset[] = [
  // `hourly` je nov v 016 — za skenerje z lastnim urnikom; pri urniku tipa (leti) bi pomenil 24
  // zagonov na dan proti virom, zato ga vmesnik ponudi, administrator pa naj ga izbere zavestno.
  { id: 'hourly', label: 'Vsako uro', cronExpression: '0 * * * *' },
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

/** Prednastavitve z izrazom — za odgovore API-ja (`presets` v `GET /scanners/types`). */
export function listSchedulePresets(): Array<{ id: SchedulePresetId; label: string; cronExpression: string }> {
  return SCHEDULE_PRESETS.filter((p) => p.cronExpression !== null).map((p) => ({
    id: p.id,
    label: p.label,
    cronExpression: p.cronExpression!,
  }));
}

/**
 * Preveri izraz (FR-014, FR-015). Pet polj — brez sekund, da nihče ne vnese `0 0 6 * * *` in da
 * je izraz berljiv na zaslonu. Vrne slovenski razlog ali `null`.
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
 * Dohitevanje je omejeno na EN termin (research.md §4): če je bila aplikacija izklopljena dva
 * dni, se izvede samo zadnji zapadli termin — zbirni dopis po enem zagonu že nosi vse spremembe
 * od zadnjega uspešnega preverjanja, štirje zaporedni zagoni pa bi vire vprašali štirikrat za
 * isti podatek.
 *
 * `lastSlotAt = null` (sveža namestitev ali nov skener) pomeni "pokrito do pred enim dnem": prvi
 * tik izvede zadnji termin zadnjega dne in uporabnik ne čaka do jutri zjutraj.
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

/** `2026-10-17T06:00+02:00` — termin v coni urnika, brez sekund, berljiv v bazi in v dnevniku.
 * Dva izvoda z istim urnikom izračunata isti niz. */
export function formatSlotKey(slot: Date, timezone: string): string {
  return DateTime.fromJSDate(slot, { zone: 'utc' }).setZone(timezone).toFormat("yyyy-LL-dd'T'HH:mmZZ");
}

/** Obseg zagona v ključu termina: `type:<tip>` (urnik tipa) ali `def:<id>` (urnik skenerja). */
export type SlotScope = `type:${string}` | `def:${string}`;

/**
 * `schedule:type:flights:2026-10-17T06:00+02:00` ali `schedule:def:<id>:…` — unikatni ključ
 * zagona (FR-016). Obseg je v ključu, da imata dva tipa (ali dva skenerja) z istim izrazom
 * vsak svoj termin, isti obseg pa ob istem terminu samo enega.
 */
export function scopedSlotKey(scope: SlotScope, slot: Date, timezone: string): string {
  return `schedule:${scope}:${formatSlotKey(slot, timezone)}`;
}

/** 015 oblika brez obsega (`schedule:<termin>`). Ostane, dokler modul Leti ne preide na jedro
 * (016, T048); nato se odstrani. */
export function slotKeyFor(slot: Date, timezone: string): string {
  return `schedule:${formatSlotKey(slot, timezone)}`;
}

/** Isti trenutek, izpisan za človeka v coni urnika ("sob, 17. 10. 2026 ob 06:00"). */
export function formatSlotLocal(slot: Date, timezone: string): string {
  return DateTime.fromJSDate(slot, { zone: 'utc' }).setZone(timezone).setLocale('sl').toFormat("ccc, d. L. yyyy 'ob' HH:mm");
}
