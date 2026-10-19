import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { badRequest, forbidden, notFound } from '../../platform/errors/problem.js';
import { isShareableUser, readUserSummaries } from '../../platform/users/directory.service.js';
import { resolveCommutePlaces } from '../../platform/settings/commute.service.js';
import { latestFinishedRun } from '../../platform/scanner/services/scheduler.service.js';
import { aiAvailable } from '../../platform/scanner/services/ai-analysis.service.js';
import { FLIGHT_DEALS_SCOPES } from './scopes.js';
import { FlightSearchRuleModel } from './models/flight-search-rule.model.js';
import { FlightSearchMatchModel } from './models/flight-search-match.model.js';
import { FlightProviderStatusModel } from './models/flight-provider-status.model.js';
import { airportsNear, countryNameSl, findAirport, listCountries, missingAirports, searchAirports } from './domain/airports.js';
import { buildPreview } from './domain/date-window.js';
import {
  airportsQuerySchema,
  offersQuerySchema,
  overviewQuerySchema,
  recipientPutSchema,
  searchCreateSchema,
  searchOffersQuerySchema,
  searchPatchSchema,
  type SearchInput,
} from './domain/rule-input.js';
import { normalizeRule, validateRule } from './domain/rule-validation.js';
import { FLIGHT_PROVIDERS } from './providers/index.js';
import { getOfferDetail, listOffers, listOffersForRule } from './services/offer-query.service.js';
import {
  assertRoomForRule,
  inputToDocument,
  listOwnRules,
  requireObjectId,
  requireOwnRule,
  ruleToInput,
  type RuleLean,
} from './services/rule-access.service.js';
import { originTimezoneOf, readOfferCounts, toSearchResponse, toSearchResponses } from './services/rule-response.service.js';
import { auditSearchCreated, auditSearchDeleted, auditSearchShared, auditSearchUnshared, auditSearchUpdated } from './flight-deals.audit.js';

export const flightDealsRouter = Router();

// VRSTNI RED POTI JE POMEMBEN (ista opomba kot modules/todos/router.ts): `/flight-deals/searches/preview`
// in `/flight-deals/offers` sta deklarirani PRED `/flight-deals/searches/:searchId`, sicer bi
// Express "preview" razumel kot id iskanja.

/**
 * V čigavem imenu teče zahteva. Prijavljen človek je `req.auth.subjectId` (po 012 že zamenjan, kadar
 * admin dela v imenu drugega). API ključ nima osebe: najprej lastnik ključa (`req.apiKey.ownerId`),
 * sicer ugibanje kot pri 009/010/013.
 */
async function actorUserId(req: Request): Promise<string> {
  if (req.auth?.subjectType === 'user') return req.auth.subjectId;
  if (req.apiKey?.ownerId) return req.apiKey.ownerId;
  const ownerId = await resolveAutomationOwnerUserId();
  if (!ownerId) {
    throw notFound(
      'Avtomatizacija ne more ugotoviti, na katerega uporabnika se nanaša — ni podedovanih podatkov niti natanko enega uporabnika.',
    );
  }
  return ownerId;
}

function requireShareScope(req: Request): void {
  const scopes = req.auth?.scopes ?? [];
  if (scopes.includes('admin') || scopes.includes(FLIGHT_DEALS_SCOPES.share)) return;
  throw forbidden(`Manjkajo obsegi: ${FLIGHT_DEALS_SCOPES.share}.`);
}

/** Zod preveri obliko, `validateRule` pomen; vrne normaliziran vnos ali vrže 400. */
function parseAndValidate(input: SearchInput): SearchInput {
  const env = loadEnv();
  const normalized = normalizeRule(input);
  const error = validateRule(normalized, { maxFlexDays: env.FLIGHT_MAX_FLEX_DAYS, missingAirports });
  if (error) throw badRequest(error);
  return normalized;
}

async function respondWithRule(ruleId: Types.ObjectId | string, userId: string, now: Date): Promise<unknown> {
  const rule = await requireOwnRule(userId, String(ruleId));
  const [users, counts] = await Promise.all([
    readUserSummaries(rule.recipients.map((r) => String(r.userId))),
    readOfferCounts([rule._id]),
  ]);
  return toSearchResponse(rule, now, loadEnv(), users, counts.get(String(rule._id)) ?? 0);
}

