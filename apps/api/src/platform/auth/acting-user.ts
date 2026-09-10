import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { UserModel } from '../../modules/auth/models/user.model.js';
import { forbidden, notFound } from '../errors/problem.js';
import { ADMIN_SCOPE } from './scopes.js';

/**
 * 012 — administrator dela v imenu drugega uporabnika ("prevzem imena").
 *
 * ZAKAJ TAKO, IN NE Z `?userId=` NA VSAKI POTI:
 *
 * Vsak modul svoje podatke omejuje z `userId: req.auth!.subjectId` — po 004 je to EDINA
 * podatkovna izolacija med uporabniki (glej platform/keycloak/role-mapping.ts). Takšnih mest
 * je okrog devetdeset v desetih modulih. Dodati vsakemu od njih neobvezen parameter bi
 * pomenilo devetdeset novih priložnosti, da ga kdo pozabi preveriti — in vsaka pozabljena bi
 * bila luknja, skozi katero navaden uporabnik bere tuje podatke.
 *
 * Zato prevzem imena obstaja na ENEM mestu: ta middleware ZAMENJA `req.auth`, preden zahteva
 * doseže katerikoli modul. Modulom ni treba vedeti, da prevzem imena obstaja, in nov modul ga
 * dobi zastonj — dokler filtrira po `req.auth.subjectId`, kar mu člen o izolaciji tako ali
 * tako nalaga. Resnični klicatelj se ohrani v `req.actor` (platform/auth/scopes.ts).
 *
 * DOVOLILNICA: izključno obseg `admin`, torej Keycloakova vloga `KEYCLOAK_ADMIN_ROLE`. Ta se
 * izpelje pri VSAKI zahtevi iz žive introspekcije žetona (access-token.service.ts), ne iz
 * shranjenega polja — odvzeta vloga prevzem imena ustavi v nekaj sekundah.
 *
 * API KLJUČ tega ne sme: člen III ustave pravi, da API ključ SAM po sebi ni admin, in
 * avtomatizacija svojega lastnika že ima (platform/auth/automation-owner.ts). Ključ z
 * obsegom `admin` sicer ne more nastati (platform/apikeys/router.ts ga ne dovoli dodeliti),
 * a se na to tu namenoma ne zanašamo — pogoj je zapisan posebej.
 */
export const ACTING_USER_HEADER = 'X-Acting-User';

/**
 * Poti, na katerih glava NE zamenja `req.auth` in nikoli ne povzroči napake.
 *
 * Odjemalec glavo pošilja na vsako zahtevo (en prestreznik, brez seznama izjem), `/auth/*` pa
 * govori o klicatelju samem in ne o lastniku podatkov: seje, odjava in `/auth/me`. Zamenjava
 * bi tam pomenila, da admin s prevzemom imena vidi in preklicuje TUJE seje.
 *
 * Da tu nobena zavrnitev ne pride ven, je bistveno in ne priročno. `/auth/me` je edina pot, po
 * kateri odjemalec izve, ali je njegova shranjena izbira še veljavna. Če bi odvzeta admin
 * vloga ali izbrisan izbrani uporabnik vrnila 403/404 ŽE TU, bi tudi `/auth/me` odgovoril z
 * napako, odjemalec ne bi nikoli izvedel, da mora izbiro pozabiti, in aplikacija bi ostala
 * mrtva do ročnega brisanja shrambe v brskalniku. Namesto tega `/auth/me` v takem primeru
 * pošteno vrne `actingAs: null` in web izbiro počisti sam (CurrentUserService).
 */
const NO_EFFECT_PREFIXES = ['/auth/'];

/**
 * Nastavi `req.actor` (vedno, kadar je zahteva avtenticirana) in po potrebi zamenja `req.auth`
 * z izbranim uporabnikom.
 *
 * Ne zavrne nobene zahteve BREZ glave — javne poti (`/share/*`, `/drop/*`) in navadni
 * uporabniki gredo skozi nespremenjeni.
 */
export function actingUserMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // `req.actor` že nastavljen pomeni, da je ta middleware za TO zahtevo že tekel. Zgodi se
    // to, kadar je `apiV1Router` (platform/http/router.ts) modulna singletonka in `createApp()`
    // steče večkrat v istem procesu — v testih, ki več aplikacij ustvarijo zapored, se sklad
    // middlewarov naloži večkrat. Brez te varovalke bi drugi prehod za resničnega klicatelja
    // vzel `req.auth`, ki ga je prvi ŽE ZAMENJAL, in `req.actor` bi postal izbrani uporabnik
    // namesto admina — `/auth/me` bi vrnil napačno osebo, dnevnik pa bi izgubil sled o tem,
    // kdo je zares pisal.
    if (!req.auth || req.actor) {
      next();
      return;
    }
    req.actor = { ...req.auth, actingAsUserId: null };

    const requested = req.header(ACTING_USER_HEADER)?.trim();
    if (!requested) {
      next();
      return;
    }

    const noEffect = NO_EFFECT_PREFIXES.some((prefix) => req.path.startsWith(prefix));
    /** Na `/auth/*` je vsaka nepravilnost glave samo "prevzema imena ni", ne napaka. */
    const reject = (problem: ReturnType<typeof forbidden>) => {
      if (noEffect) next();
      else next(problem);
    };

    if (req.auth.subjectType !== 'user') {
      reject(forbidden(`Glava ${ACTING_USER_HEADER} je na voljo samo prijavljenemu uporabniku, ne API ključu.`));
      return;
    }
    if (!req.auth.scopes.includes(ADMIN_SCOPE)) {
      reject(forbidden(`Za delo v imenu drugega uporabnika je potreben obseg ${ADMIN_SCOPE}.`));
      return;
    }

    // Prevzem SVOJEGA imena ni napaka, samo nima učinka: odjemalec ne rabi posebnega primera,
    // ko admin v izbirniku izbere sebe.
    if (requested === req.auth.subjectId) {
      next();
      return;
    }

    // 404 in ne 400 tudi pri sintaktično nemogočem identifikatorju: za odjemalca je izid isti —
    // shranjena izbira ne velja in jo je treba pozabiti.
    if (!Types.ObjectId.isValid(requested)) {
      reject(notFound('Izbrani uporabnik ne obstaja.'));
      return;
    }
    const target = await UserModel.findById(requested).select('_id').lean();
    if (!target) {
      reject(notFound('Izbrani uporabnik ne obstaja.'));
      return;
    }

    const targetId = String(target._id);
    req.actor.actingAsUserId = targetId;

    if (noEffect) {
      next();
      return;
    }

    // Sama zamenjava. `scopes` OSTANEJO adminovi in se ne izpeljejo iz izbranega uporabnika:
    // dovolilnico nosi človek za tipkovnico, ne podatki, ki jih gleda. Nasprotna izbira bi
    // pomenila, da admin z prevzemom tujega imena izgubi pravico, da ga sploh prevzame.
    req.auth = { subjectType: 'user', subjectId: targetId, scopes: req.auth.scopes };

    // Vsak nadaljnji dnevniški zapis te zahteve nosi oboje — brez tega bi bil zapis o
    // spremembi tujih podatkov videti kot uporabnikov lasten (člen VII).
    req.log = req.log.child({ actorUserId: req.actor.subjectId, actingAsUserId: targetId });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.log.info(
        {
          event: 'auth.acting_as',
          actorUserId: req.actor.subjectId,
          actingAsUserId: targetId,
          method: req.method,
          path: req.path,
        },
        'Administrator spreminja podatke v imenu drugega uporabnika',
      );
    }
    next();
  };
}
