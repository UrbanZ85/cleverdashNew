import { Router } from 'express';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { SCANNER_SCOPES } from '../../platform/scanner/scopes.js';
import { allowedMarketplaces } from './config.js';
import { resolveSources } from './sources/index.js';

// `GET /lego-scanner/sources` (specs/018-lego-scanner/contracts/openapi.yaml): kateri viri so vklopljeni
// v tej namestitvi — samo da/ne in slovenski razlog, NIKOLI ključ ali njegov del (člen IV).

export const legoScannerRouter = Router();

legoScannerRouter.get('/lego-scanner/sources', requireScopes(SCANNER_SCOPES.read), (_req, res, next) => {
  try {
    const env = loadEnv();
    const s = resolveSources(env);
    const status = (label: string, enabled: boolean, reason: string | null) => ({ enabled, label, reason: enabled ? null : reason });
    res.json({
      catalog: status('Rebrickable (katalog)', s.catalog !== null, s.reasons.catalog),
      prices: status('BrickLink (cene)', s.prices !== null, s.reasons.prices),
      listings: status('eBay (oglasi)', s.listings !== null, s.reasons.listings),
      marketplaces: allowedMarketplaces(env),
      fake: s.fake,
    });
  } catch (err) {
    next(err);
  }
});
