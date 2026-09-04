import { Router } from 'express';
import { z } from 'zod';
import { getOrCreateSettingsForUser } from './model.js';
import { validateTileLayout } from './services/tile-layout.service.js';
import { validateTabOverrides } from './services/tab-overrides.service.js';
import { validateSourceOverrides } from './services/source-overrides.service.js';
import { DEFAULT_MAP_HEIGHT_PX, validateCommuteSettings } from './services/commute-settings.service.js';
import { requireScopes } from '../../platform/auth/scopes.js';

export const settingsRouter = Router();

function toResponse(settings: Awaited<ReturnType<typeof getOrCreateSettingsForUser>>) {
  return {
    weather: settings.weather,
    theme: settings.theme,
    tiles: settings.tiles,
    tabs: settings.tabs ?? {},
    sources: {
      weatherUrl: settings.sources?.weatherUrl ?? null,
      radarUrl: settings.sources?.radarUrl ?? null,
      webcamBaseUrl: settings.sources?.webcamBaseUrl ?? null,
    },
    // 003, data-model.md "Nastavitve porabe podatkov": privzeto true, tudi za dokumente,
    // ustvarjene pred to funkcionalnostjo (Mongoose shemin privzetek se uveljavi ob branju).
    cameraDataSaverEnabled: settings.cameraDataSaverEnabled ?? true,
    // 007: privolitev za prepis govora na strežniku (privzeto izklopljena, glej model.ts).
    notes: { serverTranscription: settings.notes?.serverTranscription === true },
    // Ploščica "Pot": dva kraja in videz ploščice. `null` pomeni "ni nastavljeno"; privzetki
    // se uveljavijo tudi za dokumente, shranjene pred to funkcionalnostjo (kot pri `sources`).
    commute: {
      mapHeightPx: settings.commute?.mapHeightPx ?? DEFAULT_MAP_HEIGHT_PX,
      layout: settings.commute?.layout ?? 'vertical',
      home: {
        label: settings.commute?.home?.label ?? 'Doma',
        address: settings.commute?.home?.address ?? null,
        latitude: settings.commute?.home?.latitude ?? null,
        longitude: settings.commute?.home?.longitude ?? null,
      },
      work: {
        label: settings.commute?.work?.label ?? 'Služba',
        address: settings.commute?.work?.address ?? null,
        latitude: settings.commute?.work?.latitude ?? null,
        longitude: settings.commute?.work?.longitude ?? null,
      },
    },
    updatedAt: settings.updatedAt,
  };
}

settingsRouter.get('/settings', requireScopes(), async (req, res, next) => {
  try {
    const settings = await getOrCreateSettingsForUser(req.auth!.subjectId);
    res.json(toResponse(settings));
  } catch (err) {
    next(err);
  }
});

const commutePlaceSchema = z.object({
  label: z.string().nullish(),
  address: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
});

