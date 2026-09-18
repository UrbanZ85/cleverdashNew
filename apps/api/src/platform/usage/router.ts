import { Router } from 'express';
import { z } from 'zod';
import { requireScopes } from '../auth/scopes.js';
import { forbidden, badRequest } from '../errors/problem.js';
import { isKnownTabId } from './domain/tab-key.js';
import { recordTabView } from './recorder.service.js';

// `POST /usage/views` — glej specs/014-admin-analytics/contracts/openapi.yaml.
//
// Ta pot živi v `platform/` in ne v modulu analitike (research.md §1): ogled zavihka je pojem
// ZAVIHKOV, ne pojem analitike, in mora preživeti odstranitev zavihka, ki te števce prikazuje.
// Isti razlog, zaradi katerega je imenik oseb v `platform/users/` in ne v modulu opravil.
export const usageRouter = Router();

const viewSchema = z.object({
  tabId: z.string().min(1).max(64),
});

/**
 * `requireScopes()` BREZ argumentov pomeni "samo prijavljen" — poimenovanega obsega tu namenoma
 * ni. Vsak uporabnik mora znati zabeležiti SVOJO uporabo; obseg za to bi pomenil vpis v
 * `BASE_USER_SCOPES` in s tem eno stvar več, ki jo je mogoče pozabiti, ne da bi se karkoli
 * pokvarilo vidno. Isti vzorec kot `/devices`.
 */
usageRouter.post('/usage/views', requireScopes(), async (req, res, next) => {
  try {
    // `req.actor`, NE `req.auth` — in to je edina odločitev v tej datoteki, ki jo je vredno
    // prebrati dvakrat.
    //
    // Za vsak drug modul velja obratno (docs/adding-a-tab.md, korak 7): filtriraj po `req.auth`,
    // ki je med prevzemom imena (012) zamenjan, in prevzem imena bo delal sam od sebe. Tu je
    // namen nasproten. Zapis pripada FIZIČNI OSEBI za tipkovnico, tako kot seje in naprave za
    // obvestila. Če bi administratorjevo brskanje v tujem imenu štelo izbrani osebi, bi napihnilo
    // prav tiste številke, ki jih administrator na tem zaslonu bere — meritev bi merila svojega
    // opazovalca.
    const actor = req.actor!;
    if (actor.subjectType !== 'user') {
      next(forbidden('Ogled zaslona lahko zabeleži samo prijavljen uporabnik, ne API ključ.'));
      return;
    }

    const body = viewSchema.parse(req.body);
    if (!isKnownTabId(body.tabId)) {
      // Zavrnjeno po REGISTRU in ne po obliki niza (FR-031): zbirka, v katero lahko klicatelj
      // vpiše poljuben ključ, ni telemetrija, ampak odprt predal — neomejeno mnogo vrstic na
      // osebo na dan in lestvica, polna izmišljenih imen.
      next(badRequest(`Neznan zavihek: ${body.tabId}.`));
      return;
    }

    const counted = await recordTabView(actor.subjectId, body.tabId);
    res.status(200).json({ counted });
  } catch (err) {
    next(err);
  }
});
