import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireScopes } from '../../platform/auth/scopes.js';
import { badRequest, notFound, serviceUnavailable } from '../../platform/errors/problem.js';
import { getOrRefresh, CacheMissError, type ConditionalFetchResult } from '../../platform/cache/service.js';
import { validateOutboundUrl } from '../../domain/outbound-url.js';
import { extractPluginFields, isValidJsonPath } from '../../domain/json-path.js';
import { buildSourceMeta } from './mappers/weather.mapper.js';
import { DashboardPluginModel, PLUGIN_KINDS, type PluginKind } from './models/dashboard-plugin.model.js';

// 005: CRUD nad uporabniško definiranimi ploščicami + strežniški prenos njihovih virov.
//
// Zakaj gre prenos prek strežnika in ne iz brskalnika: člen VIII prepoveduje, da bi
// odjemalec kdaj klical zunanji vir neposredno. Vsak prenos zato teče skozi
// `platform/cache/service.ts` z uporabnikovim TTL, natanko kot `/dashboard/radar`.
//
// Isti router je registriran v modules/dashboard — ne kot svoj modul, ker so vtičniki
// ploščice na nadzorni plošči, ne nov zavihek (člen I).
export const dashboardPluginsRouter = Router();

const jsonFieldSchema = z.object({
  label: z.string().trim().min(1).max(40),
  path: z.string().trim().min(1).max(200),
  unit: z.string().trim().max(16).nullish(),
});

const basePluginSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(60).optional(),
  kind: z.enum(PLUGIN_KINDS),
  url: z.string().trim().min(1).max(2048),
  openInNewTab: z.boolean().optional(),
  description: z.string().trim().max(200).nullish(),
  heightPx: z.number().int().min(80).max(1200).optional(),
  widthPx: z.number().int().min(200).max(1600).optional(),
  refreshSeconds: z.number().int().min(30).max(86_400).optional(),
  alt: z.string().trim().max(200).nullish(),
  fields: z.array(jsonFieldSchema).max(12).optional(),
});

type PluginInput = z.infer<typeof basePluginSchema>;

/** Zahteve, ki jih shema tipov ne izrazi: vtičnik vrste `json` brez polj ne bi imel česa
 * pokazati, pot pa mora biti berljiva za `domain/json-path.ts`. */
function validateKindSpecifics(input: PluginInput): string | null {
  if (input.kind === 'json') {
    const fields = input.fields ?? [];
    if (fields.length === 0) {
      return 'Vtičnik vrste "json" potrebuje vsaj eno polje za prikaz.';
    }
    const bad = fields.find((f) => !isValidJsonPath(f.path));
    if (bad) {
      return `Pot "${bad.path}" ni veljavna. Uporabi pike med koraki, npr. observation.t ali list.0.main.temp.`;
    }
  }
  return null;
}

/** Privzeta širina ploščice — ista vrednost kot `widthPx.default` v shemi in kot
 * `--cd-tile-min-width` na odjemalcu. */
const DEFAULT_WIDTH_PX = 320;

/** Dokumenti, ustvarjeni preden je bila širina izražena v slikovnih točkah, imajo `columnSpan`
 * (1–3 stolpce) in nimajo `widthPx`. Preslikamo jih v približno enako široko ploščico, da po
 * nadgradnji nič vidno ne poskoči; ob prvem shranjevanju vtičnika se zapiše `widthPx` in ta
 * pot postane odveč (takrat se ta funkcija in `columnSpan` spodaj lahko odstranita). */
function legacySpanToWidthPx(columnSpan: number | undefined): number {
  if (columnSpan === undefined) return DEFAULT_WIDTH_PX;
  // Stolpec je bil širok --cd-tile-min-width (320 px), razmik med njimi --cd-space-4 (16 px).
  return Math.min(1600, DEFAULT_WIDTH_PX * columnSpan + 16 * (columnSpan - 1));
}

