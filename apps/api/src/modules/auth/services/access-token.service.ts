import type { NextFunction, Request, Response } from 'express';
import { introspectAccessToken } from '../../../platform/keycloak/introspection-cache.js';
import { mapRolesToAccess } from '../../../platform/keycloak/role-mapping.js';
import { UserModel } from '../models/user.model.js';
import { ProblemError, unauthorized } from '../../../platform/errors/problem.js';
import type { Env } from '../../../platform/config/env.js';
import type { AuthContext } from '../../../platform/auth/scopes.js';

// FR-005/FR-006/FR-007, research.md §4: v nasprotju s prejšnjim, ki je dostopni žeton
// preveril samo lokalno (podpis + `exp`), ta različica pri VSAKEM preverjanju (znotraj
// kratkega TTL predpomnjenega, glej introspection-cache.ts) vpraša Keycloak, ali je žeton
// še aktiven — odvzeta vloga ali onemogočen račun se tako pozna praktično takoj, ne šele ob
// izteku žetona. `scopes` se prav tako VEDNO znova izpelje iz trenutnega odgovora
// introspekcije (FR-011/FR-012), ne bere shranjene vrednosti na `User` dokumentu.

type AccessTokenEnv = Pick<
  Env,
  | 'KEYCLOAK_ISSUER_URL'
  | 'KEYCLOAK_CLIENT_ID'
  | 'KEYCLOAK_CLIENT_SECRET'
  | 'KEYCLOAK_INTROSPECTION_CACHE_SECONDS'
  | 'KEYCLOAK_ADMIN_ROLE'
  | 'KEYCLOAK_USER_ROLE'
  | 'NODE_ENV'
>;

/** Preveri dostopni žeton pri Keycloaku (živo, s kratkim TTL predpomnjenjem) in sestavi
 * `AuthContext`. Vrže `unauthorized`, če žeton ni aktiven, ali če pripadajočega uporabnika v
 * CleverDashu (še) ni — ta MORA nastati prek `/auth/callback` (user-provisioning.service.ts),
 * preden je karkoli drugega dosegljivo. */
export async function verifyAccessToken(env: AccessTokenEnv, token: string): Promise<AuthContext> {
  const introspection = await introspectAccessToken(env, token);
  if (!introspection.active || !introspection.subject) {
    throw unauthorized('Neveljaven, potekel ali preklican dostopni žeton.');
  }

  const { hasAccess, scopes } = mapRolesToAccess(introspection.roles, env.KEYCLOAK_ADMIN_ROLE, env.KEYCLOAK_USER_ROLE);
  if (!hasAccess) {
    // FR-006: vloga/skupina je bila odvzeta med aktivno sejo — dostop se prekine praktično
    // takoj (naslednja zahteva po izteku introspekcijskega predpomnilnika), ne šele ob
    // izteku žetona.
    throw unauthorized('Nimate dostopa do te aplikacije.');
  }

  const user = await UserModel.findOne({ keycloakSubject: introspection.subject });
  if (!user) {
    throw unauthorized('Uporabnik ne obstaja v CleverDashu.');
  }

  return {
    subjectType: 'user',
    subjectId: String(user._id),
    scopes,
  };
}

/** Bere `Authorization: Bearer <token>`, preveri veljavnost pri Keycloaku in nastavi
 * `req.auth`. Ne zavrne zahteve brez glave — pusti odločitev naslednjemu vratarju
 * (apiKeyGuard je mounted vzporedno; requireScopes na koncu terja, da je req.auth sploh
 * nastavljen). */
export function accessTokenGuard(env: AccessTokenEnv) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      next();
      return;
    }
    const token = header.slice('Bearer '.length);
    verifyAccessToken(env, token)
      .then((auth) => {
        req.auth = auth;
        next();
      })
      .catch((err: unknown) => {
        // Sporočilo iz `verifyAccessToken` se OHRANI. Prej je vsak neuspeh — potekel žeton,
        // odvzeta vloga, neobstoječ uporabnik, nedosegljiv Keycloak — postal isto besedilo
        // "Neveljaven ali potekel dostopni žeton", zato iz dnevnika ni bilo mogoče ločiti
        // rednega izteka od resničnega problema (člen VII: sistem mora povedati, KAJ je
        // narobe). Nepričakovana napaka ostane 401, ker je brez preverjenega žetona ni
        // mogoče obravnavati drugače.
        next(err instanceof ProblemError ? err : unauthorized('Dostopnega žetona ni bilo mogoče preveriti.'));
      });
  };
}
