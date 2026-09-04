import { createHash } from 'node:crypto';
import * as client from 'openid-client';
import { getKeycloakConfig } from './client.js';
import type { Env } from '../config/env.js';

// research.md §4: razrešitev napetosti med FR-006/FR-007 (živo preverjanje seje) in členom
// VIII (vljudnost/TTL do zunanjih virov). V NASPROTJU z `platform/cache` (`getOrRefresh`), ki
// je namenoma fail-OPEN (ob napaki vrne zadnji znani podatek — pravilno za vreme/radar), MORA
// biti to fail-CLOSED: neuspel klic Keycloaka se vrže naprej, nikoli ne vrne stare "še vedno
// veljavno" odločitve. Zato je to lasten, preprost predpomnilnik v pomnilniku procesa, ne
// ponovna uporaba ExternalCache — glej popravek v research.md §4.

export interface IntrospectionResult {
  active: boolean;
  subject: string | null;
  /** Realm vloge (`realm_access.roles`) in skupine (`groups`) — glej role-mapping.ts. */
  roles: string[];
}

interface CacheEntry {
  result: IntrospectionResult;
  expiresAt: number;
}

type KeycloakEnv = Pick<
  Env,
  | 'KEYCLOAK_ISSUER_URL'
  | 'KEYCLOAK_CLIENT_ID'
  | 'KEYCLOAK_CLIENT_SECRET'
  | 'KEYCLOAK_INTROSPECTION_CACHE_SECONDS'
  | 'NODE_ENV'
>;

const cache = new Map<string, CacheEntry>();

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function extractRoles(introspection: Record<string, unknown>): string[] {
  const realmAccess = introspection.realm_access as { roles?: unknown } | undefined;
  const roles = Array.isArray(realmAccess?.roles) ? (realmAccess.roles as string[]) : [];
  const groups = Array.isArray(introspection.groups) ? (introspection.groups as string[]) : [];
  return [...roles, ...groups];
}

/** Preveri veljavnost dostopnega žetona pri Keycloaku (RFC 7662), s kratkim TTL
 * predpomnjenjem po žetonu. Napaka introspekcije (Keycloak nedosegljiv ipd.) se vrže naprej —
 * klicatelj (access-token.service.ts) jo MORA prevesti v zavrnitev dostopa (FR-007), ne v
 * tiho nadaljevanje s staro odločitvijo. */
export async function introspectAccessToken(env: KeycloakEnv, accessToken: string): Promise<IntrospectionResult> {
  const key = hashToken(accessToken);
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.result;
  }

  const config = await getKeycloakConfig(env);
  const introspection = (await client.tokenIntrospection(config, accessToken)) as unknown as Record<string, unknown>;

  const result: IntrospectionResult = {
    active: introspection.active === true,
    subject: typeof introspection.sub === 'string' ? introspection.sub : null,
    roles: extractRoles(introspection),
  };

  cache.set(key, { result, expiresAt: now + env.KEYCLOAK_INTROSPECTION_CACHE_SECONDS * 1000 });
  return result;
}

/** Samo za teste: pobriše predpomnilnik med testnimi primeri. */
export function resetIntrospectionCacheForTests(): void {
  cache.clear();
}
