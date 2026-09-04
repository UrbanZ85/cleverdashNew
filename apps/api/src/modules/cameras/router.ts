import { Router } from 'express';
import { z } from 'zod';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { ProblemError, badRequest, notFound } from '../../platform/errors/problem.js';
import { getOrRefresh, CacheMissError } from '../../platform/cache/service.js';
import { createArsoWeatherFetcher, parseArsoWeather } from '../../platform/arso/weather.client.js';
import { encrypt } from '../../platform/crypto/secret-box.js';
import { ljubljanaHour } from '../../domain/timezone.js';
import { sortCamerasByTimeOfDay } from '../../domain/camera-ordering.js';
import { toOrderAssignments } from '../../domain/camera-order.js';
import { validateCameraAddress, type CameraType } from '../../domain/camera-validation.js';
import { CameraModel } from './models/camera.model.js';
import { CameraGroupModel } from './models/camera-group.model.js';
import {
  listEffectiveEmbedHosts,
  listEffectiveHostNames,
  addEmbedHost,
  removeEmbedHost,
} from './services/embed-allowlist.service.js';
import { fetchCameraSnapshot, openCameraStream, pipeCameraStream } from './services/camera-proxy.service.js';
import { getCameraHealth } from './services/camera-health.service.js';
import { CAMERA_SCOPES } from './scopes.js';

// Endpointi pod /api/v1/cameras* in /api/v1/camera-groups* — glej
// specs/003-cameras/contracts/openapi.yaml.
export const camerasRouter = Router();
export const cameraGroupsRouter = Router();

type CameraLean = {
  _id: unknown;
  name: string;
  type: CameraType;
  previewUrl: string;
  fullUrl: string | null;
  refreshIntervalSeconds: number;
  groupId: unknown;
  timeOfDay: 'morning' | 'afternoon' | 'always';
  order: number;
  active: boolean;
  credentialsEncrypted: string | null;
  sourceTemplate: 'manual' | 'arso-webcam';
  createdAt: Date;
  updatedAt: Date;
};

async function toCameraResponse(doc: CameraLean) {
  const health = await getCameraHealth(String(doc._id), { type: doc.type });
  return {
    id: String(doc._id),
    name: doc.name,
    type: doc.type,
    previewUrl: doc.previewUrl,
    fullUrl: doc.fullUrl ?? null,
    refreshIntervalSeconds: doc.refreshIntervalSeconds,
    groupId: doc.groupId ? String(doc.groupId) : null,
    timeOfDay: doc.timeOfDay,
    order: doc.order,
    active: doc.active,
    hasCredentials: doc.credentialsEncrypted != null,
    sourceTemplate: doc.sourceTemplate,
    health,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toGroupResponse(doc: { _id: unknown; name: string; order: number; collapsed: boolean }) {
  return { id: String(doc._id), name: doc.name, order: doc.order, collapsed: doc.collapsed };
}

/** Zaporedni bloki dokumentov z istim `groupId` — vhod MORA biti že sortiran po
 * `(groupId, order)` (Mongo poizvedba spodaj to zagotovi). Časovna razvrstitev (FR-004) se
 * uporabi ZNOTRAJ vsakega bloka, ne čez celoten seznam — sicer bi pomešala kamere različnih
 * skupin med sabo. */
function groupConsecutiveByGroupId<T extends { groupId: string | null }>(items: T[]): T[][] {
  const buckets: T[][] = [];
  let currentKey: string | null | undefined;
  for (const item of items) {
    if (buckets.length === 0 || item.groupId !== currentKey) {
      buckets.push([]);
      currentKey = item.groupId;
    }
    buckets[buckets.length - 1]!.push(item);
  }
  return buckets;
}

const credentialsSchema = z.object({ username: z.string(), password: z.string() });

// `previewUrl`/`fullUrl` so navadni nizi, ne `z.string().url()` — natančno preverjanje
// (shema, gostitelj) opravi domain/camera-validation.ts in vrne razumljivo 422 z imenom
// polja, namesto generičnega Zod 400 (FR-034).
const cameraWriteSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['snapshot', 'mjpeg', 'hls', 'iframe', 'snapshot+iframe']),
  previewUrl: z.string().min(1),
  fullUrl: z.string().min(1).nullable().optional(),
  refreshIntervalSeconds: z.number().int().min(5).optional(),
  groupId: z.string().nullable().optional(),
  timeOfDay: z.enum(['morning', 'afternoon', 'always']).optional(),
  active: z.boolean().optional(),
  // `undefined` = ni podano (ohrani obstoječe, samo pri PUT); `null` = izbriši poverilnice.
  credentials: credentialsSchema.nullable().optional(),
  sourceTemplate: z.enum(['manual', 'arso-webcam']).optional(),
});

