// @ts-check
import { posix as pathPosix } from 'node:path';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

// Člen I ustave: moduli se ne kličejo med sabo neposredno — samo prek platform/ oz. core/.
//
// Lastno, majhno pravilo namesto tujega vtičnika. Dva poskusa pred tem so odpovedali iz
// istega razloga v različnih oblikah: `no-restricted-imports` s `patterns` ujema DOBESEDNI
// NIZ specifikatorja uvoza (`'../dashboard/router.js'`), ki nikoli ne vsebuje besede
// "modules"/"features" — pravilo torej ni nikoli ničesar prestreglo, kar je pokazal
// apps/api/tests/unit/module-boundary.spec.ts. Zamenjava z `eslint-plugin-import`
// (`no-restricted-paths`, ki poti dejansko razreši) je bila pravilna zamisel, a njen
// razreševalec v tej flat-config postavitvi ni deloval (preverjeno neposredno: pravilo se
// ni sprožilo niti za pravo datoteko na disku). Namesto nadaljnjega ugibanja o vzroku v
// tuji odvisnosti to pravilo samo naredi tisto, kar potrebujemo: vzame pot uvažajoče
// datoteke in specifikator, ju razreši kot navadna niza (path.posix, brez dostopa do
// diska) in primerja imeni modulov — ki ju prebere iz same poti, ne iz vnaprej
// vzdrževanega seznama. Nov modul ali zavihek dobi zaščito samodejno, ob prvi datoteki v
// svoji mapi; nikjer v tej datoteki ni seznama, ki bi ga bilo treba dopolniti.
/** @type {import('eslint').Rule.RuleModule} */
const moduleBoundaryRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Prepove uvoz med sosednjima moduloma/zavihkoma (člen I ustave).' },
    schema: [],
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(/\\/g, '/');

    /** @param {string} p */
    function moduleOf(p) {
      const m = /\/apps\/api\/src\/modules\/([^/]+)\//.exec(p) ?? /\/apps\/web\/src\/app\/features\/([^/]+)\//.exec(p);
      return m ? m[1] : null;
    }

    const ownModule = moduleOf(filename);
    if (!ownModule) return {};

    return {
      ImportDeclaration(node) {
        const spec = node.source.value;
        if (typeof spec !== 'string' || !spec.startsWith('.')) return; // samo relativni uvozi
        const resolved = pathPosix.normalize(pathPosix.join(pathPosix.dirname(filename), spec));
        const importedModule = moduleOf(resolved);
        if (importedModule && importedModule !== ownModule) {
          context.report({
            node,
            message: `Modul "${ownModule}" ne sme uvažati neposredno iz modula "${importedModule}" (člen I) — pojdi prek platform/, domain/, core/ ali shared/.`,
          });
        }
      },
    };
  },
};

// Člen V.4 ustave: "danes" se nikoli ne računa prek UTC. Ta niz je bil vzrok napačnega
// koledarskega dne v starem sistemu (glej docs/legacy-engine.md §4 in research.md §11).
const noUtcCalendarDay = {
  selector:
    "CallExpression[callee.property.name='split'][callee.object.callee.property.name='toISOString']",
  message:
    "toISOString().split('T')[0] je prepovedan (člen V.4 ustave) — uporabi Europe/Ljubljana, ne UTC.",
};

export default [
  js.configs.recommended,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/www/**',
      '**/.angular/**',
      '**/android/**',
      '**/ios/**',
      '**/coverage/**',
      'packages/contracts/src/generated/**',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-restricted-syntax': ['error', noUtcCalendarDay],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // TypeScript že preverja neobstoječe identifikatorje (in ambientne tipe, npr.
      // `NodeJS.ProcessEnv` iz @types/node, ki niso pravi izvajalni globali). `no-undef`
      // na TS datotekah samo podvaja to preverjanje in daje lažne pozitivne rezultate.
      'no-undef': 'off',
    },
  },
  {
    // Strežnik, root-level orodni config in generator tečejo pod Node.js.
    files: [
      'apps/api/**/*.ts',
      // Gradbene skripte modula (kopiranje sredstev v dist) so navaden Node ESM, ne TypeScript.
      'apps/api/scripts/**/*.mjs',
      '*.config.{js,ts}',
      'apps/*/*.config.{js,ts}',
      'apps/*/capacitor.config.ts',
      'packages/contracts/**/*.ts',
      'eslint.config.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Odjemalec teče v brskalniku (in v Capacitor WebView, ki je isto okolje).
    files: ['apps/web/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Skripta za inicializacijo Monga teče v `mongosh`, ne v Node.js ali brskalniku — `db`
    // je globalna spremenljivka lupine, ne uvožen modul.
    files: ['infra/mongo-init/*.js'],
    languageOptions: { globals: { ...globals.node, db: 'writable' } },
  },
  {
    // Vrata 1: brez `any` v domenski plasti (apps/api/src/modules/** in platform/**).
    files: ['apps/api/src/modules/**/*.ts', 'apps/api/src/platform/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Člen I: uvoz med moduli (API) in med zavihki (web) je prepovedan, preverjeno na
  // razrešeni poti specifikatorja, ne na njegovem dobesednem nizu — glej opombo pri pravilu.
  {
    files: ['apps/api/src/modules/**/*.ts', 'apps/web/src/app/features/**/*.ts'],
    plugins: { cleverdash: { rules: { 'module-boundary': moduleBoundaryRule } } },
    rules: {
      'cleverdash/module-boundary': 'error',
    },
  },
];