function toPluginResponse(doc: {
  _id: unknown;
  name: string;
  icon: string;
  kind: PluginKind;
  url: string;
  openInNewTab: boolean;
  description: string | null;
  heightPx: number;
  widthPx?: number;
  /** @deprecated samo za dokumente izpred prehoda na `widthPx` — glej legacySpanToWidthPx. */
  columnSpan?: number;
  refreshSeconds: number;
  alt: string | null;
  fields: Array<{ label: string; path: string; unit: string | null }>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(doc._id),
    name: doc.name,
    icon: doc.icon,
    kind: doc.kind,
    url: doc.url,
    openInNewTab: doc.openInNewTab,
    description: doc.description ?? null,
    heightPx: doc.heightPx,
    widthPx: doc.widthPx ?? legacySpanToWidthPx(doc.columnSpan),
    refreshSeconds: doc.refreshSeconds,
    alt: doc.alt ?? null,
    fields: doc.fields.map((f) => ({ label: f.label, path: f.path, unit: f.unit ?? null })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** `userId` je del poizvedbe, ne naknadno preverjanje — tuj vtičnik zato ni 403, ampak
 * 404: obstoj tujega zapisa ni podatek, ki bi ga bilo treba razkriti (vzorec 004). */
async function findOwnPluginOr404(pluginId: string, userId: string) {
  if (!Types.ObjectId.isValid(pluginId)) throw notFound('Vtičnik ne obstaja.');
  const doc = await DashboardPluginModel.findOne({ _id: pluginId, userId });
  if (!doc) throw notFound('Vtičnik ne obstaja.');
  return doc;
}

function requireUserId(req: { auth?: { subjectType: string; subjectId: string } }): string {
  if (req.auth?.subjectType !== 'user') {
    // API ključi (avtomatizacija) nimajo osebnih vtičnikov — enako kot nimajo nastavitev.
    throw badRequest('Vtičniki obstajajo samo za prijavljenega uporabnika, ne za API ključ.');
  }
  return req.auth.subjectId;
}

dashboardPluginsRouter.get('/dashboard/plugins', requireScopes(), async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const docs = await DashboardPluginModel.find({ userId }).sort({ name: 1 }).lean();
    res.json({ plugins: docs.map((d) => toPluginResponse(d as never)) });
  } catch (err) {
    next(err);
  }
});

dashboardPluginsRouter.get('/dashboard/plugins/:pluginId', requireScopes(), async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const doc = await findOwnPluginOr404(String(req.params.pluginId), userId);
    res.json(toPluginResponse(doc.toObject() as never));
  } catch (err) {
    next(err);
  }
});

dashboardPluginsRouter.post('/dashboard/plugins', requireScopes(), async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const parsed = basePluginSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')));
      return;
    }

    const kindError = validateKindSpecifics(parsed.data);
    if (kindError) {
      next(badRequest(kindError));
      return;
    }

    const urlCheck = validateOutboundUrl(parsed.data.url);
    if (!urlCheck.ok) {
      next(badRequest(urlCheck.message));
      return;
    }

    const existing = await DashboardPluginModel.findOne({ userId, name: parsed.data.name });
    if (existing) {
      next(badRequest(`Vtičnik z imenom "${parsed.data.name}" že obstaja.`));
      return;
    }

    const doc = await DashboardPluginModel.create({ ...parsed.data, url: urlCheck.url.href, userId });
    res.status(201).json(toPluginResponse(doc.toObject() as never));
  } catch (err) {
    next(err);
  }
});

dashboardPluginsRouter.put('/dashboard/plugins/:pluginId', requireScopes(), async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const doc = await findOwnPluginOr404(String(req.params.pluginId), userId);

    const parsed = basePluginSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')));
      return;
    }

    const kindError = validateKindSpecifics(parsed.data);
    if (kindError) {
      next(badRequest(kindError));
      return;
    }

    const urlCheck = validateOutboundUrl(parsed.data.url);
    if (!urlCheck.ok) {
      next(badRequest(urlCheck.message));
      return;
    }

    const clash = await DashboardPluginModel.findOne({
      userId,
      name: parsed.data.name,
      _id: { $ne: doc._id },
    });
    if (clash) {
      next(badRequest(`Vtičnik z imenom "${parsed.data.name}" že obstaja.`));
      return;
    }

    doc.set({ ...parsed.data, url: urlCheck.url.href });
    await doc.save();
    res.json(toPluginResponse(doc.toObject() as never));
  } catch (err) {
    next(err);
  }
});

