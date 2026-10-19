import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../errors/problem.js';
import { ADMIN_SCOPE } from './scopes.js';

/**
 * Dovolilnica za administratorske poti skupnih zmogljivosti: prijavljen ČLOVEK z obsegom
 * `admin`; API ključ ne pride skozi, s katerim koli obsegom.
 *
 * Dvignjeno iz `modules/flight-deals/admin-guard.ts` (016, research.md §11), ki je bil sam kopija
 * `modules/analytics/admin-guard.ts` — 015 je dvig že predlagal kot ločen refaktor, tu je nastal,
 * ker jedro skenerjev (`platform/scanner/admin.router.ts`) varuha potrebuje in tretja kopija ne bi
 * bila več vzorec, ampak navada. Modul 014 ostane pri svoji kopiji (ni v obsegu 016).
 *
 * `requireScopes(ADMIN_SCOPE)` bi deloval, ker API ključ obsega `admin` ne more dobiti — a to je
 * zapora, ki stoji na tem, da nekdo DRUGJE ni pozabil. Urniki tipov veljajo za celo namestitev in
 * dopisi gredo vsem uporabnikom; pogoj "klicatelj je prijavljen človek z admin vlogo" je zato
 * zapisan tukaj in se na kodo v drugi mapi ne zanaša.
 *
 * ENAK STATUS ZA OBA PRIMERA ("nisi admin", "si ključ"): razlika klicatelju ne koristi in bi
 * povedala, kako je zapora sestavljena.
 *
 * Prevzem imena (012) tega varuha ne odpre in ne zapre: `scopes` ostanejo adminovi tudi med
 * prevzemom (platform/auth/acting-user.ts). Administracija je lastnost človeka za tipkovnico,
 * zato poti pod njim beležijo `req.actor`, ne `req.auth`.
 */
export function requireAdminUser() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized('Zahtevana je avtentikacija.'));
      return;
    }
    if (req.auth.subjectType !== 'user' || !req.auth.scopes.includes(ADMIN_SCOPE)) {
      next(forbidden('Administracija je na voljo izključno prijavljenemu administratorju.'));
      return;
    }
    next();
  };
}
