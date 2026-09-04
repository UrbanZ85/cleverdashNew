#!/usr/bin/env node
/**
 * Prekopira `src/**\/assets/` v `dist/**\/assets/` po prevajanju.
 *
 * `tsc` prenese samo `.ts` datoteke, `infra/api.Dockerfile` pa v končno sliko kopira SAMO
 * `dist` — brez tega koraka bi modul, ki s seboj nosi sredstvo (prvi tak je `timesheet` s
 * predlogo `edc-template.xlsx`), v vsebniku ostal brez njega in bi padel šele ob prvem
 * klicu. Korak je splošen: nov modul dobi svojo mapo `assets/` in nič tu se ne spremeni.
 */
import { cp, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(apiRoot, 'src');
const distRoot = join(apiRoot, 'dist');

/** @param {string} dir */
async function findAssetDirs(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.name === 'assets') {
      found.push(full);
      continue; // mape `assets` se ne pregleduje naprej — kopira se v celoti
    }
    found.push(...(await findAssetDirs(full)));
  }
  return found;
}

const dirs = await findAssetDirs(srcRoot);
for (const dir of dirs) {
  const target = join(distRoot, relative(srcRoot, dir));
  await cp(dir, target, { recursive: true });
  console.log(`Sredstva: ${relative(apiRoot, dir)} → ${relative(apiRoot, target)}`);
}
if (dirs.length === 0) console.log('Sredstva: nič za kopirati.');
