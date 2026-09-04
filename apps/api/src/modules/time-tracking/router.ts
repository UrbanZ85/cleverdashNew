import { Router, type Request } from 'express';
import { z } from 'zod';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { loadEnv } from '../../platform/config/env.js';
import { getLogger } from '../../platform/logging/logger.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { ProblemError } from '../../platform/errors/problem.js';
import { ljubljanaCalendarDay } from '../../domain/timezone.js';
import { getClockPortal } from './clock-portal/index.js';
import { resolveLocationForPortal, enrichDiagnosticsWithSession } from './services/location-resolver.service.js';
import { ActionExecutor } from './services/action-executor.service.js';
import { readStateCached } from './services/state-cache.service.js';
import { recordExecution } from './services/record-execution.service.js';
import { PlannedActionModel } from './models/planned-action.model.js';
import { ActionAttemptModel } from './models/action-attempt.model.js';
import { TrackingProfileModel } from './models/tracking-profile.model.js';
import { TrackingLocationModel } from './models/tracking-location.model.js';
import { RemoteSessionModel, maskCookieValue } from './models/remote-session.model.js';
import { buildPlanForDay, loadCalendarInputs } from './services/schedule-builder.service.js';
import { readAutomationState, setAutomationEnabled } from './services/automation.service.js';
import { staleRunningMs } from './services/stale-running.service.js';
import { ensureHolidaysSeeded } from './services/holiday-seed.service.js';
import { daysUntilExpiry } from './services/session-monitor.service.js';
import { HolidayModel } from './models/holiday.model.js';
import { AbsencePeriodModel } from './models/absence-period.model.js';
import { CalendarOverrideModel } from './models/calendar-override.model.js';
import { ActionRecordModel } from './models/action-record.model.js';
import { WebhookEndpointModel } from '../../platform/webhooks/models.js';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { resolveDayStatus } from '../../domain/calendar.js';
import { computeScheduledInstant } from '../../domain/scheduling.js';
import { START_ACTIONS, isStartAction, resolveActionForLocation } from '../../domain/clock-state.js';
import { badRequest, notFound } from '../../platform/errors/problem.js';
import { TIME_TRACKING_SCOPES } from './scopes.js';

const ZONE = 'Europe/Ljubljana';

/** FR-019, FR-010: beleženje časa je zdaj osebni podatek, a API ključi (avtomatizacija, n8n)
 * ostajajo neodvisni od te spremembe — nimajo lastnega uporabniškega profila. Delujejo V
 * IMENU administratorja (uporabnika, ki je podedoval enouporabniške podatke ob uvedbi, glej
 * platform/migration/legacy-userless-migration.service.ts), enako kot je avtomatizacija
 * doslej delovala na edinem obstoječem uporabniku. Znano ozko grlo, dokumentirano, ne
 * prikrito: če noben uporabnik (še) ni prevzel podedovanih podatkov, avtomatizacija
 * time-trackinga vrne jasen 404, ne tiho napako. */
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

function toLocationResponse(doc: InstanceType<typeof TrackingLocationModel>) {
  return {
    id: String(doc._id),
    name: doc.name,
    url: doc.url,
    sessionId: String(doc.sessionId),
    startAction: doc.startAction,
    coordinateTemplate: doc.coordinateTemplate,
    sendGeolocation: doc.sendGeolocation,
    jitterMeters: doc.jitterMeters,
    active: doc.active,
  };
}

/** FR-092: vrednost piškotka NIKOLI v celoti — niti skrbniku, niti v dnevniku.
 * `cookieSize` je izpeljan podatek (bajti imena + vrednosti), enak stolpcu "Size" v
 * brskalnikovem razhroščevalniku; nastavljiv ni, ker ga piškotek ne nosi kot lastnost —
 * je posledica imena in vrednosti. Vrnjen je zato, da je v Nastavitvah takoj vidno, ali je
 * bila vrednost prilepljena cela (odrezana vrednost je najpogostejša napaka pri prepisu). */
function toSessionResponse(doc: InstanceType<typeof RemoteSessionModel>) {
  return {
    id: String(doc._id),
    name: doc.name,
    cookieName: doc.cookieName,
    cookieValueMasked: maskCookieValue(doc.cookieValue),
    cookieDomain: doc.cookieDomain,
    cookieSize: Buffer.byteLength(doc.cookieName, 'utf8') + Buffer.byteLength(doc.cookieValue, 'utf8'),
    expiresAt: doc.expiresAt,
    daysUntilExpiry: doc.expiresAt ? daysUntilExpiry(doc.expiresAt) : null,
    status: doc.status,
    lastVerifiedAt: doc.lastVerifiedAt,
    lastVerifyError: doc.lastVerifyError,
  };
}

/** `expiresAt` prihaja iz treh smeri in vse tri so sprejete: obrazec v Nastavitvah
 * (`datetime-local`, brez cone — vsebnik teče v `TZ=Europe/Ljubljana`, glej
 * docs/env-reference.md), API klic (ISO 8601) in stari sistem (unix SEKUNDE, npr.
 * `cookie_property_expires=1737717074`). `null`/prazno pomeni "rok ni znan" — za sejni
 * piškotek e-računov normalno stanje, ne napaka. Vrnjeni `undefined` pomeni "polje ni bilo
 * poslano", kar je razlika, ki jo delni popravek potrebuje. */
function parseExpiresAt(value: string | number | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const asDate =
    typeof value === 'number' || /^\d+$/.test(value)
      ? new Date(Number(value) > 1e11 ? Number(value) : Number(value) * 1000)
      : new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    throw badRequest('Rok veljavnosti piškotka ni veljaven čas.');
  }
  return asDate;
}

/** Stanje, ki je znano BREZ klica na stran delodajalca — iz roka veljavnosti. Isti prag kot
 * checkSessionExpiry() (services/session-monitor.service.ts, FR-063), da se stanje po
 * ročnem vnosu in po dnevnem pregledu ujemata. */
function statusForExpiry(expiresAt: Date | null | undefined): 'active' | 'expiring' | 'expired' | 'unknown' {
  if (!expiresAt) return 'unknown';
  const remaining = daysUntilExpiry(expiresAt);
  if (remaining <= 0) return 'expired';
  if (remaining <= 7) return 'expiring';
  return 'active';
}

