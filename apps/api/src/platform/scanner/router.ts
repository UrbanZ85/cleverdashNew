import { Router } from 'express';
import { loadEnv } from '../config/env.js';
import { requireScopes } from '../auth/scopes.js';
import { listSchedulePresets } from './domain/schedule-slots.js';
import { listScannerTypes } from './registry.js';
import { toTypeInfo } from './services/type-info.service.js';

// Uporabniška polovica jedra skenerjev (016): referenčni seznam tipov, seznam skenerjev vseh
// tipov, generične definicije, rezultati. Vse pod `requireScopes` (API ključ z ustreznimi obsegi
// pride skozi, člen III); administracija je v admin.router.ts.
//
// VRSTNI RED POTI JE POMEMBEN (ista opomba kot modules/flight-deals/router.ts): statične poti
// (`/scanners/types`) so deklarirane PRED `/scanners/:scannerId`.

export const scannersRouter = Router();

// ───────────────────────────── referenčno ─────────────────────────────

scannersRouter.get('/scanners/types', requireScopes(), async (req, res, next) => {
  try {
    const env = loadEnv();
    const scopes = req.auth?.scopes ?? [];
    res.json({
      types: listScannerTypes().map((type) => toTypeInfo(type, env, scopes)),
      presets: listSchedulePresets(),
    });
  } catch (err) {
    next(err);
  }
});
