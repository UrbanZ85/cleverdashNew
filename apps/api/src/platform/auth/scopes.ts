import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../errors/problem.js';

/** Kdo je izvedel zahtevo: prijavljen uporabnik (dostopni JWT) ali avtomatizacija
 * (`X-API-Key`). Veljaven identifikator sam po sebi NE pomeni administratorskih pravic —
 * FR-013, člen III. Vse avtorizacijske odločitve gredo prek `scopes`. */
// 004: prejšnji `familyId?` je odpadel. Šlo je za `fam` claim na CleverDashevem LASTNEM
// dostopnem JWT-ju; ta je zdaj Keycloakov lasten (relay, glej access-token.service.ts), na
// katerega ne moremo pripeti svojega claima. Katera `KeycloakSession` pripada trenutni
// napravi, se zdaj bere neposredno iz httpOnly sejnega piškotka (web) oz. `sessionReference`
// (Android) v auth/router.ts — samo tam, kjer je resnično potrebno (odjava, obnovitev,
// seznam sej), ne kot del vsakega `AuthContext`.
export interface AuthContext {
  subjectType: 'user' | 'apiKey';
  subjectId: string;
  scopes: string[];
}

/**
 * Kdo je zahtevo RESNIČNO poslal — v nasprotju z `req.auth`, ki po 012 pove, V ČIGAVEM IMENU
 * teče (glej platform/auth/acting-user.ts).
 *
 * Brez prevzema imena sta oba konteksta enaka. Ko admin prevzame ime drugega uporabnika, se
 * `req.auth.subjectId` zamenja z izbranim uporabnikom — s tem vsi moduli naenkrat berejo in
 * pišejo njegove podatke, brez ene same spremembe v usmerjevalnikih — `req.actor` pa ostane
 * admin sam.
 *
 * Uporabi `req.actor` in NE `req.auth` povsod, kjer gre za fizično osebo ali napravo za
 * tipkovnico, ne za lastnika podatkov: seje (`/auth/sessions`), odjava, `/auth/me` in
 * registracija naprav za obvestila (`/devices`). Vse drugo mora ostati na `req.auth`, sicer
 * prevzem imena tam ne bo deloval.
 */
export interface ActorContext {
  subjectType: 'user' | 'apiKey';
  subjectId: string;
  scopes: string[];
  /** Identifikator uporabnika, katerega ime je prevzeto; `null` = klicatelj dela v svojem imenu. */
  actingAsUserId: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    actor?: ActorContext;
  }
}

/** `admin` je edini poseben obseg: ima ga izključno bootstrap uporabnik (človek), nikoli
 * API ključ (`platform/apikeys/router.ts` ga ne dovoli dodeliti). Pomeni "vsi obsegi" —
 * brez tega bi vsak nov, poimenovan obseg (002: `state:read`, `action:write` ...) zahteval
 * ročno dopolnitev seznama scopes.ts, ki jo je lahko pozabiti, in bi edinega uporabnika
 * sistema po nepotrebnem izklopil iz lastnih endpointov (FR-013 govori o API ključu, ki
 * SAM po sebi ni admin — ne o tem, da bi moral biti človek eksplicitno naveden povsod). */
export const ADMIN_SCOPE = 'admin';

/** Middleware tovarna: zahteva, da ima `req.auth` vse navedene obsege (ali `admin`).
 * Uporabljena za JWT in za API ključe enako — obe poti nastavita `req.auth` in se tu
 * srečata. */
export function requireScopes(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized('Zahtevana je avtentikacija.'));
      return;
    }
    if (req.auth.scopes.includes(ADMIN_SCOPE)) {
      next();
      return;
    }
    const missing = required.filter((s) => !req.auth!.scopes.includes(s));
    if (missing.length > 0) {
      next(forbidden(`Manjkajo obsegi: ${missing.join(', ')}.`));
      return;
    }
    next();
  };
}
