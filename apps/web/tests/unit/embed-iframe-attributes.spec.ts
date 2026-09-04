import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMBED_ALLOW, EMBED_REFERRER_POLICY } from '../../src/app/core/embeds/embed-address.js';

// Angular vezavo `referrerpolicy` in `allow` na <iframe> zavrne z NG0910 ("can be set on
// the <iframe> element as a static attribute only"). Napaka nastane med IZRISOM, ne pri
// prevajanju: `tsc` in eslint sta čista, v brskalniku pa ostane prazen okvir — pri vtičniku
// ga prestreže `app-tile-host` in nariše "Ploščica ne deluje", pri kameri ostane prazen
// prikaz. Prav to se je zgodilo, ko sta atributa dobila vezavo na konstanti iz core/embeds.
//
// Test bere IZVORNO DATOTEKO in komponente ne izriše: TestBed bi za ploščico zahteval
// PluginStore, HttpClient in Ionic, vprašanje pa je o zapisu v predlogi, ne o vedenju ob
// izrisu. Ker vezave ni več, se predloga vrednosti ne more "sama" naučiti — zato test
// hkrati čuva, da se predlogi ne razideta od kanoničnih vrednosti v core/embeds.

/** Vsi zasloni, ki vdelajo tujo stran. Nov tak zaslon sodi na ta seznam. */
const EMBEDDING_TEMPLATES: Record<string, string> = {
  'vtičnik vrste "Vdelana stran"': '../../src/app/features/dashboard/tiles/plugin-tile.component.ts',
  'vdelana kamera': '../../src/app/features/cameras/viewer/embedded-camera.component.ts',
};

/** Atributi <iframe>, ki jih Angular dovoli samo statično (@angular/compiler,
 * SecurityContext.ATTRIBUTE_NO_BINDING). */
const NO_BINDING_ATTRS = ['sandbox', 'allow', 'allowfullscreen', 'referrerpolicy', 'csp', 'fetchpriority'];

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Komentarji v teh datotekah govorijo O `<iframe>` in bi jih štetje oznak podvojilo. */
function code(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('atributi vdelanega <iframe>', () => {
  for (const [screen, relative] of Object.entries(EMBEDDING_TEMPLATES)) {
    describe(screen, () => {
      const source = code(read(relative));
      const iframes = countOf(source, '<iframe');

      it('ima vsaj en <iframe>', () => {
        expect(iframes).toBeGreaterThan(0);
      });

      it(`vsak <iframe> nosi statičen referrerpolicy="${EMBED_REFERRER_POLICY}"`, () => {
        expect(countOf(source, `referrerpolicy="${EMBED_REFERRER_POLICY}"`)).toBe(iframes);
      });

      it(`vsak <iframe> nosi statičen allow="${EMBED_ALLOW}"`, () => {
        expect(countOf(source, `allow="${EMBED_ALLOW}"`)).toBe(iframes);
      });

      it('nobenega od varnostno občutljivih atributov ne veže (NG0910)', () => {
        const lower = source.toLowerCase();
        for (const attr of NO_BINDING_ATTRS) {
          for (const binding of [`[${attr}]`, `[attr.${attr}]`]) {
            expect(lower.includes(binding), `vezava ${binding} — Angular jo zavrne z NG0910`).toBe(false);
          }
        }
      });
    });
  }
});
