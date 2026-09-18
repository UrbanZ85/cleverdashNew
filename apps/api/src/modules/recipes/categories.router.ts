import { Router, type Request } from 'express';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { notFound } from '../../platform/errors/problem.js';
import { categoryOrderSchema, categoryWriteSchema } from './domain/recipe-input.js';
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  reorderCategories,
} from './services/category.service.js';
import { RECIPE_SCOPES } from './scopes.js';

// Endpointi pod /api/v1/recipe-categories* — glej specs/013-recipes/contracts/openapi.yaml.
//
// Ločena korenina in zato LOČEN usmerjevalnik, enako kot `camerasRouter`/`cameraGroupsRouter` (003)
// in `savedLinksRouter`/`savedLinkGroupsRouter` (008). Del istega modula je in se z njim briše.
//
// VRSTNI RED POTI: `/recipe-categories/order` MORA biti registrirana PRED
// `/recipe-categories/:categoryId`, sicer bi usmerjevalnik "order" razumel kot ID kategorije. To
// je bila v modulih 003 in 007 prava napaka v usmerjanju.
//
// Besednjak je ZASEBEN (`userId`, ne `ownerId`): tuja kategorija ne obstaja, zato je tu izolacija
// enostavna in enaka kot v modulih 007/008 — za razliko od samih receptov.
export const recipeCategoriesRouter = Router();

/** V čigavem imenu teče zahteva — enako kot v `router.ts` (FR-062). */
async function actorUserId(req: Request): Promise<string> {
  if (req.auth?.subjectType === 'user') return req.auth.subjectId;
  const ownerId = await resolveAutomationOwnerUserId();
  if (!ownerId) {
    throw notFound(
      'Avtomatizacija ne more ugotoviti, na katerega uporabnika se nanaša — ni podedovanih podatkov niti natanko enega uporabnika.',
    );
  }
  return ownerId;
}

recipeCategoriesRouter.get(
  '/recipe-categories',
  requireScopes(RECIPE_SCOPES.read),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      res.json({ categories: await listCategories(userId) });
    } catch (err) {
      next(err);
    }
  },
);

recipeCategoriesRouter.post(
  '/recipe-categories',
  requireScopes(RECIPE_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = categoryWriteSchema.parse(req.body);
      const userId = await actorUserId(req);
      res.status(201).json(await createCategory(userId, body.name));
    } catch (err) {
      next(err);
    }
  },
);

/** MORA biti PRED `/:categoryId` — glej opombo na vrhu. */
recipeCategoriesRouter.put(
  '/recipe-categories/order',
  requireScopes(RECIPE_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = categoryOrderSchema.parse(req.body);
      const userId = await actorUserId(req);
      await reorderCategories(userId, body.categoryIds);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

recipeCategoriesRouter.patch(
  '/recipe-categories/:categoryId',
  requireScopes(RECIPE_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = categoryWriteSchema.parse(req.body);
      const userId = await actorUserId(req);
      // Odgovor pove, koliko receptov je bilo preimenovanih: preimenovanje kategorije je poseg v
      // več zapisov hkrati in uporabnik mora videti njegov obseg (člen VII).
      res.json(await renameCategory(userId, String(req.params.categoryId), body.name));
    } catch (err) {
      next(err);
    }
  },
);

recipeCategoriesRouter.delete(
  '/recipe-categories/:categoryId',
  requireScopes(RECIPE_SCOPES.write),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      // Recepti OSTANEJO — izgubijo samo to kategorijo (FR-085). Vrnjeno število je edino, kar
      // uporabniku pove, česa se je poseg dotaknil.
      res.json(await deleteCategory(userId, String(req.params.categoryId)));
    } catch (err) {
      next(err);
    }
  },
);
