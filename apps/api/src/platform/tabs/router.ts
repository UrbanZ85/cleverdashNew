import { Router } from 'express';
import { resolveTabs } from './resolver.js';
import { requireScopes } from '../auth/scopes.js';

export const tabsRouter = Router();

tabsRouter.get('/tabs', requireScopes(), async (req, res, next) => {
  try {
    const tabs = await resolveTabs(req.auth?.scopes ?? []);
    res.json(tabs);
  } catch (err) {
    next(err);
  }
});
