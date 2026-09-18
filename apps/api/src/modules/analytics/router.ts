import { Router } from 'express';
import { z } from 'zod';
import { requireAdminUser } from './admin-guard.js';
import { getStorageSnapshot } from './services/snapshot-cache.service.js';
import { getUsageSnapshot } from './services/usage-stats.service.js';
import { ALLOWED_WINDOW_DAYS } from './domain/usage-window.js';

// Endpointi pod /api/v1/analytics/* — glej specs/014-admin-analytics/contracts/openapi.yaml.
//
// Ta modul je po zgradbi drugačen od vseh ostalih v tem zaledju in razlika je edino, kar je pri
// njem treba razumeti:
//
//  - NIMA NOBENE SVOJE ZBIRKE. Bere tuje in jih ne spreminja.
//  - NE FILTRIRA po `req.auth.subjectId`. Vsi ostali moduli to počnejo in je to po 004 edina
//    podatkovna izolacija med uporabniki (docs/adding-a-tab.md, korak 7); tukaj je namen
//    nasproten — pogled čez vse. Zato je dovolilnica strožja, ne ohlapnejša (admin-guard.ts).
//  - NE UVOZI NOBENEGA TUJEGA MODELA. Zbirke tujih modulov bere po imenu prek surove povezave
//    (services/storage-usage.service.ts, research.md §2). Uvoz `RecipeImageModel` bi bil kršitev
//    člena I in bi hkrati pomenil, da brisanje modula 013 podre analitiko.
//
// `requireAdminUser()` je nameščen na PREDPONO in ne na posamezno pot: nova pot v tem modulu mora
// biti zaprta že s tem, da je tu — pozabljen vratar na eni poti bi izdal celo namestitev.
export const analyticsRouter = Router();

analyticsRouter.use('/analytics', requireAdminUser());

const freshSchema = z.object({
  // `'false'` se mora brati kot `false`. `z.coerce.boolean()` bi vsak neprazen niz spremenil v
  // `true` in bi `?fresh=false` pomenilo osvežitev — tiho nasprotje tega, kar piše.
  fresh: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

analyticsRouter.get('/analytics/storage', async (req, res, next) => {
  try {
    const { fresh } = freshSchema.parse(req.query);
    res.json(await getStorageSnapshot({ fresh }));
  } catch (err) {
    next(err);
  }
});

const usageQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .optional()
    .default(30)
    .refine((v): v is number => (ALLOWED_WINDOW_DAYS as readonly number[]).includes(v), {
      message: `Dovoljena obdobja so: ${ALLOWED_WINDOW_DAYS.join(', ')}.`,
    }),
});

analyticsRouter.get('/analytics/usage', async (req, res, next) => {
  try {
    const { days } = usageQuerySchema.parse(req.query);
    res.json(await getUsageSnapshot(days));
  } catch (err) {
    next(err);
  }
});