// ───────────────────────────── pregled ─────────────────────────────

flightDealsRouter.get('/flight-deals/overview', requireScopes(FLIGHT_DEALS_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const query = overviewQuerySchema.parse(req.query);
    const env = loadEnv();
    const now = new Date();
    const rules = await listOwnRules(userId);
    const [searches, newOffers, priceChanges, cheapest, lastRun] = await Promise.all([
      toSearchResponses(rules, now, env),
      listOffers(userId, { scope: 'all', changed: true, sort: 'appeared', includeUnavailable: false, limit: query.limit }).then((r) => ({
        ...r,
        offers: r.offers.filter((o) => (o as { matches: Array<{ changeType: string }> }).matches.some((m) => m.changeType === 'NEW')),
      })),
      listOffers(userId, { scope: 'all', changed: true, sort: 'change', includeUnavailable: false, limit: query.limit }).then((r) => ({
        ...r,
        offers: r.offers.filter((o) => (o as { change: { type: string } | null }).change !== null),
      })),
      listOffers(userId, { scope: 'all', sort: 'price', includeUnavailable: false, limit: query.limit }),
      // 016: zagoni so v jedru skenerjev; modul bere zadnjega končanega za svoj tip.
      latestFinishedRun('flights'),
    ]);
    res.json({
      searches,
      newOffers,
      priceChanges,
      cheapest,
      lastRun: lastRun && lastRun.finishedAt ? { at: lastRun.finishedAt.toISOString(), status: lastRun.status } : null,
      limits: limitsOf(env),
    });
  } catch (err) {
    next(err);
  }
});

function limitsOf(env: ReturnType<typeof loadEnv>) {
  return {
    maxSearchesPerUser: env.FLIGHT_MAX_RULES_PER_USER,
    maxRecipients: env.FLIGHT_MAX_RECIPIENTS,
    maxQueriesPerSearch: env.FLIGHT_MAX_QUERIES_PER_RULE,
    maxFlexDays: env.FLIGHT_MAX_FLEX_DAYS,
    // 017: ali ima namestitev ključ za analizo z umetno inteligenco (samo da/ne).
    aiAvailable: aiAvailable(env),
  };
}

// ───────────────────────────── iskanja ─────────────────────────────

flightDealsRouter.get('/flight-deals/searches', requireScopes(FLIGHT_DEALS_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const env = loadEnv();
    const rules = await listOwnRules(userId);
    res.json({ searches: await toSearchResponses(rules, new Date(), env), limits: limitsOf(env) });
  } catch (err) {
    next(err);
  }
});

flightDealsRouter.post('/flight-deals/searches', requireScopes(FLIGHT_DEALS_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const env = loadEnv();
    const input = parseAndValidate(searchCreateSchema.parse(req.body));
    await assertRoomForRule(userId, env.FLIGHT_MAX_RULES_PER_USER);
    const created = await FlightSearchRuleModel.create({
      userId: new Types.ObjectId(userId),
      ...inputToDocument(input),
      recipients: [],
      lastCheck: null,
      lastSuccessfulCheckAt: null,
    });
    auditSearchCreated(req.log, { userId, ruleId: String(created._id) });
    res.status(201).json(await respondWithRule(created._id, userId, new Date()));
  } catch (err) {
    next(err);
  }
});

// PRED `/:searchId`.
flightDealsRouter.post('/flight-deals/searches/preview', requireScopes(FLIGHT_DEALS_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const input = parseAndValidate(searchCreateSchema.parse(req.body));
    const originTz = findAirport(input.departureAirports[0]!)?.tz ?? 'Europe/Ljubljana';
    res.json(buildPreview(input, new Date(), originTz, { maxQueriesPerRule: env.FLIGHT_MAX_QUERIES_PER_RULE }));
  } catch (err) {
    next(err);
  }
});

flightDealsRouter.get('/flight-deals/searches/:searchId', requireScopes(FLIGHT_DEALS_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    res.json(await respondWithRule(String(req.params.searchId), userId, new Date()));
  } catch (err) {
    next(err);
  }
});

