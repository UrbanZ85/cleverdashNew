import { Router } from 'express';
import { requireScopes } from '../../platform/auth/scopes.js';

// PREDLOGA — preimenuj mapo `__tab_id__` v dejansko ime modula (angleško, kebab-case).
// Uvažaj samo iz `platform/`, `domain/` ali paketov — nikoli neposredno iz drugega modula
// pod `modules/` (člen I; lint pravilo v eslint.config.js to zavrne kot napako).
export const __tab_id__Router = Router();

__tab_id__Router.get('/__tab_id__', requireScopes(), async (_req, res) => {
  res.json({ ok: true });
});