async function assertValidAddress(body: z.infer<typeof cameraWriteSchema>): Promise<void> {
  const allowedHosts = await listEffectiveHostNames();
  const result = validateCameraAddress(
    {
      type: body.type,
      previewUrl: body.previewUrl,
      fullUrl: body.fullUrl ?? null,
      hasCredentials: body.credentials !== undefined && body.credentials !== null,
    },
    allowedHosts,
  );
  if (!result.valid) {
    throw new ProblemError(422, 'Neveljaven naslov kamere', `${result.field}: ${result.reason}`);
  }
}

// ─────────────────────────── kamere: seznam in dodajanje ───────────────────────────

camerasRouter.get('/cameras', requireScopes(CAMERA_SCOPES.read), async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive !== 'false';
    const filter = includeInactive ? { userId: req.auth!.subjectId } : { userId: req.auth!.subjectId, active: true };
    const docs = (await CameraModel.find(filter).sort({ groupId: 1, order: 1 }).lean()) as unknown as CameraLean[];
    const withHealth = await Promise.all(docs.map(toCameraResponse));
    const hour = ljubljanaHour(new Date());
    const buckets = groupConsecutiveByGroupId(withHealth);
    const sorted = buckets.flatMap((bucket) => sortCamerasByTimeOfDay(bucket, hour));
    res.json({ cameras: sorted });
  } catch (err) {
    next(err);
  }
});

camerasRouter.post('/cameras', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const body = cameraWriteSchema.parse(req.body);
    await assertValidAddress(body);

    const env = loadEnv();
    const userId = req.auth!.subjectId;
    const groupId = body.groupId ?? null;
    const order = await CameraModel.countDocuments({ userId, groupId });
    const credentialsEncrypted = body.credentials
      ? encrypt(JSON.stringify(body.credentials), env.CREDENTIALS_ENCRYPTION_KEY)
      : null;

    const doc = await CameraModel.create({
      userId,
      name: body.name,
      type: body.type,
      previewUrl: body.previewUrl,
      fullUrl: body.fullUrl ?? null,
      refreshIntervalSeconds: body.refreshIntervalSeconds ?? env.CAMERA_DEFAULT_REFRESH_SECONDS,
      groupId,
      timeOfDay: body.timeOfDay ?? 'always',
      order,
      active: body.active ?? true,
      credentialsEncrypted,
      sourceTemplate: body.sourceTemplate ?? 'manual',
    });

    res.status(201).json(await toCameraResponse(doc.toObject() as unknown as CameraLean));
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── kamere: vrstni red ───────────────────────────

const reorderSchema = z.object({
  groupId: z.string().nullable(),
  cameraIds: z.array(z.string()),
});

camerasRouter.put('/cameras/order', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const body = reorderSchema.parse(req.body);
    const userId = req.auth!.subjectId;
    const assignments = toOrderAssignments(body.cameraIds);
    await Promise.all(
      assignments.map(({ id, order }) => CameraModel.updateOne({ _id: id, userId, groupId: body.groupId }, { order })),
    );
    const docs = (await CameraModel.find({ userId, groupId: body.groupId })
      .sort({ order: 1 })
      .lean()) as unknown as CameraLean[];
    res.json({ cameras: await Promise.all(docs.map(toCameraResponse)) });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── dovoljeni gostitelji ───────────────────────────
//
// POMEMBNO: ta blok in "ARSO webcam predloga" spodaj MORATA biti registrirana PRED
// "/cameras/:cameraId" (Ekspresov usmerjevalnik gleda po vrstnem redu registracije —
// parametrizirana pot bi sicer prestregla "/cameras/embed-hosts" in "/cameras/arso-webcams"
// tako, da bi "embed-hosts"/"arso-webcams" razumela kot vrednost `cameraId`; redocly lint
// (analiza vrata 3, plan.md) je to isto nedvoumnost že opozoril kot slogovno opombo — tu se
// je izkazala za resnično napako v usmerjanju, ne le kozmetično).

camerasRouter.get('/cameras/embed-hosts', requireScopes(CAMERA_SCOPES.read), async (_req, res, next) => {
  try {
    res.json({ hosts: await listEffectiveEmbedHosts() });
  } catch (err) {
    next(err);
  }
});

const addEmbedHostSchema = z.object({ host: z.string().min(1), addedReason: z.string().optional() });

camerasRouter.post('/cameras/embed-hosts', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const body = addEmbedHostSchema.parse(req.body);
    const doc = await addEmbedHost(body.host, body.addedReason ?? null);
    res.status(201).json({ host: doc.host, source: 'user' as const });
  } catch (err) {
    next(err);
  }
});

