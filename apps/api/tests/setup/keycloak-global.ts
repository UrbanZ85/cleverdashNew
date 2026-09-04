import { startFakeKeycloak, type FakeKeycloak } from './fake-keycloak.js';

// Vitest `setupFiles` (vitest.config.ts) zažene to datoteko za VSAKO testno datoteko,
// preden se zažene katerikoli njen `beforeAll`. Vrhnji-nivojski `await` pomeni, da je
// `fakeKeycloakForTests` do takrat, ko katerakoli testna datoteka prebere ta modul,
// zagotovo že razrešen, pravi, poslušajoč HTTP strežnik — glej fake-keycloak.ts.
//
// `test-env.ts` privzeto uporabi njegov naslov za `KEYCLOAK_ISSUER_URL`, zato noben od
// ~40 klicnih mest `setTestEnv()` po repozitoriju (nekateri kličejo večkrat sredi
// posameznega testa, npr. actions.spec.ts, idempotency.spec.ts) ne potrebuje sprememb.
export const fakeKeycloakForTests: FakeKeycloak = await startFakeKeycloak();
