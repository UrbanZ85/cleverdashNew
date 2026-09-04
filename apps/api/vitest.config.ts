import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // 004: ponarejen Keycloak (tests/setup/fake-keycloak.ts) za VSAKO testno datoteko, preden
    // teče njen beforeAll — glej tests/setup/keycloak-global.ts. Velja tudi za datoteke, ki
    // ga ne potrebujejo (čisto domenski enotski testi); strošek je zanemarljiv (lokalen
    // Express strežnik brez I/O), izognitev bi zahtevala ločeno Vitest "projekt" konfiguracijo
    // samo za pogodbene teste — ni vredno dodatne kompleksnosti za ta obseg.
    setupFiles: ['./tests/setup/keycloak-global.ts'],
    // Testi, ki uporabljajo mongodb-memory-server, ob prvem zagonu prenesejo binarko
    // MongoDB (~600 MB); privzetih 10 s za hook zato ne zadošča. Po prvem zagonu je
    // binarka predpomnjena in naslednji zagoni so hitri.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Vsaka testna datoteka, ki uporablja startTestDb(), zažene svoj v-pomnilniški mongod.
    // Z večanjem števila datotek vzporedno zagnani procesi tekmujejo za CPE/pomnilnik in
    // začnejo časovno potekati (ne gre za prave napake — vsi neuspehi so na 30 s). Serijsko
    // izvajanje je počasnejše, a zanesljivo; enak učinek kot CLI `--no-file-parallelism`.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