flightDealsRouter.patch('/flight-deals/searches/:searchId', requireScopes(FLIGHT_DEALS_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const existing = await requireOwnRule(userId, String(req.params.searchId));
    const patch = searchPatchSchema.parse(req.body);
    // Delni vnos se zlije z obstoječim in se preveri KOT CELOTA — sprememba `dates` mora ustrezati
    // obstoječim nočitvam in obratno.
    const merged = parseAndValidate(searchCreateSchema.parse({ ...ruleToInput(existing), ...patch }));
    await FlightSearchRuleModel.updateOne({ _id: existing._id, userId: existing.userId }, { $set: inputToDocument(merged) });
    auditSearchUpdated(req.log, { userId, ruleId: String(existing._id), fields: Object.keys(patch) });
    res.json(await respondWithRule(existing._id, userId, new Date()));
  } catch (err) {
    next(err);
  }
});

flightDealsRouter.delete('/flight-deals/searches/:searchId', requireScopes(FLIGHT_DEALS_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const existing = await requireOwnRule(userId, String(req.params.searchId));
    await FlightSearchRuleModel.deleteOne({ _id: existing._id, userId: existing.userId });
    // Ujemanja gredo z iskanjem; ponudbe in zgodovina ostanejo (pripadajo tudi drugim) in potečejo s TTL.
    await FlightSearchMatchModel.deleteMany({ ruleId: existing._id });
    auditSearchDeleted(req.log, { userId, ruleId: String(existing._id) });
    // 200 s telesom in ne 204: shranjen odgovor za `Idempotency-Key` (isti razlog kot v 010).
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

flightDealsRouter.get('/flight-deals/searches/:searchId/offers', requireScopes(FLIGHT_DEALS_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const rule = await requireOwnRule(userId, String(req.params.searchId));
    const query = searchOffersQuerySchema.parse(req.query);
    res.json(await listOffersForRule(userId, String(rule._id), query));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── prejemniki ─────────────────────────────

flightDealsRouter.put(
  '/flight-deals/searches/:searchId/recipients/:userId',
  requireScopes(FLIGHT_DEALS_SCOPES.write),
  async (req, res, next) => {
    try {
      requireShareScope(req);
      const userId = await actorUserId(req);
      const env = loadEnv();
      const rule = await requireOwnRule(userId, String(req.params.searchId));
      const targetId = String(req.params.userId);
      if (!Types.ObjectId.isValid(targetId)) throw badRequest('Tak uporabnik ne obstaja.');
      if (targetId === userId) throw badRequest('Lastnik iskanja obvestila prejema vedno — samega sebe ni treba dodati.');
      if (!(await isShareableUser(targetId))) throw badRequest('Tak uporabnik ne obstaja ali se še nikoli ni prijavil.');
      const { notify } = recipientPutSchema.parse(req.body ?? {});
      const target = new Types.ObjectId(targetId);

      // Dva atomarna poskusa in nobenega branja vmes (vzorec modules/todos/services/sharing.service.ts).
      const updated = await FlightSearchRuleModel.findOneAndUpdate(
        { _id: rule._id, userId: rule.userId, 'recipients.userId': target },
        { $set: { 'recipients.$[r].notify': notify } },
        { arrayFilters: [{ 'r.userId': target }], new: true, timestamps: false },
      ).lean<RuleLean | null>();
      let created = false;
      if (!updated) {
        const pushed = await FlightSearchRuleModel.findOneAndUpdate(
          {
            _id: rule._id,
            userId: rule.userId,
            'recipients.userId': { $ne: target },
            [`recipients.${env.FLIGHT_MAX_RECIPIENTS - 1}`]: { $exists: false },
          },
          { $push: { recipients: { userId: target, notify, addedAt: new Date() } } },
          { new: true, timestamps: false },
        ).lean<RuleLean | null>();
        if (!pushed) throw badRequest(`Iskanje ima lahko največ ${env.FLIGHT_MAX_RECIPIENTS} prejemnikov.`);
        created = true;
      }
      auditSearchShared(req.log, { userId, ruleId: String(rule._id), targetUserId: targetId, notify, created });
      res.json(await respondWithRule(rule._id, userId, new Date()));
    } catch (err) {
      next(err);
    }
  },
);

flightDealsRouter.delete(
  '/flight-deals/searches/:searchId/recipients/:userId',
  requireScopes(FLIGHT_DEALS_SCOPES.write),
  async (req, res, next) => {
    try {
      requireShareScope(req);
      const userId = await actorUserId(req);
      const rule = await requireOwnRule(userId, String(req.params.searchId));
      const targetId = String(req.params.userId);
      if (Types.ObjectId.isValid(targetId)) {
        const res2 = await FlightSearchRuleModel.updateOne(
          { _id: rule._id, userId: rule.userId },
          { $pull: { recipients: { userId: new Types.ObjectId(targetId) } } },
          { timestamps: false },
        );
        if (res2.modifiedCount > 0) auditSearchUnshared(req.log, { userId, ruleId: String(rule._id), targetUserId: targetId });
      }
      res.json(await respondWithRule(rule._id, userId, new Date()));
    } catch (err) {
      next(err);
    }
  },
);

// ───────────────────────────── ponudbe ─────────────────────────────

flightDealsRouter.get('/flight-deals/offers', requireScopes(FLIGHT_DEALS_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const query = offersQuerySchema.parse(req.query);
    res.json(await listOffers(userId, query));
  } catch (err) {
    next(err);
  }
});

flightDealsRouter.get('/flight-deals/offers/:offerId', requireScopes(FLIGHT_DEALS_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    res.json(await getOfferDetail(userId, String(req.params.offerId)));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── referenčno ─────────────────────────────

flightDealsRouter.get('/flight-deals/airports', requireScopes(), async (req, res, next) => {
  try {
    const query = airportsQuerySchema.parse(req.query);
    const toResponse = (a: ReturnType<typeof findAirport> & object, distanceKm?: number) => ({
      iata: a.iata,
      name: a.name,
      city: a.city,
      country: a.country,
      countryName: countryNameSl(a.country, a.countryName),
      latitude: a.lat,
      longitude: a.lon,
      timezone: a.tz,
      ...(distanceKm !== undefined ? { distanceKm } : {}),
    });

    if (query.near) {
      let lat: number;
      let lon: number;
      if (query.near.toLowerCase() === 'home') {
        const userId = req.auth?.subjectType === 'user' ? req.auth.subjectId : null;
        const places = await resolveCommutePlaces(userId);
        if (places.home.latitude === null || places.home.longitude === null) {
          throw badRequest('Domači kraj s koordinatama ni nastavljen — nastavi ga v Nastavitve → Pot ali izberi letališče kot izhodišče.');
        }
        lat = places.home.latitude;
        lon = places.home.longitude;
      } else {
        const center = findAirport(query.near);
        if (!center) throw badRequest(`Letališča ${query.near.toUpperCase()} ni v naboru.`);
        lat = center.lat;
        lon = center.lon;
      }
      const { airports, total } = airportsNear(lat, lon, query.radiusKm, query.limit);
      res.json({ airports: airports.map((a) => toResponse(a, a.distanceKm)), total });
      return;
    }

    if (!query.q || query.q.trim().length === 0) {
      res.json({ airports: [], total: 0 });
      return;
    }
    const { airports, total } = searchAirports(query.q, query.limit);
    res.json({ airports: airports.map((a) => toResponse(a)), total });
  } catch (err) {
    next(err);
  }
});

flightDealsRouter.get('/flight-deals/countries', requireScopes(), async (_req, res, next) => {
  try {
    res.json({ countries: listCountries() });
  } catch (err) {
    next(err);
  }
});

flightDealsRouter.get('/flight-deals/providers', requireScopes(), async (_req, res, next) => {
  try {
    const env = loadEnv();
    const statuses = await FlightProviderStatusModel.find().lean<Array<{ providerId: string; lastSuccessAt: Date | null }>>();
    const byId = new Map(statuses.map((s) => [s.providerId, s]));
    res.json({
      providers: FLIGHT_PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        official: p.official,
        enabled: p.isEnabled(env),
        lastSuccessAt: byId.get(p.id)?.lastSuccessAt?.toISOString() ?? null,
        notice: p.notice,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Pomožnik za teste in admin: id iskanja → lean. */
export async function findRuleForTests(ruleId: string): Promise<RuleLean | null> {
  return FlightSearchRuleModel.findById(requireObjectId(ruleId, 'Iskanje')).lean<RuleLean | null>();
}

export { originTimezoneOf };
