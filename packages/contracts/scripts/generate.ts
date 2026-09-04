#!/usr/bin/env node
/**
 * Generira TypeScript tipe iz pogodb vseh funkcionalnosti:
 * - `specs/001-app-shell-dashboard/contracts/openapi.yaml` → `src/generated/api.d.ts`
 * - `specs/002-time-tracking/contracts/openapi.yaml` → `src/generated/time-tracking.d.ts`
 * - `specs/003-cameras/contracts/openapi.yaml` → `src/generated/cameras.d.ts`
 * - `specs/005-profile-plugins/contracts/openapi.yaml` → `src/generated/profile-plugins.d.ts`
 * - `specs/006-timesheet/contracts/openapi.yaml` → `src/generated/timesheet.d.ts`
 * - `specs/007-notes/contracts/openapi.yaml` → `src/generated/notes.d.ts`
 * - `specs/009-file-sharing/contracts/openapi.yaml` → `src/generated/file-sharing.d.ts`
 *
 * 004 (Keycloak SSO) svoje pogodbe nima: spremenil je poti `/auth/*`, ki so last 001,
 * zato je bila posodobljena tam.
 *
 * Ločene datoteke, ne ena združena pogodba — vsaka funkcionalnost je lastnik svoje (glej
 * opombo v 002-ovi pogodbi: `/devices` in `/health` iz 001 se v 002 samo RAZŠIRIJO, ne
 * podvojijo; enako 003 za `/settings`). Poganja se z `npm run generate:contracts` in v CI
 * kot del gradnje (vrata 3).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const here = dirname(fileURLToPath(import.meta.url));

const targets = [
  {
    spec: resolve(here, '../../../specs/001-app-shell-dashboard/contracts/openapi.yaml'),
    out: resolve(here, '../src/generated/api.d.ts'),
  },
  {
    spec: resolve(here, '../../../specs/002-time-tracking/contracts/openapi.yaml'),
    out: resolve(here, '../src/generated/time-tracking.d.ts'),
  },
  {
    spec: resolve(here, '../../../specs/003-cameras/contracts/openapi.yaml'),
    out: resolve(here, '../src/generated/cameras.d.ts'),
  },
  {
    spec: resolve(here, '../../../specs/005-profile-plugins/contracts/openapi.yaml'),
    out: resolve(here, '../src/generated/profile-plugins.d.ts'),
  },
  {
    spec: resolve(here, '../../../specs/006-timesheet/contracts/openapi.yaml'),
    out: resolve(here, '../src/generated/timesheet.d.ts'),
  },
  {
    spec: resolve(here, '../../../specs/007-notes/contracts/openapi.yaml'),
    out: resolve(here, '../src/generated/notes.d.ts'),
  },
  {
    spec: resolve(here, '../../../specs/009-file-sharing/contracts/openapi.yaml'),
    out: resolve(here, '../src/generated/file-sharing.d.ts'),
  },
  {
    spec: resolve(here, '../../../specs/010-todos/contracts/openapi.yaml'),
    out: resolve(here, '../src/generated/todos.d.ts'),
  },
];

async function generateOne(specPath: string, outPath: string) {
  const ast = await openapiTS(new URL(`file://${specPath}`));
  const output = astToString(ast);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, output, 'utf-8');
  console.log(`Generirano: ${outPath}`);
}

async function main() {
  for (const { spec, out } of targets) {
    await generateOne(spec, out);
  }
}

main().catch((err) => {
  console.error('Generiranje tipov je spodletelo:', err);
  process.exit(1);
});
