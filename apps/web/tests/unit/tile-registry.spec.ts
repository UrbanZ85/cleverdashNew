import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILT_IN_TILE_TYPES } from '../../src/app/shared/tiles/tile-types.js';

// `tile-types.ts` in `TILE_REGISTRY` sta dva vira istega podatka — imen vgrajenih vrst ploščic.
// Ločena sta iz konkretnega razloga: register uvaža komponente, zato ga ploščica sama ne more
// uvoziti nazaj (krožni uvoz, ki ob neugodnem vrstnem redu nalaganja pade z `ReferenceError`).
//
// Cena te ločitve je, da se lahko razideta. Razhajanje ne bi povzročilo napake ob prevajanju:
// ploščica, ki je v registru ni na seznamu imen, se ne bi nikoli pojavila v razporeditvi, in
// obratno — ime brez komponente bi `dashboard.page.ts` tiho preskočil. Ta test je edino, kar
// stoji vmes.
//
// Register se tu bere kot BESEDILO in ne uvaža: uvoz bi potegnil za sabo komponente Ionica in
// s tem cel Angular, česar enotski testi v tem projektu namenoma ne delajo (brez TestBed).

// Pot je relativna na delovni imenik (`apps/web`), enako kot v tests/unit/index-html.spec.ts —
// `import.meta.url` v vitestovem preoblikovanem modulu ni naslov sheme `file:`.
const REGISTRY_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/app/shared/tiles/tile-registry.ts'),
  'utf8',
);

/** Vrste iz `TILE_REGISTRY`, po vrstnem redu zapisa. */
function typesFromRegistry(): string[] {
  const block = /export const TILE_REGISTRY[\s\S]*?\n\];/.exec(REGISTRY_SOURCE)?.[0] ?? '';
  return [...block.matchAll(/type:\s*'([^']+)'/g)].map((m) => m[1] as string);
}

describe('tile-types.ts se ujema s TILE_REGISTRY', () => {
  it('vsebuje iste vrste v istem vrstnem redu', () => {
    expect(typesFromRegistry()).toEqual([...BUILT_IN_TILE_TYPES]);
  });

  it('seznam ni prazen — prazen bi pomenil, da je razčlenitev odpovedala in test ničesar ne preverja', () => {
    expect(typesFromRegistry().length).toBeGreaterThan(0);
  });

  it('nobena vrsta se ne ponovi', () => {
    expect(new Set(BUILT_IN_TILE_TYPES).size).toBe(BUILT_IN_TILE_TYPES.length);
  });

  it('"plugin" NI vgrajena vrsta — vtičniki so ločena os', () => {
    expect(BUILT_IN_TILE_TYPES as readonly string[]).not.toContain('plugin');
  });
});