camerasRouter.delete('/cameras/embed-hosts/:host', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    await removeEmbedHost(String(req.params.host));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── ARSO webcam predloga ───────────────────────────

camerasRouter.get('/cameras/arso-webcams', requireScopes(CAMERA_SCOPES.read), async (req, res, next) => {
  try {
    const location = typeof req.query.location === 'string' ? req.query.location : '';
    if (!location) {
      next(badRequest('Parameter "location" je obvezen.'));
      return;
    }
    const env = loadEnv();
    const fetcher = createArsoWeatherFetcher(env.ARSO_WEATHER_URL, location);
    const result = await getOrRefresh({
      key: `weather:${location}`,
      sourceUrl: env.ARSO_WEATHER_URL,
      ttlSeconds: env.WEATHER_CACHE_SECONDS,
      fetcher,
    });
    const data = parseArsoWeather(result.payload);
    // `w.image` je RELATIVNA pot v ARSO odgovoru — brez osnove ni fetchable (preverjeno
    // proti pravemu odgovoru 21. 8. 2026, glej env.ts ARSO_WEBCAM_BASE_URL).
    const webcams = (data.current?.webcam ?? []).map((w) => ({
      direction: w.direction,
      imageUrl: new URL(w.image, env.ARSO_WEBCAM_BASE_URL).toString(),
    }));
    res.json({ webcams });
  } catch (err) {
    // research.md §2: "never-fetched" za to lokacijo je enakovredno "trenutno brez slike",
    // ne napaka — obrazec (FR-037) prazen seznam obravnava enako v obeh primerih.
    if (err instanceof CacheMissError) {
      res.json({ webcams: [] });
      return;
    }
    next(err);
  }
});

// ─────────────────────────── kamere: ena kamera ───────────────────────────

// FR-010: kamera je osebni podatek — obseg po `userId` je del same poizvedbe (ne naknadno
// preverjanje), da tuja kamera vrne 404 enako kot neobstoječa, ne 403 (ne razkriva obstoja).
async function findCameraOr404(id: string, userId: string) {
  const doc = await CameraModel.findOne({ _id: id, userId });
  if (!doc) throw notFound(`Kamera "${id}" ne obstaja.`);
  return doc;
}

camerasRouter.get('/cameras/:cameraId', requireScopes(CAMERA_SCOPES.read), async (req, res, next) => {
  try {
    const doc = await findCameraOr404(String(req.params.cameraId), req.auth!.subjectId);
    res.json(await toCameraResponse(doc.toObject() as unknown as CameraLean));
  } catch (err) {
    next(err);
  }
});

camerasRouter.put('/cameras/:cameraId', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const doc = await findCameraOr404(String(req.params.cameraId), req.auth!.subjectId);
    const body = cameraWriteSchema.parse(req.body);
    // FR-034, Story 4 scenarij 4: validacija pred KAKRŠNOKOLI spremembo dokumenta — če
    // spodletí, `doc` ostane popolnoma nedotaknjen.
    await assertValidAddress(body);

    const env = loadEnv();
    doc.name = body.name;
    doc.type = body.type;
    doc.previewUrl = body.previewUrl;
    doc.fullUrl = body.fullUrl ?? null;
    if (body.refreshIntervalSeconds !== undefined) doc.refreshIntervalSeconds = body.refreshIntervalSeconds;
    doc.groupId = (body.groupId ?? null) as unknown as typeof doc.groupId;
    doc.timeOfDay = body.timeOfDay ?? doc.timeOfDay;
    if (body.active !== undefined) doc.active = body.active;
    doc.sourceTemplate = body.sourceTemplate ?? doc.sourceTemplate;
    // `credentials` odsoten v telesu = ohrani obstoječe; `null` = izbriši; objekt = zamenjaj.
    if (body.credentials !== undefined) {
      doc.credentialsEncrypted = body.credentials
        ? encrypt(JSON.stringify(body.credentials), env.CREDENTIALS_ENCRYPTION_KEY)
        : null;
    }
    await doc.save();

    res.json(await toCameraResponse(doc.toObject() as unknown as CameraLean));
  } catch (err) {
    next(err);
  }
});