function toProfileResponse(doc: InstanceType<typeof TrackingProfileModel>, locationName?: string) {
  return {
    id: String(doc._id),
    name: doc.name,
    daysOfWeek: doc.daysOfWeek,
    locationId: String(doc.locationId),
    locationName,
    mode: doc.mode,
    actions: doc.actions,
    graceMinutes: doc.graceMinutes,
    maxDelayMinutes: doc.maxDelayMinutes,
    maxAttempts: doc.maxAttempts,
    retryBackoffSeconds: doc.retryBackoffSeconds,
    maxReminders: doc.maxReminders,
    reminderIntervalMinutes: doc.reminderIntervalMinutes,
    active: doc.active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** FR-006: dva AKTIVNA profila ne smeta imeti presečišča v `daysOfWeek` — znotraj ISTEGA
 * uporabnika (FR-010: profil je osebni podatek, dva različna uporabnika smeta imeti profile
 * za iste dni brez konflikta). */
async function assertNoOverlap(userId: string, daysOfWeek: number[], active: boolean, excludeId?: string): Promise<void> {
  if (!active) return;
  const others = await TrackingProfileModel.find({
    userId,
    active: true,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).lean();
  for (const other of others) {
    if (other.daysOfWeek.some((d) => daysOfWeek.includes(d))) {
      throw new ProblemError(422, 'Prekrivanje dni', `Profil "${other.name}" že velja za enega od izbranih dni.`);
    }
  }
}

// Endpointi pod /api/v1/time-tracking/* — glej specs/002-time-tracking/contracts/openapi.yaml.
export const timeTrackingRouter = Router();

// ─────────────────────────── stanje (US1) ───────────────────────────

timeTrackingRouter.get('/time-tracking/state', requireScopes(TIME_TRACKING_SCOPES.stateRead), async (req, res, next) => {
  try {
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
    const refresh = req.query.refresh === 'true';
    const env = loadEnv();
    const logger = getLogger(env);

    const { locationDoc, sessionDoc, resolved } = await resolveLocationForPortal(await resolveOwnerUserId(req), locationId);
    const portal = getClockPortal(env, logger);
    const reading = await readStateCached(portal, resolved, String(locationDoc._id), 60, refresh);

    res.json({
      state: reading.state,
      availableActions: reading.availableActions,
      readAt: reading.readAt.toISOString(),
      fromCache: reading.fromCache,
      locationId: String(locationDoc._id),
      locationName: locationDoc.name,
      // US8, FR-022: prazen nabor je LAHKO potekla seja, ne "selektor ni najden".
      diagnostics: enrichDiagnosticsWithSession(reading.diagnostics, sessionDoc, locationDoc),
    });
  } catch (err) {
    next(err);
  }
});

timeTrackingRouter.get(
  '/time-tracking/available-actions',
  requireScopes(TIME_TRACKING_SCOPES.stateRead),
  async (req, res, next) => {
    try {
      const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
      const env = loadEnv();
      const logger = getLogger(env);

      const { locationDoc, resolved } = await resolveLocationForPortal(await resolveOwnerUserId(req), locationId);
      const portal = getClockPortal(env, logger);
      const reading = await readStateCached(portal, resolved, String(locationDoc._id), 60, false);

      res.json({ availableActions: reading.availableActions, readAt: reading.readAt.toISOString() });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── akcije (US1) ───────────────────────────

const performActionSchema = z.object({
  actionName: z.string().min(1),
  locationId: z.string().optional(),
  dryRun: z.boolean().default(false),
});

timeTrackingRouter.post(
  '/time-tracking/actions',
  requireScopes(TIME_TRACKING_SCOPES.actionWrite),
  async (req, res, next) => {
    try {
      const body = performActionSchema.parse(req.body);
      const env = loadEnv();
      const logger = getLogger(env);
      // Vir se ugotovi iz vrste avtentikacije, ne iz telesa zahteve — člen III, US1/US11.
      const source: 'manual' | 'api' = req.auth?.subjectType === 'apiKey' ? 'api' : 'manual';
      const userId = await resolveOwnerUserId(req);

      const { locationDoc, resolved } = await resolveLocationForPortal(userId, body.locationId);

      if (body.dryRun || env.DRY_RUN) {
        const portal = getClockPortal(env, logger);
        const reading = await portal.readState(resolved);
        res.json({
          outcome: 'not_verified',
          actionName: body.actionName,
          verified: false,
          stateBefore: reading.state,
          stateAfter: reading.state,
          attemptCount: 0,
          durationMs: 0,
          dryRun: true,
        });
        return;
      }

      const portal = getClockPortal(env, logger);
      const executor = new ActionExecutor(portal);
      const result = await executor.execute(resolved, body.actionName);

      const localDate = ljubljanaCalendarDay(new Date());
      // US1 sprejemni scenarij 5 / FR-042: ujemi z današnjo načrtovano akcijo, če obstaja.
      const plannedAction = await PlannedActionModel.findOne({
        userId,
        localDate,
        actionName: body.actionName,
        locationId: locationDoc._id,
        state: { $in: ['planned', 'due', 'running'] },
      });

      if (result.outcome === 'already_done' || result.outcome === 'succeeded' || result.outcome === 'not_verified') {
        await recordExecution({
          localDate,
          actionName: body.actionName,
          locationName: locationDoc.name,
          result,
          source,
          plannedAction,
          userId,
        });
      }

      if (result.outcome === 'already_done') {
        res.json({
          outcome: 'already_done',
          actionName: body.actionName,
          verified: true,
          stateBefore: result.stateBefore,
          stateAfter: result.stateBefore,
          attemptCount: 0,
          durationMs: 0,
        });
        return;
      }
      if (result.outcome === 'unexpected_state') {
        next(new ProblemError(422, 'Neveljavno stanje', `Akcija "${body.actionName}" v trenutnem stanju ni na voljo.`));
        return;
      }

      res.json({
        outcome: result.verified ? 'verified' : 'not_verified',
        actionName: body.actionName,
        verified: result.verified,
        stateBefore: result.stateBefore,
        stateAfter: result.stateAfter,
        attemptCount: 1,
        plannedActionId: plannedAction ? String(plannedAction._id) : undefined,
        durationMs: result.durationMs,
        failureReason: result.errorMessage,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────── osebno stikalo avtomatizacije (dve stikali) ───────────────────
//
// `SCHEDULER_ENABLED` v okolju pove, ali tik sploh teče v tej NAMESTITVI; ta poti pa, ali
// posamezna OSEBA hoče, da se njeni urniki izvajajo. Odgovor vedno pove obe stanji ločeno —
// če bi vrnil samo skupni izid, uporabnik ob izklopljenem schedulerju ne bi razumel, zakaj
// njegovo vklopljeno stikalo ne naredi ničesar.

timeTrackingRouter.get(
  '/time-tracking/automation',
  requireScopes(TIME_TRACKING_SCOPES.scheduleRead),
  async (req, res, next) => {
    try {
      res.json(await readAutomationState(req.auth!.subjectId, loadEnv().SCHEDULER_ENABLED));
    } catch (err) {
      next(err);
    }
  },
);

const automationInputSchema = z.object({ enabled: z.boolean() });

timeTrackingRouter.put(
  '/time-tracking/automation',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = automationInputSchema.parse(req.body);
      const result = await setAutomationEnabled(req.auth!.subjectId, body.enabled, loadEnv().SCHEDULER_ENABLED);
      req.log.info(
        { event: 'time_tracking.automation_toggled', userId: req.auth!.subjectId, enabled: body.enabled },
        body.enabled ? 'Uporabnik je vklopil avtomatiko beleženja časa' : 'Uporabnik je izklopil avtomatiko beleženja časa',
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── urnik (US2) ───────────────────────────

const rebuildPlanSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  profileId: z.string().optional(),
  // Načrt dneva je ZAMRZNJEN, ko enkrat nastane: `buildPlanForDay` piše z `$setOnInsert`, da
  // ročni popravek ure ali lokacije za en dan (PATCH /planned-actions) preživi vsak naslednji
  // tik. Posledica je, da sprememba urnika NE popravi dneva, ki je že načrtovan — v koledarju
  // ostanejo stare ure. `force` je izhod iz tega: še neizvedene akcije tega dne se zavržejo in
  // sestavijo znova iz trenutnega urnika. Ročni popravki tega dne se s tem izgubijo, zato to
  // NI privzeto vedenje.
  force: z.boolean().default(false),
});

timeTrackingRouter.post(
  '/time-tracking/rebuild-plan',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = rebuildPlanSchema.parse(req.body ?? {});
      const userId = req.auth!.subjectId;
      const localDate = body.date ?? ljubljanaCalendarDay(new Date());
      const profiles = body.profileId
        ? [await TrackingProfileModel.findOne({ _id: body.profileId, userId }).orFail(notFound('Profil ne obstaja.'))]
        : await TrackingProfileModel.find({ userId, active: true });

      let replaced = 0;
      if (body.force) {
        // Zavrže se SAMO tisto, kar še ni bilo izvedeno in izvira iz urnika. Uspešne, neuspele
        // in zamujene akcije so zapis o tem, kaj se je zgodilo (člen VI), ročno vnesene
        // (`source: "manual"`) pa niso last urnika — oboje ostane nedotaknjeno.
        const filter: Record<string, unknown> = {
          userId,
          localDate,
          source: 'schedule',
          state: { $in: ['planned', 'due', 'skipped', 'cancelled'] },
        };
        if (body.profileId) filter.profileId = body.profileId;
        replaced = (await PlannedActionModel.deleteMany(filter)).deletedCount;

        // Tudi OBTIČALI `running`. Brez tega je bila osvežitev nemočna prav tam, kjer je
        // najbolj potrebna: obtičal zapis zaradi edinstvenega indeksa (dan, profil, akcija)
        // prepreči, da bi `buildPlanForDay` akcijo sestavil znova, zato je v koledarju obstala
        // stara ura, gumb "Osveži po urniku" pa ni naredil ničesar. Sveži `running` se NE
        // dotakne — tisti se prav zdaj izvaja.
        const staleFilter: Record<string, unknown> = {
          ...filter,
          state: 'running',
          updatedAt: { $lte: new Date(Date.now() - staleRunningMs(loadEnv())) },
        };
        replaced += (await PlannedActionModel.deleteMany(staleFilter)).deletedCount;
      }

      let created = 0;
      let skipped = 0;
      let dayStatus: string | undefined;
      let reason: string | undefined;
      for (const profile of profiles) {
        const result = await buildPlanForDay(profile, localDate);
        created += result.created;
        skipped += result.skipped;
        dayStatus = result.dayStatus;
        reason = result.reason;
      }
      res.json({ created, skipped, replaced, dayStatus, reason });
    } catch (err) {
      next(err);
    }
  },
);

const actionPlanSchema = z.object({
  actionName: z.string().min(1),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
  jitterSeconds: z.number().int().min(0).max(3600).default(300),
  order: z.number().int(),
  enabled: z.boolean().default(true),
});

const trackingProfileInputSchema = z.object({
  name: z.string().min(1),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1),
  locationId: z.string(),
  mode: z.enum(['AUTO', 'REMIND_ONLY', 'OFF']).default('AUTO'), // FR-007
  actions: z.array(actionPlanSchema),
  graceMinutes: z.number().int().positive().default(10),
  maxDelayMinutes: z.number().int().positive().default(90),
  maxAttempts: z.number().int().positive().default(3),
  retryBackoffSeconds: z.array(z.number().int()).default([30, 120, 300]),
  maxReminders: z.number().int().positive().default(3),
  reminderIntervalMinutes: z.number().int().positive().default(10),
  active: z.boolean().default(true),
});

timeTrackingRouter.get('/time-tracking/profiles', requireScopes(TIME_TRACKING_SCOPES.scheduleRead), async (req, res, next) => {
  try {
    const profiles = await TrackingProfileModel.find({ userId: req.auth!.subjectId });
    const locations = await TrackingLocationModel.find({ _id: { $in: profiles.map((p) => p.locationId) } }).lean();
    const nameById = new Map(locations.map((l) => [String(l._id), l.name]));
    res.json(profiles.map((p) => toProfileResponse(p, nameById.get(String(p.locationId)))));
  } catch (err) {
    next(err);
  }
});

timeTrackingRouter.post(
  '/time-tracking/profiles',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = trackingProfileInputSchema.parse(req.body);
      const userId = req.auth!.subjectId;
      await assertNoOverlap(userId, body.daysOfWeek, body.active);
      const created = await TrackingProfileModel.create({ ...body, userId });
      res.status(201).json(toProfileResponse(created));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.get(
  '/time-tracking/profiles/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleRead),
  async (req, res, next) => {
    try {
      const profile = await TrackingProfileModel.findOne({ _id: req.params.id, userId: req.auth!.subjectId });
      if (!profile) {
        next(notFound('Profil ne obstaja.'));
        return;
      }
      res.json(toProfileResponse(profile));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.put(
  '/time-tracking/profiles/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = trackingProfileInputSchema.parse(req.body);
      const userId = req.auth!.subjectId;
      await assertNoOverlap(userId, body.daysOfWeek, body.active, String(req.params.id));
      const updated = await TrackingProfileModel.findOneAndUpdate({ _id: req.params.id, userId }, body, { new: true });
      if (!updated) {
        next(notFound('Profil ne obstaja.'));
        return;
      }
      res.json(toProfileResponse(updated));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.delete(
  '/time-tracking/profiles/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const userId = req.auth!.subjectId;
      const deleted = await TrackingProfileModel.findOneAndDelete({ _id: req.params.id, userId });
      if (!deleted) {
        next(notFound('Profil ne obstaja.'));
        return;
      }
      // Prihodnje načrtovane akcije tega profila preidejo v cancelled.
      await PlannedActionModel.updateMany(
        { profileId: deleted._id, userId, state: { $in: ['planned', 'due'] } },
        { state: 'cancelled' },
      );
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

const setModeSchema = z.object({ mode: z.enum(['AUTO', 'REMIND_ONLY', 'OFF']) });

timeTrackingRouter.put(
  '/time-tracking/profiles/:id/mode',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = setModeSchema.parse(req.body);
      const updated = await TrackingProfileModel.findOneAndUpdate(
        { _id: req.params.id, userId: req.auth!.subjectId },
        { mode: body.mode },
        { new: true },
      );
      if (!updated) {
        next(notFound('Profil ne obstaja.'));
        return;
      }
      res.json(toProfileResponse(updated));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.get(
  '/time-tracking/profiles/:id/preview',
  requireScopes(TIME_TRACKING_SCOPES.scheduleRead),
  async (req, res, next) => {
    try {
      const profile = await TrackingProfileModel.findOne({ _id: req.params.id, userId: req.auth!.subjectId });
      if (!profile) {
        next(notFound('Profil ne obstaja.'));
        return;
      }
      const localDate = typeof req.query.date === 'string' ? req.query.date : ljubljanaCalendarDay(new Date());

      const { holidays, absences, overrides } = await loadCalendarInputs(localDate, req.auth!.subjectId);
      const decision = resolveDayStatus(localDate, String(profile._id), profile.daysOfWeek, {
        holidays,
        absences,
        overrides,
      });

      // Predogled mora pokazati TISTI gumb, ki bo res pritisnjen: akcija za začetek dela
      // prevzame gumb lokacije profila (FR-090), enako kot ob sestavljanju načrta.
      const location = await TrackingLocationModel.findOne({ _id: profile.locationId, userId: req.auth!.subjectId });
      const actions =
        decision.isWorkday && profile.mode !== 'OFF'
          ? profile.actions
              .filter((a) => a.enabled)
              .map((a) => {
                const { scheduledAt } = computeScheduledInstant(localDate, a.localTime, a.jitterSeconds, ZONE);
                return {
                  actionName: resolveActionForLocation(a.actionName, location?.startAction),
                  baseLocalTime: a.localTime,
                  scheduledAt: scheduledAt.toISOString(),
                };
              })
          : [];

      res.json({ localDate, dayStatus: decision.status, reason: decision.reason, actions });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── načrtovane akcije (US2) ───────────────────────────

timeTrackingRouter.get(
  '/time-tracking/planned-actions',
  requireScopes(TIME_TRACKING_SCOPES.scheduleRead),
  async (req, res, next) => {
    try {
      const from = typeof req.query.from === 'string' ? req.query.from : ljubljanaCalendarDay(new Date());
      const to = typeof req.query.to === 'string' ? req.query.to : from;
      const filter: Record<string, unknown> = { userId: req.auth!.subjectId, localDate: { $gte: from, $lte: to } };
      const stateFilter = req.query.state;
      if (typeof stateFilter === 'string') filter.state = stateFilter;

      const actions = await PlannedActionModel.find(filter).sort({ scheduledAt: 1 });
      res.json(actions.map(toPlannedActionResponse));
    } catch (err) {
      next(err);
    }
  },
);

function toPlannedActionResponse(a: InstanceType<typeof PlannedActionModel>) {
  return {
    id: String(a._id),
    localDate: a.localDate,
    profileId: String(a.profileId),
    // Lokacija je last AKCIJE, ne samo profila (dan se da preusmeriti drugam, PATCH spodaj) —
    // koledar iz nje izriše značko dneva, zato mora biti v odgovoru.
    locationId: String(a.locationId),
    actionName: a.actionName,
    actionOrder: a.actionOrder,
    scheduledAt: a.scheduledAt.toISOString(),
    baseLocalTime: a.baseLocalTime,
    mode: a.mode,
    state: a.state,
    attemptCount: a.attemptCount,
    reminderCount: a.reminderCount,
    source: a.source,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
    failureReason: a.failureReason,
  };
}

timeTrackingRouter.get(
  '/time-tracking/planned-actions/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleRead),
  async (req, res, next) => {
    try {
      const action = await PlannedActionModel.findOne({ _id: req.params.id, userId: req.auth!.subjectId });
      if (!action) {
        next(notFound('Načrtovana akcija ne obstaja.'));
        return;
      }
      const attempts = await ActionAttemptModel.find({ plannedActionId: action._id }).sort({ attemptNumber: 1 }).lean();
      res.json({ ...toPlannedActionResponse(action), attempts });
    } catch (err) {
      next(err);
    }
  },
);

const updatePlannedActionSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  // Ura tega dne, kot jo vpiše uporabnik. Za razliko od `scheduledAt` popravi TUDI
  // `baseLocalTime`, sicer bi zaslon Danes in zgodovina še naprej kazala staro uro.
  localTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .optional(),
  locationId: z.string().optional(),
  state: z.enum(['planned', 'skipped']).optional(),
});

/** Stanja, v katerih se akcija še sme spreminjati. Izvedene (`succeeded`, `failed`, `missed`)
 * so zapis o tem, kaj se je ZGODILO — popravljanje njihove ure bi bilo prirejanje evidence
 * (člen XII ustave), ne urejanje načrta. `running` je izvzet, ker ga ta hip obdeluje tik. */
const EDITABLE_STATES = ['planned', 'due', 'skipped', 'cancelled'];

timeTrackingRouter.patch(
  '/time-tracking/planned-actions/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = updatePlannedActionSchema.parse(req.body);
      const userId = req.auth!.subjectId;

      const action = await PlannedActionModel.findOne({ _id: req.params.id, userId });
      if (!action) {
        next(notFound('Načrtovana akcija ne obstaja.'));
        return;
      }
      if (!EDITABLE_STATES.includes(action.state)) {
        next(
          new ProblemError(
            422,
            'Akcije ni več mogoče spreminjati',
            `Akcija je v stanju "${action.state}" — ura in lokacija se dasta spremeniti samo, dokler ni izvedena.`,
          ),
        );
        return;
      }

      if (body.scheduledAt) action.scheduledAt = new Date(body.scheduledAt);
      if (body.state) action.state = body.state;

      if (body.localTime) {
        const localTime = body.localTime.length === 5 ? `${body.localTime}:00` : body.localTime;
        // Jitter 0: ročno vpisana ura je izbira, ne predlog — naključni raztros bi pomenil,
        // da se akcija ne izvede ob uri, ki jo uporabnik vidi na zaslonu.
        const { scheduledAt } = computeScheduledInstant(action.localDate, localTime, 0, ZONE);
        action.baseLocalTime = localTime;
        action.scheduledAt = scheduledAt;
      }

      if (body.locationId && body.locationId !== String(action.locationId)) {
        const location = await TrackingLocationModel.findOne({ _id: body.locationId, userId });
        if (!location) {
          next(notFound('Lokacija ne obstaja.'));
          return;
        }

        // FR-090: gumb za začetek dela je lastnost LOKACIJE. Sprememba lokacije za en dan
        // mora zato preimenovati tudi akcijo, sicer bi načrt na novi lokaciji pritisnil gumb,
        // ki ga tam ni, in akcija bi obvisela kot zamujena.
        if (isStartAction(action.actionName) && action.actionName !== location.startAction) {
          const clash = await PlannedActionModel.findOne({
            _id: { $ne: action._id },
            localDate: action.localDate,
            profileId: action.profileId,
            actionName: location.startAction,
          });
          if (clash) {
            next(
              new ProblemError(
                422,
                'Akcija tega dne že obstaja',
                `Na ta dan je "${location.startAction}" že načrtovan — dva začetka dela na isti dan nista mogoča.`,
              ),
            );
            return;
          }
          action.actionName = location.startAction;
        }
        action.locationId = location._id;
      }

      await action.save();
      res.json(toPlannedActionResponse(action));
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── lokacije in seje (US2) ───────────────────────────

const trackingLocationInputSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().url(),
    sessionId: z.string(),
    // FR-090: gumb za začetek dela je lastnost lokacije. Privzetek je `Prijava na delo`, ker
    // je to edina različica, ki jo ima vsaka stran; ostale tri so odvisne od nastavitev
    // delodajalca in jih uporabnik izbere zavestno.
    startAction: z.enum(START_ACTIONS).default('Prijava na delo'),
    // FR-094: koordinati sta obvezni samo, kadar se lokacija pošilja — glej `superRefine`.
    coordinateTemplate: z.object({ latitude: z.string().min(1), longitude: z.string().min(1) }).optional(),
    // FR-094: privzeto se lokacija pošilja — tako je delovalo doslej in tako deluje prijava,
    // ki lego zahteva. Izklop je zavestna izbira uporabnika, ne privzetek.
    sendGeolocation: z.boolean().default(true),
    jitterMeters: z.number().int().positive().default(10),
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.sendGeolocation && !value.coordinateTemplate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coordinateTemplate'],
        message: 'Koordinati sta obvezni, dokler se lokacija pošilja strani.',
      });
    }
  });

timeTrackingRouter.get('/time-tracking/locations', requireScopes(TIME_TRACKING_SCOPES.scheduleRead), async (req, res, next) => {
  try {
    const locations = await TrackingLocationModel.find({ userId: req.auth!.subjectId });
    res.json(locations.map(toLocationResponse));
  } catch (err) {
    next(err);
  }
});

timeTrackingRouter.post(
  '/time-tracking/locations',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = trackingLocationInputSchema.parse(req.body);
      const created = await TrackingLocationModel.create({ ...body, userId: req.auth!.subjectId });
      res.status(201).json(toLocationResponse(created));
    } catch (err) {
      next(err);
    }
  },
);

const trackingLocationPatchSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  sessionId: z.string().optional(),
  startAction: z.enum(START_ACTIONS).optional(),
  coordinateTemplate: z.object({ latitude: z.string(), longitude: z.string() }).optional(),
  sendGeolocation: z.boolean().optional(),
  jitterMeters: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

// Popravek, ne nadomestitev: `.optional()` na vsakem polju namesto `.partial()` na vhodni
// shemi — ta ima privzete vrednosti (`jitterMeters`, `active`) in bi jih vsak delni popravek
// tiho vrnil na privzeto. Naslov lokacije se v praksi spremeni (žeton v poti `Clockin-…`),
// zato popravek ni razkošje.
timeTrackingRouter.put(
  '/time-tracking/locations/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = trackingLocationPatchSchema.parse(req.body);
      if (Object.keys(body).length === 0) {
        next(badRequest('Ni podatka za spremembo.'));
        return;
      }
      // FR-094: vklop pošiljanja lokacije na lokaciji, ki koordinat nima (ker je bila
      // ustvarjena z izklopljenim pošiljanjem), bi dal shranjen zapis, ki ga portal ne more
      // uporabiti. Zavrnjeno tu, kjer je še mogoče povedati, kaj manjka.
      if (body.sendGeolocation === true && !body.coordinateTemplate) {
        const existing = await TrackingLocationModel.findOne({ _id: req.params.id, userId: req.auth!.subjectId });
        if (!existing) {
          next(notFound('Lokacija ne obstaja.'));
          return;
        }
        if (!existing.coordinateTemplate?.latitude) {
          next(badRequest('Vklop pošiljanja lokacije zahteva koordinati — vpiši ju v istem popravku.'));
          return;
        }
      }
      const updated = await TrackingLocationModel.findOneAndUpdate(
        { _id: req.params.id, userId: req.auth!.subjectId },
        body,
        { new: true },
      );
      if (!updated) {
        next(notFound('Lokacija ne obstaja.'));
        return;
      }
      res.json(toLocationResponse(updated));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.delete(
  '/time-tracking/locations/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const userId = req.auth!.subjectId;
      // Profil brez lokacije ni veljaven (`locationId` je obvezen), zato je brisanje
      // uporabljene lokacije zavrnjeno, ne kaskadno — tiha izguba urnika ni sprejemljiv izid.
      const inUse = await TrackingProfileModel.exists({ locationId: req.params.id, userId });
      if (inUse) {
        next(
          new ProblemError(409, 'V uporabi', 'Lokacijo uporablja vsaj en profil. Najprej spremeni ali izbriši profil.'),
        );
        return;
      }
      const deleted = await TrackingLocationModel.findOneAndDelete({ _id: req.params.id, userId });
      if (!deleted) {
        next(notFound('Lokacija ne obstaja.'));
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────── seje pri delodajalcu (piškotek) — FR-091, FR-092 ───────────────────
// Nastavljive so VSE lastnosti piškotka, ne samo vrednost: staro okolje je imelo
// `cookie_property_name`, `_value`, `_domain` in `_expires` kot štiri obvezne spremenljivke
// (docs/env-reference.md §1), zato zamenjava same vrednosti ne zadošča — brez imena in
// domene brskalnik piškotka ne pošlje in stran delodajalca vrne prijavno masko brez gumbov.
// Ustvarjanje je tu zato, ker je ob prvem zagonu baza prazna: brez POST-a ni seje, brez seje
// ni lokacije in Nastavitve so slepa ulica (quickstart.md §6, korak 1).

const remoteSessionInputSchema = z.object({
  name: z.string().min(1),
  // Privzeto ime je edino, ki ga je stari sistem kdaj uporabil, a ostaja vpisljivo — je
  // last strani delodajalca, ne naša odločitev.
  cookieName: z.string().min(1).default('ItcClientID'),
  cookieValue: z.string().min(1),
  cookieDomain: z.string().min(1),
  expiresAt: z.union([z.string(), z.number(), z.null()]).optional(),
});

const updateSessionSchema = z
  .object({
    name: z.string().min(1).optional(),
    cookieName: z.string().min(1).optional(),
    cookieValue: z.string().min(1).optional(),
    cookieDomain: z.string().min(1).optional(),
    expiresAt: z.union([z.string(), z.number(), z.null()]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Ni podatka za spremembo.' });

timeTrackingRouter.get(
  '/time-tracking/sessions',
  requireScopes(TIME_TRACKING_SCOPES.scheduleRead),
  async (req, res, next) => {
    try {
      const sessions = await RemoteSessionModel.find({ userId: req.auth!.subjectId }).sort({ createdAt: 1 });
      res.json(sessions.map(toSessionResponse));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.post(
  '/time-tracking/sessions',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = remoteSessionInputSchema.parse(req.body);
      const expiresAt = parseExpiresAt(body.expiresAt) ?? null;
      const created = await RemoteSessionModel.create({
        userId: req.auth!.subjectId,
        name: body.name,
        cookieName: body.cookieName,
        cookieValue: body.cookieValue,
        cookieDomain: body.cookieDomain,
        expiresAt,
        // Nova seja ni `active`, dokler je preizkusno branje ne potrdi; lokacije zanjo v
        // trenutku ustvarjanja še ni, zato preizkus tu ni mogoč (FR-091 ga zahteva ob PUT).
        // Kar pa je znano iz roka veljavnosti — potekla, izteka se — ni razlog za `unknown`.
        status: statusForExpiry(expiresAt) === 'active' ? 'unknown' : statusForExpiry(expiresAt),
      });
      res.status(201).json(toSessionResponse(created));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.put(
  '/time-tracking/sessions/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const body = updateSessionSchema.parse(req.body);
      const userId = req.auth!.subjectId;
      const session = await RemoteSessionModel.findOne({ _id: req.params.id, userId });
      if (!session) {
        next(notFound('Seja ne obstaja.'));
        return;
      }

      if (body.name !== undefined) session.name = body.name;
      if (body.cookieName !== undefined) session.cookieName = body.cookieName;
      if (body.cookieValue !== undefined) session.cookieValue = body.cookieValue;
      if (body.cookieDomain !== undefined) session.cookieDomain = body.cookieDomain;
      const expiresAt = parseExpiresAt(body.expiresAt);
      if (expiresAt !== undefined) session.expiresAt = expiresAt;
      // Stanje pred preizkusom: rok pove, kar je znano brez klica na stran delodajalca; brez
      // roka je seja `active` (uporabnik je pravkar vpisal vrednost), dokler preizkus ne
      // pokaže drugače.
      const expiryStatus = statusForExpiry(session.expiresAt);
      session.status = expiryStatus === 'unknown' ? 'active' : expiryStatus;
      await session.save();

      // Takoj preizkusi spremenjeno sejo (FR-091) — najde katerokoli lokacijo TEGA
      // uporabnika, ki uporablja to sejo.
      const location = await TrackingLocationModel.findOne({ sessionId: session._id, userId, active: true });
      let verified = false;
      let availableActions: string[] = [];
      if (location) {
        try {
          const { resolved } = await resolveLocationForPortal(userId, String(location._id));
          const env = loadEnv();
          const portal = getClockPortal(env, getLogger(env));
          const reading = await portal.readState(resolved);
          verified = reading.diagnostics.reason === 'ok';
          availableActions = reading.availableActions;
          session.lastVerifiedAt = new Date();
          session.lastVerifyError = verified ? null : (reading.diagnostics.message ?? reading.diagnostics.reason);
          // Potrditev ne izbriše opozorila o iztekanju: seja, ki danes deluje in poteče čez
          // tri dni, ostane `expiring` (FR-063). Nepotrjena ostane `expired`, če je rok že
          // mimo — natančnejši vzrok od `unknown` in diagnostika ga tako tudi prikaže.
          session.status = verified
            ? expiryStatus === 'expiring'
              ? 'expiring'
              : 'active'
            : expiryStatus === 'expired'
              ? 'expired'
              : 'unknown';
          await session.save();
        } catch {
          // Preizkus ni uspel — seja je vseeno shranjena, uporabnik vidi verified: false.
        }
      }

      res.json({
        session: toSessionResponse(session),
        verified,
        availableActions,
      });
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.delete(
  '/time-tracking/sessions/:id',
  requireScopes(TIME_TRACKING_SCOPES.scheduleWrite),
  async (req, res, next) => {
    try {
      const userId = req.auth!.subjectId;
      const inUse = await TrackingLocationModel.exists({ sessionId: req.params.id, userId });
      if (inUse) {
        next(new ProblemError(409, 'V uporabi', 'Sejo uporablja vsaj ena lokacija. Najprej ji dodeli drugo sejo.'));
        return;
      }
      const deleted = await RemoteSessionModel.findOneAndDelete({ _id: req.params.id, userId });
      if (!deleted) {
        next(notFound('Seja ne obstaja.'));
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── koledar: prazniki (US5) ───────────────────────────

timeTrackingRouter.get(
  '/time-tracking/holidays',
  requireScopes(TIME_TRACKING_SCOPES.calendarRead),
  async (req, res, next) => {
    try {
      const year = typeof req.query.year === 'string' ? Number(req.query.year) : new Date().getFullYear();
      await ensureHolidaysSeeded(year); // FR-011: ob prvi uporabi vsakega leta
      const holidays = await HolidayModel.find({ date: { $regex: `^${year}-` } }).sort({ date: 1 }).lean();
      res.json(holidays.map((h) => ({ date: h.date, name: h.name, isWorkFree: h.isWorkFree, isHoliday: h.isHoliday, source: h.source })));
    } catch (err) {
      next(err);
    }
  },
);

const holidayInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  isWorkFree: z.boolean().default(true),
  isHoliday: z.boolean().default(true),
});

timeTrackingRouter.post(
  '/time-tracking/holidays',
  requireScopes(TIME_TRACKING_SCOPES.calendarWrite),
  async (req, res, next) => {
    try {
      const body = holidayInputSchema.parse(req.body);
      // FR-011: ročni vnos prevlada nad samodejnim — `source: manual` se zapiše ne glede
      // na to, ali je bil datum prej samodejno napolnjen.
      const saved = await HolidayModel.findOneAndUpdate(
        { date: body.date },
        { name: body.name, isWorkFree: body.isWorkFree, isHoliday: body.isHoliday, source: 'manual' },
        { upsert: true, new: true },
      );
      res.json({ date: saved.date, name: saved.name, isWorkFree: saved.isWorkFree, isHoliday: saved.isHoliday, source: saved.source });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── koledar: pregled (US5) ───────────────────────────

timeTrackingRouter.get(
  '/time-tracking/calendar',
  requireScopes(TIME_TRACKING_SCOPES.calendarRead),
  async (req, res, next) => {
    try {
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      if (!from || !to) {
        next(new ProblemError(400, 'Manjkajoč parameter', '`from` in `to` sta obvezna.'));
        return;
      }

      // FR-011: poskrbi, da so prazniki za vsa vpletena leta napolnjeni pred izračunom.
      const fromYear = Number(from.slice(0, 4));
      const toYear = Number(to.slice(0, 4));
      for (let year = fromYear; year <= toYear; year++) {
        await ensureHolidaysSeeded(year);
      }

      const userId = req.auth!.subjectId;
      const profileFilter = typeof req.query.profileId === 'string' ? { _id: req.query.profileId, userId } : { userId };
      const profiles = await TrackingProfileModel.find(profileFilter);

      const days: Array<{ localDate: string; profileId: string; status: string; reason: string; plannedActionCount: number }> = [];
      for (const profile of profiles) {
        for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
          const localDate = d.toISOString().slice(0, 10);
          const { holidays, absences, overrides } = await loadCalendarInputs(localDate, userId);
          const decision = resolveDayStatus(localDate, String(profile._id), profile.daysOfWeek, { holidays, absences, overrides });
          const plannedActionCount = await PlannedActionModel.countDocuments({ localDate, profileId: profile._id });
          days.push({
            localDate,
            profileId: String(profile._id),
            status: decision.status,
            reason: decision.reason,
            plannedActionCount,
          });
        }
      }

      res.json(days);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── koledar: odsotnosti (US6) ───────────────────────────

const absencePeriodInputSchema = z.object({
  type: z.enum(['vacation', 'sick', 'other']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // vključen (FR-012)
  note: z.string().optional(),
  profileIds: z.array(z.string()).optional(),
});

/** Edge case (Story 6/7): odsotnost se zavrne, če se prekriva z obstoječo `forceWorkday`
 * izjemo za en od zadetih profilov (ali za vse, če odsotnost/izjema nima omejitve). */
async function assertNoForceWorkdayOverlap(
  userId: string,
  startDate: string,
  endDate: string,
  profileIds?: string[],
): Promise<void> {
  const overrides = await CalendarOverrideModel.find({
    userId,
    kind: 'forceWorkday',
    localDate: { $gte: startDate, $lte: endDate },
  }).lean();
  for (const o of overrides) {
    const overrideAppliesToAll = o.profileId == null;
    const absenceAppliesToAll = !profileIds || profileIds.length === 0;
    if (overrideAppliesToAll || absenceAppliesToAll || profileIds!.includes(String(o.profileId))) {
      throw new ProblemError(
        422,
        'Prekrivanje z izrednim delovnim dnem',
        `Datum ${o.localDate} je že vsiljen kot delovni dan za enega od izbranih profilov.`,
      );
    }
  }
}

timeTrackingRouter.get(
  '/time-tracking/absences',
  requireScopes(TIME_TRACKING_SCOPES.calendarRead),
  async (req, res, next) => {
    try {
      const absences = await AbsencePeriodModel.find({ userId: req.auth!.subjectId }).sort({ startDate: -1 });
      res.json(absences.map(toAbsenceResponse));
    } catch (err) {
      next(err);
    }
  },
);

function toAbsenceResponse(a: InstanceType<typeof AbsencePeriodModel>) {
  const start = new Date(`${a.startDate}T00:00:00Z`);
  const end = new Date(`${a.endDate}T00:00:00Z`);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return {
    id: String(a._id),
    type: a.type,
    startDate: a.startDate,
    endDate: a.endDate,
    note: a.note,
    profileIds: a.profileIds?.map(String) ?? [],
    dayCount,
  };
}

timeTrackingRouter.post(
  '/time-tracking/absences',
  requireScopes(TIME_TRACKING_SCOPES.calendarWrite),
  async (req, res, next) => {
    try {
      const body = absencePeriodInputSchema.parse(req.body);
      const userId = req.auth!.subjectId;
      await assertNoForceWorkdayOverlap(userId, body.startDate, body.endDate, body.profileIds);

      const created = await AbsencePeriodModel.create({ ...body, userId });

      // Prihodnje načrtovane akcije v tem obdobju preidejo v cancelled (FR-012).
      const filter: Record<string, unknown> = {
        userId,
        localDate: { $gte: body.startDate, $lte: body.endDate },
        state: { $in: ['planned', 'due'] },
      };
      if (body.profileIds && body.profileIds.length > 0) filter.profileId = { $in: body.profileIds };
      await PlannedActionModel.updateMany(filter, { state: 'cancelled' });

      res.status(201).json(toAbsenceResponse(created));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.delete(
  '/time-tracking/absences/:id',
  requireScopes(TIME_TRACKING_SCOPES.calendarWrite),
  async (req, res, next) => {
    try {
      const deleted = await AbsencePeriodModel.findOneAndDelete({ _id: req.params.id, userId: req.auth!.subjectId });
      if (!deleted) {
        next(notFound('Odsotnost ne obstaja.'));
        return;
      }
      // Načrt za prizadete prihodnje dni se sestavi znova (rebuild-plan po klicatelju,
      // ali samodejno ob naslednjem tiku — glej scheduler-steps.ts korak "poskrbi za načrt").
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── koledar: izredni delovni dan (US7) ───────────────────────────

const overrideInputSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['forceWorkday', 'forceNonWorking']),
  profileId: z.string().optional(),
  note: z.string().optional(),
});

timeTrackingRouter.post(
  '/time-tracking/overrides',
  requireScopes(TIME_TRACKING_SCOPES.calendarWrite),
  async (req, res, next) => {
    try {
      const body = overrideInputSchema.parse(req.body);
      const userId = req.auth!.subjectId;

      if (body.kind === 'forceWorkday') {
        // Edge case (Story 6/7): zavrni, če se prekriva z obstoječo odsotnostjo.
        const absenceFilter: Record<string, unknown> = {
          userId,
          startDate: { $lte: body.localDate },
          endDate: { $gte: body.localDate },
        };
        const overlapping = await AbsencePeriodModel.find(absenceFilter).lean();
        for (const a of overlapping) {
          const absenceAppliesToAll = !a.profileIds || a.profileIds.length === 0;
          const overrideAppliesToAll = !body.profileId;
          if (absenceAppliesToAll || overrideAppliesToAll || a.profileIds!.map(String).includes(body.profileId!)) {
            next(
              new ProblemError(
                422,
                'Prekrivanje z odsotnostjo',
                `Datum ${body.localDate} je že znotraj vnesene odsotnosti.`,
              ),
            );
            return;
          }
        }
      }

      const created = await CalendarOverrideModel.create({ ...body, userId });
      res.status(201).json({
        id: String(created._id),
        localDate: created.localDate,
        kind: created.kind,
        profileId: created.profileId ? String(created.profileId) : null,
        note: created.note,
      });
    } catch (err) {
      next(err);
    }
  },
);

function toOverrideResponse(o: InstanceType<typeof CalendarOverrideModel>) {
  return {
    id: String(o._id),
    localDate: o.localDate,
    kind: o.kind,
    profileId: o.profileId ? String(o.profileId) : null,
    note: o.note ?? null,
  };
}

// Izjema je bila doslej ENOSMERNA: vnesti se jo je dalo, odstraniti ne. Vsiljen delovni dan
// za nazaj trajno zavrne vsak dopust na ta datum (`assertNoForceWorkdayOverlap`), zato je bil
// napačen klik nepopravljiv — brez teh dveh poti je bil edini izhod poseg v bazo.

timeTrackingRouter.get(
  '/time-tracking/overrides',
  requireScopes(TIME_TRACKING_SCOPES.calendarRead),
  async (req, res, next) => {
    try {
      const filter: Record<string, unknown> = { userId: req.auth!.subjectId };
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      if (from && to) filter.localDate = { $gte: from, $lte: to };

      const overrides = await CalendarOverrideModel.find(filter).sort({ localDate: 1 });
      res.json(overrides.map(toOverrideResponse));
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.delete(
  '/time-tracking/overrides/:id',
  requireScopes(TIME_TRACKING_SCOPES.calendarWrite),
  async (req, res, next) => {
    try {
      const userId = req.auth!.subjectId;
      const deleted = await CalendarOverrideModel.findOneAndDelete({ _id: req.params.id, userId });
      if (!deleted) {
        next(notFound('Izjema ne obstaja.'));
        return;
      }

      // Dan se s tem vrne v svoje običajno stanje. Akcije, ki so nastale SAMO zaradi izjeme,
      // je treba preklicati — `buildPlanForDay` jih sam ne odstrani, ker upsert obstoječih
      // zapisov ne briše; presojo, ali je dan še delovni, prepustimo njemu.
      const profiles = await TrackingProfileModel.find({ userId, active: true });
      for (const profile of profiles) {
        if (deleted.profileId && String(deleted.profileId) !== String(profile._id)) continue;
        await buildPlanForDay(profile, deleted.localDate);
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── zgodovina (US9) ───────────────────────────

timeTrackingRouter.get(
  '/time-tracking/history',
  requireScopes(TIME_TRACKING_SCOPES.historyRead),
  async (req, res, next) => {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
      const from = typeof req.query.from === 'string' ? req.query.from : ljubljanaCalendarDay(weekAgo);
      const to = typeof req.query.to === 'string' ? req.query.to : ljubljanaCalendarDay(now);

      const filter: Record<string, unknown> = { userId: req.auth!.subjectId, localDate: { $gte: from, $lte: to } };
      if (typeof req.query.profileId === 'string') filter.profileId = req.query.profileId;
      if (typeof req.query.actionName === 'string') filter.actionName = req.query.actionName;
      if (typeof req.query.outcome === 'string') filter.finalOutcome = req.query.outcome;

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(500, Number(req.query.pageSize) || 50);

      const [items, total] = await Promise.all([
        ActionRecordModel.find(filter)
          .sort({ localDate: -1, scheduledAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        ActionRecordModel.countDocuments(filter),
      ]);

      res.json({
        items: items.map((r) => ({
          id: String(r._id),
          localDate: r.localDate,
          profileName: r.profileName,
          locationName: r.locationName,
          actionName: r.actionName,
          scheduledAt: r.scheduledAt.toISOString(),
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          finalOutcome: r.finalOutcome,
          source: r.source,
          stateBefore: r.stateBefore,
          stateAfter: r.stateAfter,
          attemptSummary: r.attemptSummary,
          failureReason: r.failureReason,
          note: r.note,
        })),
        page,
        pageSize,
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.get(
  '/time-tracking/history/:id/attempts',
  requireScopes(TIME_TRACKING_SCOPES.historyRead),
  async (req, res, next) => {
    try {
      const record = await ActionRecordModel.findOne({ _id: req.params.id, userId: req.auth!.subjectId }).lean();
      if (!record) {
        next(notFound('Zgodovinski zapis ne obstaja.'));
        return;
      }
      if (!record.plannedActionId) {
        res.json([]); // ad-hoc ročna/API akcija (US1) nima poskusov, ki bi jih bilo treba razširiti
        return;
      }
      const attempts = await ActionAttemptModel.find({ plannedActionId: record.plannedActionId })
        .sort({ attemptNumber: 1 })
        .lean();
      res.json(
        attempts.map((a) => ({
          id: String(a._id),
          attemptNumber: a.attemptNumber,
          startedAt: a.startedAt.toISOString(),
          finishedAt: a.finishedAt.toISOString(),
          outcome: a.outcome,
          clockStateBefore: a.clockStateBefore,
          clockStateAfter: a.clockStateAfter,
          availableActionsBefore: a.availableActionsBefore,
          availableActionsAfter: a.availableActionsAfter,
          errorMessage: a.errorMessage,
          // Pot na disku ni nikomur v brskalniku v ničemer koristna — polje se imenuje
          // `screenshotUrl` in zato je zdaj res naslov, ki datoteko postreže (endpoint spodaj).
          // `null` pomeni, da posnetka ni: poskus je uspel ali pa ga je počistil FR-053.
          screenshotUrl: a.screenshotPath ? `/time-tracking/history/attempts/${String(a._id)}/screenshot` : null,
          durationMs: a.durationMs,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * US9 AS3, FR-032: posnetek zaslona neuspelega poskusa. Doslej je bila pot do datoteke
 * zapisana v bazi, a je ni nič postreglo — dokaz o tem, kaj je stran pokazala, je bil
 * dosegljiv samo tistemu, ki ima dostop do diska strežnika.
 *
 * Pot NIKOLI ne pride iz zahtevka: bere se iz zapisa poskusa, ki mora pripadati klicatelju
 * (`userId`), zato po naslovu ni mogoče priti do nobene druge datoteke. Datoteka po FR-053
 * izgine prej kot zapis, kar ni napaka klica — takrat 404 z razlago.
 */
timeTrackingRouter.get(
  '/time-tracking/history/attempts/:id/screenshot',
  requireScopes(TIME_TRACKING_SCOPES.historyRead),
  async (req, res, next) => {
    try {
      const attempt = await ActionAttemptModel.findOne({
        _id: req.params.id,
        userId: req.auth!.subjectId,
      }).lean();
      if (!attempt) {
        next(notFound('Zapis poskusa ne obstaja.'));
        return;
      }
      if (!attempt.screenshotPath) {
        next(notFound('Ta poskus nima posnetka zaslona.'));
        return;
      }

      const absolutePath = resolvePath(attempt.screenshotPath);
      let png: Buffer;
      try {
        png = await readFile(absolutePath);
      } catch {
        next(
          notFound(
            'Posnetek zaslona ni več na voljo — datoteke se hranijo omejeno obdobje (FR-053), zapis o poskusu pa ostane.',
          ),
        );
        return;
      }

      res.setHeader('Content-Type', 'image/png');
      // Osebni podatek (zaslon z imenom in urami) — nikoli v deljeni predpomnilnik.
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(png);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── webhooki (US11) ───────────────────────────

timeTrackingRouter.get(
  '/time-tracking/webhooks',
  requireScopes(TIME_TRACKING_SCOPES.webhooksWrite),
  async (_req, res, next) => {
    try {
      const endpoints = await WebhookEndpointModel.find({}, { secret: 0 });
      res.json(
        endpoints.map((e) => ({
          id: String(e._id),
          url: e.url,
          events: e.events,
          active: e.active,
          createdAt: e.createdAt,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

const webhookInputSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(['action.succeeded', 'action.failed', 'action.missed', 'session.expiring'])).min(1),
  active: z.boolean().default(true),
});

timeTrackingRouter.post(
  '/time-tracking/webhooks',
  requireScopes(TIME_TRACKING_SCOPES.webhooksWrite),
  async (req, res, next) => {
    try {
      const body = webhookInputSchema.parse(req.body);
      const secret = randomBytes(32).toString('hex');
      const created = await WebhookEndpointModel.create({ ...body, secret });
      // Skrivnost se vrne SAMO tukaj, samo enkrat (enak vzorec kot API ključi iz 001).
      res.status(201).json({
        id: String(created._id),
        url: created.url,
        events: created.events,
        active: created.active,
        createdAt: created.createdAt,
        secret,
      });
    } catch (err) {
      next(err);
    }
  },
);

timeTrackingRouter.delete(
  '/time-tracking/webhooks/:id',
  requireScopes(TIME_TRACKING_SCOPES.webhooksWrite),
  async (req, res, next) => {
    try {
      const deleted = await WebhookEndpointModel.findByIdAndDelete(req.params.id);
      if (!deleted) {
        next(notFound('Webhook ne obstaja.'));
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── diagnostika (US1) ───────────────────────────

const testReadSchema = z.object({
  locationId: z.string().optional(),
  includeScreenshot: z.boolean().default(true),
});

timeTrackingRouter.post(
  '/time-tracking/diagnostics/test-read',
  requireScopes('health:read'),
  async (req, res, next) => {
    try {
      const body = testReadSchema.parse(req.body ?? {});
      const env = loadEnv();
      const logger = getLogger(env);

      const { locationDoc, sessionDoc, resolved } = await resolveLocationForPortal(
        await resolveOwnerUserId(req),
        body.locationId,
      );
      const portal = getClockPortal(env, logger);
      const startedAt = Date.now();
      const reading = await portal.readState(resolved);
      const diagnostics = enrichDiagnosticsWithSession(reading.diagnostics, sessionDoc, locationDoc);

      res.json({
        ok: diagnostics.reason === 'ok',
        state: reading.state,
        availableActions: reading.availableActions,
        selectorFound: reading.availableActions.length > 0,
        sessionValid: diagnostics.reason !== 'session_expired',
        // Da je ob preizkusnem branju vidno, s čim je bilo izvedeno (FR-094).
        geolocationSent: locationDoc.sendGeolocation,
        durationMs: Date.now() - startedAt,
        diagnostics,
      });
    } catch (err) {
      next(err);
    }
  },
);
