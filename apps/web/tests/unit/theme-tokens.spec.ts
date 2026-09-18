import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Varovalo pred TIHO barvno napako, ki jo ne ujame ne typecheck ne lint.
//
// `var(--ion-color-step-50, #f7f7f7)` je videti kot pravilna raba Ionicove palete z varnim
// nadomestkom. Ni: Ionic 8 spremenljivk `--ion-color-step-*` NE definira nikjer — ne v
// `core.css` in ne v temni paleti `palettes/dark.class.css`. Uporabi se torej VEDNO nadomestek,
// ki je v vseh teh primerih svetel — tudi v temni temi, kjer je besedilo belo.
//
// Posledica je bila prava: naslov recepta je bil na kartici bel na skoraj belem in ga ni bilo
// mogoče prebrati. Napaka je vidna šele na zaslonu v temni temi, zato jo tu ujame test.
//
// Prava izbira so lastne spremenljivke te aplikacije (`--cd-surface`, `--cd-surface-raised`,
// `--cd-surface-sunken`, `--cd-divider`), ki so definirane za OBE temi v `theme/variables.scss`
// in zato nadomestka sploh ne potrebujejo.

const SRC = join(process.cwd(), 'src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') || full.endsWith('.scss') ? [full] : [];
  });
}

describe('barvne spremenljivke', () => {
  it('nikjer se ne uporablja --ion-color-step-*, ki je Ionic 8 ne definira', () => {
    const offenders = tsFiles(SRC)
      .filter((file) => !file.endsWith('theme-tokens.spec.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('--ion-color-step-'));

    expect(
      offenders.map((f) => f.replace(SRC, 'src')),
      'uporabi --cd-surface / --cd-surface-raised / --cd-surface-sunken / --cd-divider',
    ).toEqual([]);
  });

  it('theme/variables.scss definira lastne površine za OBE temi', () => {
    const css = readFileSync(join(SRC, 'theme', 'variables.scss'), 'utf8');
    for (const token of ['--cd-surface', '--cd-surface-raised', '--cd-surface-sunken', '--cd-divider']) {
      // Dvakrat: enkrat v svetli paleti, enkrat v `.ion-palette-dark`. Ena sama definicija bi
      // pomenila, da ena od tem nima svoje vrednosti — natanko napaka, ki jo ta datoteka lovi.
      const count = css.split(`${token}:`).length - 1;
      expect(count, `${token} mora biti definiran v obeh temah`).toBeGreaterThanOrEqual(2);
    }
  });
});
