import { Router } from 'express';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { SCANNER_SCOPES } from '../../platform/scanner/scopes.js';
import { describeCategories } from './categories/registry.js';
import { allowedMarketplaces } from './config.js';
import { resolveSources } from './sources/index.js';

// `GET /collectibles-scanner/sources` in `/categories` (specs/019-collectibles-scanner/contracts/openapi.yaml):
// kateri viri so vklopljeni v tej namestitvi (samo da/ne in slovenski razlog, NIKOLI ključ ali njegov del,
// člen IV) in opis kategorij za dinamični obrazec.

export const collectiblesScannerRouter = Router();

collectiblesScannerRouter.get('/collectibles-scanner/sources', requireScopes(SCANNER_SCOPES.read), (_req, res, next) => {
  try {
    const env = loadEnv();
    const s = resolveSources(env);
    const status = (label: string, enabled: boolean, reason: string | null) => ({ enabled, label, reason: enabled ? null : reason });
    res.json({
      listings: status('eBay (oglasi)', s.listings !== null, s.reasons.listings),
      catalog: status('TCGdex (katalog kartic)', s.cardCatalog !== null, s.reasons.cardCatalog),
      prices: status('PriceCharting (cenik retro iger)', s.retroPrices !== null, s.reasons.retroPrices),
      marketplaces: allowedMarketplaces(env),
      fake: s.fake,
    });
  } catch (err) {
    next(err);
  }
});

collectiblesScannerRouter.get('/collectibles-scanner/categories', requireScopes(SCANNER_SCOPES.read), (_req, res, next) => {
  try {
    res.json({ categories: describeCategories() });
  } catch (err) {
    next(err);
  }
});
