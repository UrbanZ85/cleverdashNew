import { Router } from 'express';
import { z } from 'zod';
import { getOrCreateSettings } from './model.js';
import { validateTileLayout } from './services/tile-layout.service.js';
import { requireScopes } from '../../platform/auth/scopes.js';

export const settingsRouter = Router();

function toResponse(settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
  return {
    weather: settings.weather,
    theme: settings.theme,
    tiles: settings.tiles,
    tabs: settings.tabs ?? {},
    updatedAt: settings.updatedAt,
  };
}

settingsRouter.get('/settings', requireScopes(), async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(toResponse(settings));
  } catch (err) {
    next(err);
  }
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
});

settingsRouter.put('/settings', requireScopes(), async (req, res, next) => {
  try {
    const body = settingsUpdateSchema.parse(req.body);
    const settings = await getOrCreateSettings();

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
      // samo `enabled` pobrisalo že shranjen `order` za isti zavihek.
      const currentTabs = { ...(settings.tabs as Record<string, { enabled?: boolean; order?: number }>) };
      for (const [tabId, patch] of Object.entries(body.tabs)) {
        currentTabs[tabId] = { ...currentTabs[tabId], ...patch };
      }
      settings.tabs = currentTabs;
      settings.markModified('tabs');
    }
    settings.updatedAt = new Date();
    await settings.save();

    res.json(toResponse(settings));
  } catch (err) {
    next(err);
  }
});
