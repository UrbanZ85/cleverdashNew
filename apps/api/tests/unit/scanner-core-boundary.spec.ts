import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 016, SC-003 in FR-001: jedro skenerjev NE sme poznati nobenega tipa po imenu. Lint pravilo
// `cleverdash/module-boundary` velja samo za `modules/` in `features/`; za `platform/scanner/`
// je ta test edina mreža. Preverja dvoje:
//  1. noben relativni uvoz iz `platform/scanner/**` ne razreši v `apps/api/src/modules/`;
//  2. besede "flight" v KODI jedra ni (komentarji so izvzeti — smejo navajati 015 kot izvor
//     preseljenih odločitev) — razen v `legacy-cleanup.service.ts`, ki sme našteti imena TREH
//     zastarelih zbirk modula 015, ki jih ob zagonu dropne (research.md §9).

const here = dirname(fileURLToPath(import.meta.url));
const apiSrc = resolve(here, '../../src');
const coreDir = resolve(apiSrc, 'platform/scanner');
const modulesDir = resolve(apiSrc, 'modules');

const LEGACY_EXCEPTION = 'services/legacy-cleanup.service.ts';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = walk(coreDir);

// Odstrani vrstične in bločne komentarje — ostane koda z nizi in identifikatorji.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"])\/\/.*$/gm, '$1');
}

describe('meja jedra skenerjev (platform/scanner)', () => {
  it('jedro obstaja in ni prazno', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it('noben uvoz ne razreši v apps/api/src/modules/', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const target = resolve(dirname(file), match[1]!);
        if (target.startsWith(modulesDir)) offenders.push(`${relative(apiSrc, file)} → ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('besede "flight" v kodi jedra ni (izjema: legacy-cleanup z imeni zastarelih zbirk)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = posix.normalize(relative(coreDir, file).replace(/\\/g, '/'));
      if (rel === LEGACY_EXCEPTION) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      if (/flight/i.test(code)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
