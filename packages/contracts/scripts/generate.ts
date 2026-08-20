#!/usr/bin/env node
/**
 * Generira TypeScript tipe iz `specs/001-app-shell-dashboard/contracts/openapi.yaml`
 * v `packages/contracts/src/generated/api.d.ts`. Poganja se z
 * `npm run generate:contracts` in v CI kot del gradnje (vrata 3: pogodba je vzdrževana
 * skupaj s kodo).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, '../../../specs/001-app-shell-dashboard/contracts/openapi.yaml');
const outPath = resolve(here, '../src/generated/api.d.ts');

async function main() {
  const ast = await openapiTS(new URL(`file://${specPath}`));
  const output = astToString(ast);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, output, 'utf-8');
  console.log(`Generirano: ${outPath}`);
}

main().catch((err) => {
  console.error('Generiranje tipov je spodletelo:', err);
  process.exit(1);
});