const settingsUpdateSchema = z.object({
  weather: z
    .object({
      locationName: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  tiles: z.array(z.unknown()).optional(),
  tabs: z.record(z.string(), z.object({ enabled: z.boolean().optional(), order: z.number().optional() })).optional(),
  // `null` je pomenska vrednost: "povrni na sistemski privzetek", ne "ne spreminjaj".
  sources: z
    .object({
      weatherUrl: z.string().nullish(),
      radarUrl: z.string().nullish(),
      webcamBaseUrl: z.string().nullish(),
    })
    .optional(),
  cameraDataSaverEnabled: z.boolean().optional(),
  notes: z.object({ serverTranscription: z.boolean().optional() }).optional(),
  // Kot pri `sources`: `null`/prazen niz pomeni "ni nastavljeno", ne "ne spreminjaj".
  // Vsebinska pravila (dolžine, koordinati kot par, meje) so v commute-settings.service.ts —
  // tu samo oblika.
  commute: z
    .object({
      home: commutePlaceSchema.optional(),
      work: commutePlaceSchema.optional(),
      mapHeightPx: z.number().nullish(),
      layout: z.enum(['vertical', 'horizontal']).nullish(),
    })
    .optional(),
});

settingsRouter.put('/settings', requireScopes(), async (req, res, next) => {
  try {
    const body = settingsUpdateSchema.parse(req.body);
    const settings = await getOrCreateSettingsForUser(req.auth!.subjectId);

    // Delna posodobitev: navedejo se samo polja, ki se spremenijo (openapi.yaml,
    // SettingsUpdate). `weather` je gnezden objekt — spremenijo se samo podana podpolja,
    // ne cel objekt naenkrat.
    if (body.weather) {
      // `weather` ima privzetke na ravni sheme, zato ob branju obstoječega singletona
      // vedno obstaja — TS ga zaradi izpeljave tipa vseeno vidi kot mogoče manjkajočega.
      const weather = settings.weather!;
      if (body.weather.locationName !== undefined) weather.locationName = body.weather.locationName;
      if (body.weather.latitude !== undefined) weather.latitude = body.weather.latitude;
      if (body.weather.longitude !== undefined) weather.longitude = body.weather.longitude;
      settings.markModified('weather');
    }
    if (body.theme) settings.theme = body.theme;
    if (body.tiles) {
      // `settings.set(path, value)` namesto neposredne dodelitve — Mongoosov tipiziran
      // DocumentArray zahteva svojo obliko podatkov, `set` pa sprejme navaden seznam in
      // ga sam pretvori ter označi kot spremenjenega.
      settings.set('tiles', validateTileLayout(body.tiles, req.log));
    }
    if (body.tabs) {
      // Zlitje na ravni posameznega zavihka, ne cele mape naenkrat — sicer bi prekritje
      // samo `enabled` pobrisalo že shranjen `order` za isti zavihek. Varovalka proti
      // izklopu zavihkov, brez katerih se uporabnik zaklene iz aplikacije, je STREŽNIŠKA
      // (ne le v vmesniku) — glej tab-overrides.service.ts.
      const currentTabs = { ...(settings.tabs as Record<string, { enabled?: boolean; order?: number }>) };
      settings.tabs = validateTabOverrides(currentTabs, body.tabs);
      settings.markModified('tabs');
    }
    if (body.sources) {
      const sources = settings.sources ?? {};
      Object.assign(sources, validateSourceOverrides(body.sources));
      settings.sources = sources;
      settings.markModified('sources');
    }
    if (body.cameraDataSaverEnabled !== undefined) {
      settings.cameraDataSaverEnabled = body.cameraDataSaverEnabled;
    }
    if (body.notes?.serverTranscription !== undefined) {
      // `settings.set(pot, vrednost)` namesto dodelitve v gnezden objekt: Mongoose gnezdeno
      // pot sam ustvari in označi kot spremenjeno tudi pri dokumentih, shranjenih PRED to
      // funkcionalnostjo, kjer `settings.notes` še ne obstaja.
      settings.set('notes.serverTranscription', body.notes.serverTranscription);
    }
    if (body.commute) {
      // `settings.set(pot, vrednost)` po posameznem polju — gnezdenega `commute` pri
      // dokumentih, shranjenih PRED to funkcionalnostjo, še ni, in dodelitev celega objekta
      // bi nenavedena polja drugega kraja pobrisala.
      const commute = validateCommuteSettings(body.commute);
      for (const place of ['home', 'work'] as const) {
        const fields = commute[place];
        if (!fields) continue;
        for (const [field, value] of Object.entries(fields)) {
          settings.set(`commute.${place}.${field}`, value);
        }
      }
      // Videz ploščice sta ploščata polja na `commute`, ne del kraja.
      if (commute.mapHeightPx !== undefined) settings.set('commute.mapHeightPx', commute.mapHeightPx);
      if (commute.layout !== undefined) settings.set('commute.layout', commute.layout);
    }
    settings.updatedAt = new Date();
    await settings.save();

    res.json(toResponse(settings));
  } catch (err) {
    next(err);
  }
});
