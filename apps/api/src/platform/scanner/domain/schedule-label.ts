import type { SchedulePresetId } from '../types.js';
import { presetFor, presetForExpression } from './schedule-slots.js';

// Slovenski opis urnika za vrstico seznama (FR-040). Čista funkcija: prednastavitev dobi svoj
// naziv (mala začetnica, ker stoji sredi stavka), izraz po meri se izpiše dobesedno, urnik tipa pa
// pove, da ga določa administrator — uporabnik mora iz vrstice razbrati, zakaj ga ne more urejati.

export interface ScheduleLike {
  preset?: SchedulePresetId | null;
  cronExpression: string;
  timezone?: string;
}

const DEFAULT_TZ = 'Europe/Ljubljana';

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0]!.toLowerCase() + s.slice(1) : s;
}

export function scheduleLabel(schedule: ScheduleLike): string {
  const preset = schedule.preset ?? presetForExpression(schedule.cronExpression);
  const base = preset === 'custom' ? `po meri: ${schedule.cronExpression.trim().replace(/\s+/g, ' ')}` : lowerFirst(presetFor(preset).label);
  const tz = schedule.timezone ?? DEFAULT_TZ;
  return tz === DEFAULT_TZ ? base : `${base} (${tz})`;
}

/** "po urniku tipa (vsak dan ob 6:00 in 18:00)" / "po urniku tipa (izklopljen)". */
export function typeScheduleLabel(schedule: ScheduleLike & { enabled: boolean }): string {
  return schedule.enabled ? `po urniku tipa (${scheduleLabel(schedule)})` : 'po urniku tipa (izklopljen)';
}
