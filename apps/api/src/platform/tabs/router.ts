import { Router } from 'express';
import { listAllTabsForUser, resolveTabs } from './resolver.js';
import { requireScopes } from '../auth/scopes.js';

export const tabsRouter = Router();

// 005: seznam za zaslon "Meni" v nastavitvah — vrne TUDI izklopljene zavihke, ki jih
// `GET /tabs` po definiciji izpusti. Brez tega izklopljenega zavihka ne bi bilo mogoče
// vklopiti nazaj, ker ga v vmesniku ne bi bilo videti nikjer.
tabsRouter.get('/tabs/all', requireScopes(), async (req, res, next) => {
  try {
    const userId = req.auth?.subjectType === 'user' ? req.auth.subjectId : null;
    res.json(await listAllTabsForUser(req.auth?.scopes ?? [], userId));
  } catch (err) {
    next(err);
  }
});

tabsRouter.get('/tabs', requireScopes(), async (req, res, next) => {
  try {
    const userId = req.auth?.subjectType === 'user' ? req.auth.subjectId : null;
    const tabs = await resolveTabs(req.auth?.scopes ?? [], userId);
    res.json(tabs);
  } catch (err) {
    next(err);
  }
});
