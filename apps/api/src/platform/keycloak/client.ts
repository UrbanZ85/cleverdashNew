import * as client from 'openid-client';
import type { Env } from '../config/env.js';

// research.md §1: SPA se s Keycloakom nikoli ne pogovarja neposredno (backend-for-frontend) —
// to je EDINO mesto, ki drži konfiguracijo zaupanja vrednega (confidential) OIDC odjemalca.
// "Issuer discovery" se izvede enkrat in predpomni v procesu — enak vzorec kot `loadEnv()`
// (platform/config/env.ts): drag, ker gre za povezavo z zunanjim sistemom ob zagonu, ne za
// nekaj, kar bi se smelo tiho ponoviti na vsako zahtevo.

type KeycloakEnv = Pick<Env, 'KEYCLOAK_ISSUER_URL' | 'KEYCLOAK_CLIENT_ID' | 'KEYCLOAK_CLIENT_SECRET' | 'NODE_ENV'>;

let cached: client.Configuration | undefined;
let inFlight: Promise<client.Configuration> | undefined;

/** Razred napake, po katerem klicatelj loči "ponudnika prijave ni bilo mogoče doseči" od
 * napake v svoji kodi. Brez tega je vsak izpad Keycloaka pri prijavi gola napaka 500 brez
 * pojasnila — natanko to je uporabnik videl, ko se je Keycloak ravno prebujal. */
export class KeycloakUnreachableError extends Error {
  constructor(cause: unknown) {
    super(`Ponudnika prijave ni bilo mogoče doseči: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'KeycloakUnreachableError';
    this.cause = cause;
  }
}

export async function getKeycloakConfig(env: KeycloakEnv): Promise<client.Configuration> {
  if (cached) return cached;
  // Sočasni klicatelji si delijo ISTO poizvedbo. Brez tega je vsaka zahteva ob hladnem
  // zagonu (nadzorna plošča naloži več ploščic hkrati) svoja "discovery" zahteva na
  // Keycloak — člen VIII velja tudi za lastnega ponudnika prijave.
  inFlight ??= discover(env).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

async function discover(env: KeycloakEnv): Promise<client.Configuration> {
  try {
    cached = await runDiscovery(env);
    return cached;
  } catch (err) {
    // Predpomnilnik ostane prazen, da naslednji poskus ni obsojen na isto napako.
    throw new KeycloakUnreachableError(err);
  }
}

async function runDiscovery(env: KeycloakEnv): Promise<client.Configuration> {
  return client.discovery(
    new URL(env.KEYCLOAK_ISSUER_URL),
    env.KEYCLOAK_CLIENT_ID,
    env.KEYCLOAK_CLIENT_SECRET,
    undefined,
    {
      // `openid-client` privzeto zavrne http:// izdajatelja (že za samo "discovery" zahtevo)
      // — pravilno za produkcijo (člen II: izključno https://app.si), a bi onemogočilo
      // ponarejen Keycloak v testih (tests/setup/fake-keycloak.ts teče na navadnem
      // http://127.0.0.1). V produkciji je KEYCLOAK_ISSUER_URL vedno https:// (operativna
      // zahteva, ne preverjena tu), zato ta izjema tam nima učinka.
      execute: env.NODE_ENV === 'production' ? [] : [client.allowInsecureRequests],
    },
  );
}

/** Samo za teste: pobriše predpomnjeno konfiguracijo (fake-keycloak.ts teče na drugih vratih
 * v vsakem testnem procesu, glej tests/setup/fake-keycloak.ts). */
export function resetKeycloakConfigForTests(): void {
  cached = undefined;
  inFlight = undefined;
}