dashboardPluginsRouter.delete('/dashboard/plugins/:pluginId', requireScopes(), async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const doc = await findOwnPluginOr404(String(req.params.pluginId), userId);
    await doc.deleteOne();
    // Vnos v Settings.tiles, ki kaže na izbrisan vtičnik, se NE pospravlja tukaj: ob branju
    // ga dashboard preprosto preskoči (FR-020, ista pot kot za neznano vrsto ploščice).
    // Brisanje bi pomenilo pisanje v drug modul iz tega — člen I.
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** Prenese vir vtičnika v imenu uporabnika — samo za vrsti `image` in `json`. `link` in
 * `iframe` naslov odpre brskalnik sam, zato zanju ta pot nima pomena. */
dashboardPluginsRouter.get('/dashboard/plugins/:pluginId/data', requireScopes(), async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const plugin = await findOwnPluginOr404(String(req.params.pluginId), userId);

    if (plugin.kind !== 'image' && plugin.kind !== 'json') {
      next(badRequest(`Vtičnik vrste "${plugin.kind}" nima podatkov, ki bi jih prenesel strežnik.`));
      return;
    }

    // Naslov se preveri ZNOVA ob vsakem prenosu, ne samo ob shranjevanju: pravila se lahko
    // poostrijo, dokument v bazi pa je star.
    const urlCheck = validateOutboundUrl(plugin.url);
    if (!urlCheck.ok) {
      next(badRequest(urlCheck.message));
      return;
    }

    const isImage = plugin.kind === 'image';
    const result = await getOrRefresh({
      // Ključ vsebuje ID vtičnika, ne naslova: dva uporabnika z istim virom imata vsak svoj
      // TTL in svojo zgodovino napak, in nihče ne more brati tujega predpomnjenega odgovora.
      key: `plugin:${String(plugin._id)}`,
      sourceUrl: urlCheck.url.href,
      ttlSeconds: plugin.refreshSeconds,
      fetcher: createPluginFetcher(urlCheck.url.href, isImage),
    });

    const meta = buildSourceMeta(result.freshness, result.ageSeconds, plugin.refreshSeconds);

    if (isImage) {
      res.set({
        'X-Source-Fetched-At': meta.fetchedAt,
        'X-Source-Stale': String(meta.stale),
        'X-Source-Next-Poll-Seconds': String(meta.nextPollSeconds),
      });
      res.type(result.contentType).send(result.payload);
      return;
    }

    res.json({
      fields: extractPluginFields(
        result.payload,
        plugin.fields.map((f) => ({ label: f.label, path: f.path, unit: f.unit ?? null })),
      ),
      source: {
        fetchedAt: meta.fetchedAt,
        ageSeconds: meta.ageSeconds,
        stale: meta.stale,
        nextPollSeconds: meta.nextPollSeconds,
      },
    });
  } catch (err) {
    if (err instanceof CacheMissError) {
      next(serviceUnavailable('Podatka tega vtičnika še ni na voljo. Poskusi znova čez nekaj trenutkov.'));
      return;
    }
    next(err);
  }
});

/** Zgornja meja prenesenega telesa — brez nje bi lahko vir (tudi po nesreči) napolnil
 * predpomnilnik v bazi z večgigabajtnim odgovorom. */
const MAX_PLUGIN_BODY_BYTES = 2 * 1024 * 1024;

function createPluginFetcher(sourceUrl: string, isImage: boolean) {
  return async function fetchPluginSource(conditional: {
    etag: string | null;
    lastModified: string | null;
  }): Promise<ConditionalFetchResult> {
    const headers: Record<string, string> = {
      accept: isImage ? 'image/*' : 'application/json',
    };
    if (conditional.etag) headers['if-none-match'] = conditional.etag;
    if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;

    const res = await fetch(sourceUrl, { headers, redirect: 'error' });

    if (res.status === 304) return { status: 304 };
    if (!res.ok) throw new Error(`Vir vtičnika je vrnil ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_PLUGIN_BODY_BYTES) {
      throw new Error(`Odgovor vira je večji od ${MAX_PLUGIN_BODY_BYTES} bajtov`);
    }

    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');

    if (isImage) {
      return {
        status: 200,
        body: buffer,
        contentType: res.headers.get('content-type') ?? 'image/png',
        etag,
        lastModified,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new Error('Vir ni vrnil veljavnega JSON-a');
    }
    return { status: 200, body: parsed, contentType: 'application/json', etag, lastModified };
  };
}