camerasRouter.delete('/cameras/:cameraId', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const doc = await findCameraOr404(String(req.params.cameraId), req.auth!.subjectId);
    await doc.deleteOne();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── mediji in zdravje ───────────────────────────

camerasRouter.get('/cameras/:cameraId/snapshot', requireScopes(CAMERA_SCOPES.read), async (req, res, next) => {
  try {
    const doc = await findCameraOr404(String(req.params.cameraId), req.auth!.subjectId);
    const result = await fetchCameraSnapshot(String(doc._id), {
      previewUrl: doc.previewUrl,
      credentialsEncrypted: doc.credentialsEncrypted,
      refreshIntervalSeconds: doc.refreshIntervalSeconds,
    });
    res.set({
      'X-Camera-Freshness': result.freshness.kind,
      'X-Camera-Age-Seconds': String(result.ageSeconds),
    });
    res.type(result.contentType).send(result.payload as Buffer);
  } catch (err) {
    if (err instanceof CacheMissError) {
      next(new ProblemError(503, 'Trenutno nedosegljivo', 'Posnetka še ni bilo mogoče pridobiti. Poskusi znova čez nekaj trenutkov.'));
      return;
    }
    next(err);
  }
});

camerasRouter.get('/cameras/:cameraId/stream', requireScopes(CAMERA_SCOPES.read), async (req, res, next) => {
  try {
    const doc = await findCameraOr404(String(req.params.cameraId), req.auth!.subjectId);
    const upstream = await openCameraStream({ previewUrl: doc.previewUrl, credentialsEncrypted: doc.credentialsEncrypted });
    pipeCameraStream(upstream, res);
  } catch (err) {
    next(err);
  }
});

camerasRouter.get('/cameras/:cameraId/health', requireScopes(CAMERA_SCOPES.read), async (req, res, next) => {
  try {
    const doc = await findCameraOr404(String(req.params.cameraId), req.auth!.subjectId);
    res.json(await getCameraHealth(String(doc._id), { type: doc.type }));
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── skupine kamer ───────────────────────────

const cameraGroupWriteSchema = z.object({
  name: z.string().min(1),
  collapsed: z.boolean().optional(),
});

cameraGroupsRouter.get('/camera-groups', requireScopes(CAMERA_SCOPES.read), async (req, res, next) => {
  try {
    const docs = await CameraGroupModel.find({ userId: req.auth!.subjectId }).sort({ order: 1 }).lean();
    res.json({ groups: docs.map(toGroupResponse) });
  } catch (err) {
    next(err);
  }
});

cameraGroupsRouter.post('/camera-groups', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const body = cameraGroupWriteSchema.parse(req.body);
    const userId = req.auth!.subjectId;
    const order = await CameraGroupModel.countDocuments({ userId });
    const doc = await CameraGroupModel.create({ userId, name: body.name, collapsed: body.collapsed ?? false, order });
    res.status(201).json(toGroupResponse(doc));
  } catch (err) {
    next(err);
  }
});

const reorderGroupsSchema = z.object({ groupIds: z.array(z.string()) });

cameraGroupsRouter.put('/camera-groups/order', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const body = reorderGroupsSchema.parse(req.body);
    const userId = req.auth!.subjectId;
    const assignments = toOrderAssignments(body.groupIds);
    await Promise.all(assignments.map(({ id, order }) => CameraGroupModel.updateOne({ _id: id, userId }, { order })));
    const docs = await CameraGroupModel.find({ userId }).sort({ order: 1 }).lean();
    res.json({ groups: docs.map(toGroupResponse) });
  } catch (err) {
    next(err);
  }
});

cameraGroupsRouter.put('/camera-groups/:groupId', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const doc = await CameraGroupModel.findOne({ _id: req.params.groupId, userId: req.auth!.subjectId });
    if (!doc) throw notFound(`Skupina "${req.params.groupId}" ne obstaja.`);
    const body = cameraGroupWriteSchema.parse(req.body);
    doc.name = body.name;
    if (body.collapsed !== undefined) doc.collapsed = body.collapsed;
    await doc.save();
    res.json(toGroupResponse(doc));
  } catch (err) {
    next(err);
  }
});

cameraGroupsRouter.delete('/camera-groups/:groupId', requireScopes(CAMERA_SCOPES.write), async (req, res, next) => {
  try {
    const userId = req.auth!.subjectId;
    const doc = await CameraGroupModel.findOne({ _id: req.params.groupId, userId });
    if (!doc) throw notFound(`Skupina "${req.params.groupId}" ne obstaja.`);
    // FR-015: brisanje skupine ne izbriše kamer — postanejo "brez skupine".
    await CameraModel.updateMany({ groupId: doc._id, userId }, { groupId: null });
    await doc.deleteOne();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
