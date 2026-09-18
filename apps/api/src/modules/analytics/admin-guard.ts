import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../../platform/errors/problem.js';
import { ADMIN_SCOPE } from '../../platform/auth/scopes.js';

/**
 * Dovolilnica za cel modul analitike (FR-002, FR-003).
 *
 * ZAKAJ NE `requireScopes(ADMIN_SCOPE)`, KI ŽE OBSTAJA:
 *
 * `requireScopes` bi za ta namen deloval — API ključ obsega `admin` ne more dobiti, ker mu ga
 * `platform/apikeys/router.ts` ne dovoli dodeliti. Toda to je zapora, ki stoji na tem, da nekdo
 * DRUGJE ni pozabil. Ta modul ne vrača enega zapisa svojega lastnika, ampak sliko cele
 * namestitve — koliko kdo hrani in kdaj se kdo prijavlja. Pogoj "klicatelj je človek" je zato
 * zapisan posebej in se na kodo v drugi mapi ne zanaša.
 *
 * Isti razlog in ista ubeseditev sta v `platform/auth/acting-user.ts`, kjer prevzem imena prav
 * tako izrecno zavrne API ključ, čeprav ta admin obsega itak ne more imeti.
 *
 * ENAK STATUS ZA OBA PRIMERA: "nisi admin" in "si ključ" vrneta `403` z istim sporočilom.
 * Razlika klicatelju ne koristi in bi povedala, kako je zapora sestavljena.
 *
 * Kaj ta vratar NE počne: ne dotakne se `req.auth`. Prevzem imena (012) je do tu že tekel in je
 * `req.auth` morda zamenjal — za analitiko je to brez učinka, ker ne filtrira po lastniku
 * podatkov, ampak bere čez vse. `scopes` ostanejo adminovi tudi med prevzemom imena
 * (acting-user.ts), zato prevzem imena dostopa do tega modula niti ne odpre niti ne zapre.
 */
export function requireAdminUser() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized('Zahtevana je avtentikacija.'));
      return;
    }
    if (req.auth.subjectType !== 'user' || !req.auth.scopes.includes(ADMIN_SCOPE)) {
      next(forbidden('Analitika je na voljo izključno prijavljenemu administratorju.'));
      return;
    }
    next();
  };
}
