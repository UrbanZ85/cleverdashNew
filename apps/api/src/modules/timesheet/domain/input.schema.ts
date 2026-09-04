import { z } from 'zod';
import { daysInMonth } from './calendar.js';
import { mergeDaySchedule, toMinutes } from './schedule.js';
import type { DaySchedule, TimesheetRequest } from './types.js';

// Izvirna aplikacija je validirala z ročno funkcijo, ki je vračala `{ error: string }`.
// Tu je zod + `problem+json` (platform/errors/problem.ts) — enako kot v vseh drugih modulih,
// zato odjemalec dobi napake te poti v isti obliki kot povsod drugod.

const partialTimeSchema = z
  .object({
    h: z.number().int().min(0).max(23),
    m: z.number().int().min(0).max(59),
  })
  .partial();

/** Številke dni v mesecu. `0` je dovoljena in prezrta — tako so izgledali obstoječi payloadi
 * izvirne aplikacije (prazna celica v preglednici). */
const daysSchema = z.array(z.number().int().min(0).max(31)).max(31).default([]);

export const timesheetBodySchema = z
  .object({
    year: z.number().int().min(1970).max(2100),
    month: z.number().int().min(1).max(12),
    fullName: z.string().trim().min(1).max(120).optional(),
    weeklyWorkHours: z.number().min(1).max(80).optional(),
    sickDays: daysSchema,
    holidays: daysSchema,
    offDays: daysSchema,
    schedule: z
      .object({
        arrival: partialTimeSchema,
        departure: partialTimeSchema,
        breakStart: partialTimeSchema,
        breakEnd: partialTimeSchema,
      })
      .partial()
      .optional(),
  })
  .superRefine((value, ctx) => {
    // Dan 31 je veljaven v januarju in nesmiseln v aprilu — to se da preveriti šele, ko sta
    // znana leto in mesec, zato tukaj in ne v `daysSchema`.
    const limit = daysInMonth(value.year, value.month);
    for (const field of ['sickDays', 'holidays', 'offDays'] as const) {
      value[field].forEach((day, index) => {
        if (day > limit) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field, index],
            message: `Dan ${day} ne obstaja v mesecu ${value.month}/${value.year} (največ ${limit}).`,
          });
        }
      });
    }
  });

export type TimesheetBody = z.infer<typeof timesheetBodySchema>;

/** Privzetki, ki jih prispeva uporabnikov shranjeni predlog (models/timesheet-preset.model.ts). */
export interface TimesheetDefaults {
  fullName: string;
  weeklyWorkHours: number;
  schedule: DaySchedule;
}

export function applyDefaults(body: TimesheetBody, defaults: TimesheetDefaults): TimesheetRequest {
  return {
    year: body.year,
    month: body.month,
    fullName: body.fullName ?? defaults.fullName,
    weeklyWorkHours: body.weeklyWorkHours ?? defaults.weeklyWorkHours,
    sickDays: body.sickDays.filter((d) => d !== 0),
    holidays: body.holidays.filter((d) => d !== 0),
    offDays: body.offDays.filter((d) => d !== 0),
    schedule: mergeDaySchedule(body.schedule, defaults.schedule),
  };
}

/**
 * Preverba, ki jo je mogoče opraviti šele nad ZLITIM urnikom (poslani del + privzetki).
 *
 * Izvirna aplikacija je obrnjen urnik (odhod pred prihodom) tiho spustila skozi: formula
 * `IF((E-D)>0,...)` je pustila prazen stolpec, uporabnik pa je dobil datoteko brez ur in brez
 * pojasnila. Člen VI: tiha napaka je hrošč, zato je to zdaj 400.
 */
export function validateSchedule(schedule: DaySchedule): string | null {
  if (toMinutes(schedule.departure) <= toMinutes(schedule.arrival)) {
    return 'Odhod mora biti po prihodu.';
  }
  if (toMinutes(schedule.breakEnd) < toMinutes(schedule.breakStart)) {
    return 'Konec malice ne sme biti pred njenim začetkom.';
  }
  return null;
}
