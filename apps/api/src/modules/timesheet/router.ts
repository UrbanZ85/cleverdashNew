import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireScopes } from '../../platform/auth/scopes.js';
import { badRequest, notFound } from '../../platform/errors/problem.js';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { TIMESHEET_SCOPES } from './scopes.js';
import { applyDefaults, timesheetBodySchema, validateSchedule } from './domain/input.schema.js';
import { resolveMonth, type ResolvedMonth } from './domain/resolve-month.js';
import { buildTimesheetWorkbook } from './services/workbook.service.js';
import { mergeDefaults, readDefaults, saveDefaults } from './services/preset.service.js';

// Modul "Evidenca delovnega časa": iz izbranega meseca in nekaj polj sestavi mesečno
// evidenco v obliki .xlsx po predlogi delodajalca. Prenos samostojne aplikacije
// (D:\programiranje\privat\Kaja_EDC) v CleverDash.
//
// Člen III: vsak zaslon je najprej endpoint. `/workbook` in `/preview` sta dosegljiva tudi
// z `X-API-Key` in obsegom `timesheet:generate`, zato zna evidenco za pretekli mesec vsak
// prvi v mesecu izdelati tudi n8n, brez odpiranja aplikacije.
//
// Uvozi samo iz `platform/` — nikoli iz drugega modula pod `modules/` (člen I).
export const timesheetRouter = Router();

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Isti pomočnik kot v modules/time-tracking/router.ts: API ključ ni vezan na uporabnika,
 * zato je treba ugotoviti, v čigavem imenu deluje avtomatizacija (platform/auth). */
async function resolveOwnerUserId(req: Request): Promise<string> {
  if (req.auth!.subjectType === 'user') return req.auth!.subjectId;
  const ownerId = await resolveAutomationOwnerUserId();
  if (!ownerId) {
    throw notFound(
      'Avtomatizacija ne more ugotoviti, na katerega uporabnika se nanaša — ni podedovanih podatkov niti natanko enega uporabnika.',
    );
  }
  return ownerId;
}

/** Telo → razrešen mesec. Skupno obema endpointoma, da predogled ne more pokazati drugega
 * meseca, kot ga izriše datoteka. */
async function resolveFromRequest(req: Request): Promise<ResolvedMonth> {
  const body = timesheetBodySchema.parse(req.body);
  const stored = await readDefaults(await resolveOwnerUserId(req));

  const fullName = body.fullName ?? stored.fullName;
  if (!fullName) {
    throw badRequest(
      'Manjka ime in priimek. Pošlji `fullName` ali ga shrani med privzetke (PUT /timesheet/defaults).',
    );
  }

  const request = applyDefaults(body, {
    fullName,
    weeklyWorkHours: stored.weeklyWorkHours,
    schedule: stored.schedule,
  });

  const scheduleError = validateSchedule(request.schedule);
  if (scheduleError) throw badRequest(scheduleError);

  return resolveMonth(request);
}

function fileNameFor(month: ResolvedMonth): string {
  return `evidenca-${month.year}-${String(month.month).padStart(2, '0')}.xlsx`;
}

/**
 * Predogled meseca kot JSON — iste vrste dni in isti seštevki kot v .xlsx, samo brez
 * preglednice. Odjemalec zato ne podvaja koledarske logike (kateri dan je vikend, koliko ur
 * nosi teden), kar je bil edini razlog, da bi jo sploh imel dvakrat.
 */
timesheetRouter.post(
  '/timesheet/preview',
  requireScopes(TIMESHEET_SCOPES.generate),
  async (req, res, next) => {
    try {
      const month = await resolveFromRequest(req);
      res.json({
        year: month.year,
        month: month.month,
        fullName: month.fullName,
        weeklyWorkHours: month.weeklyWorkHours,
        schedule: month.schedule,
        nominalMonthHours: month.nominalMonthHours,
        breakMinutes: month.breakMinutes,
        totals: month.totals,
        weeks: month.weeks,
        fileName: fileNameFor(month),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Izdelava datoteke. Odgovor je binaren, zato ga `platform/idempotency` (ki ovije samo
 * `res.json`) ne shrani — kar je pravilno: gradnja je čista funkcija vhoda, brez stranskih
 * učinkov, ponovljen klic z istim `Idempotency-Key` da bajt za bajt enako datoteko.
 */
timesheetRouter.post(
  '/timesheet/workbook',
  requireScopes(TIMESHEET_SCOPES.generate),
  async (req, res, next) => {
    try {
      const month = await resolveFromRequest(req);
      const buffer = await buildTimesheetWorkbook(month);

      res.setHeader('Content-Type', XLSX_MIME);
      res.setHeader('Content-Disposition', `attachment; filename="${fileNameFor(month)}"`);
      res.setHeader('Content-Length', String(buffer.byteLength));
      // Evidenca je osebni dokument — nič od tega ne sme obtičati v vmesnem predpomnilniku.
      res.setHeader('Cache-Control', 'no-store');
      res.end(buffer);
    } catch (err) {
      next(err);
    }
  },
);

const defaultsSchema = z.object({
  fullName: z.string().trim().max(120).nullable().optional(),
  weeklyWorkHours: z.number().min(1).max(80).optional(),
  schedule: z
    .object({
      arrival: z.object({ h: z.number().int().min(0).max(23), m: z.number().int().min(0).max(59) }),
      departure: z.object({ h: z.number().int().min(0).max(23), m: z.number().int().min(0).max(59) }),
      breakStart: z.object({ h: z.number().int().min(0).max(23), m: z.number().int().min(0).max(59) }),
      breakEnd: z.object({ h: z.number().int().min(0).max(23), m: z.number().int().min(0).max(59) }),
    })
    .partial()
    .optional(),
});

timesheetRouter.get(
  '/timesheet/defaults',
  requireScopes(TIMESHEET_SCOPES.read),
  async (req, res, next) => {
    try {
      res.json(await readDefaults(await resolveOwnerUserId(req)));
    } catch (err) {
      next(err);
    }
  },
);

timesheetRouter.put(
  '/timesheet/defaults',
  requireScopes(TIMESHEET_SCOPES.write),
  async (req, res, next) => {
    try {
      const patch = defaultsSchema.parse(req.body);
      const userId = await resolveOwnerUserId(req);
      // NE `next` — to ime v tem obsegu pripada Expressovemu `next(err)`.
      const merged = mergeDefaults(await readDefaults(userId), patch);

      const scheduleError = validateSchedule(merged.schedule);
      if (scheduleError) throw badRequest(scheduleError);

      res.json(await saveDefaults(userId, merged));
    } catch (err) {
      next(err);
    }
  },
);
